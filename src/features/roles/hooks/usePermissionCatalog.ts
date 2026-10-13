"use client";

import { useEffect, useState } from "react";

import { roleService } from "@/services/role.service";
import { ApiError } from "@/services/api-error";
import type {
  PermissionGrant,
  PermissionModule,
  RoleTemplate,
} from "@/types/api";

interface CatalogState {
  /** Every feature and the actions it supports — drives the permissions matrix. */
  features: PermissionGrant[];
  /** The modul → layar tree; empty when the backend predates it. */
  modules: PermissionModule[];
  /** Starting points for a new role (Kasir, Admin Gudang, …). */
  templates: RoleTemplate[];
  loading: boolean;
  /** Non-null when the catalog failed to load — the form shows this. */
  error: string | null;
}

/**
 * Loads the RBAC permission catalog the create/edit permission matrix needs,
 * once on mount.
 *
 * The catalog is small, tenant-agnostic and rarely changing, so there is no
 * caching layer or refetch — mirrors useLookups. Fetching it (rather than
 * hard-coding a copy) keeps the editor's vocabulary in lock-step with the
 * backend catalog that validates every write.
 */
export function usePermissionCatalog(): CatalogState {
  const [features, setFeatures] = useState<PermissionGrant[]>([]);
  const [modules, setModules] = useState<PermissionModule[]>([]);
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    roleService
      .catalog()
      .then((result) => {
        if (!active) return;
        setFeatures(result.features);
        setModules(result.modules ?? []);
        setTemplates(result.templates ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load the permission catalog.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { features, modules, templates, loading, error };
}
