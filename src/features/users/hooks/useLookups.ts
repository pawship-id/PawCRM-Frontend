"use client";

import { useEffect, useState } from "react";

import { roleService } from "@/services/role.service";
import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";
import type { Role, Branch } from "@/types/api";

interface LookupsState {
  roles: Role[];
  branches: Branch[];
  loading: boolean;
  /** Non-null when either list failed to load — the form shows this. */
  error: string | null;
}

/**
 * Loads the roles and branches that the create/edit forms need for their
 * pickers, in parallel, once on mount.
 *
 * These are small, rarely-changing reference lists, so there is no caching layer
 * or refetch — a form mounts, fetches both, and is done. Both are fetched
 * together so a single `loading`/`error` gates the whole picker section.
 */
export function useLookups(): LookupsState {
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [roleResult, branchResult] = await Promise.all([
          roleService.list(),
          branchService.list(),
        ]);
        if (!active) return;
        setRoles(roleResult.items);
        setBranches(branchResult.items);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load roles and branches.",
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return { roles, branches, loading, error };
}
