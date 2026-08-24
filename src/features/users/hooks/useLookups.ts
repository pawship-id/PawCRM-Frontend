"use client";

import { useEffect, useState } from "react";

import { roleService } from "@/services/role.service";
import { branchService } from "@/services/branch.service";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import type { Role, Branch, Warehouse } from "@/types/api";

interface LookupsState {
  roles: Role[];
  branches: Branch[];
  /**
   * Every live warehouse of the tenant, unfiltered. The scope picker groups
   * them by `defaultBranchId` itself, and needs the shared ones (that id is
   * null) to say so on screen — a per-branch fetch would return neither the
   * grouping nor them.
   */
  warehouses: Warehouse[];
  loading: boolean;
  /** Non-null when any list failed to load — the form shows this. */
  error: string | null;
}

/**
 * Loads the roles, branches and warehouses that the create/edit forms need for
 * their pickers, in parallel, once on mount.
 *
 * These are small, rarely-changing reference lists, so there is no caching layer
 * or refetch — a form mounts, fetches all three, and is done. They are fetched
 * together so a single `loading`/`error` gates the whole picker section, and
 * because the warehouse picker is meaningless without the branch list it nests
 * under.
 */
export function useLookups(): LookupsState {
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [roleResult, branchResult, warehouseResult] = await Promise.all([
          roleService.list(),
          branchService.list(),
          // Active only: scoping a user to a closed location grants access to
          // nothing and hides the mistake until someone reopens it.
          warehouseService.list({ isActive: true }),
        ]);
        if (!active) return;
        setRoles(roleResult.items);
        setBranches(branchResult.items);
        setWarehouses(warehouseResult.items);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load roles, branches and warehouses.",
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return { roles, branches, warehouses, loading, error };
}
