"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";
import type { Branch } from "@/types/api";

interface UseWarehouseBranchesResult {
  branches: Branch[];
  loading: boolean;
  /** Non-null when the list failed to load — pickers show it as a hint. */
  error: string | null;
  /**
   * The display name for a warehouse's `defaultBranchId`.
   *
   * Returns null for an unassigned (central) warehouse, so the caller decides
   * how to render "no branch"; and a placeholder for an id that resolves to
   * nothing — which is a real state, not a bug: deleting a branch deliberately
   * leaves its warehouses standing, pointing at a branch this list no longer
   * contains.
   */
  branchName: (id: string | null) => string | null;
}

/**
 * Loads the tenant's branches once, for the warehouse screens.
 *
 * It exists because GET /warehouses returns `defaultBranchId` as a bare id — the
 * backend does not populate it — so both the table (a Branch column) and the
 * forms (a branch picker) need the branch list to say anything more useful than
 * an ObjectId. One fetch serves both, and the list is small and rarely-changing,
 * so there is no caching layer and no refetch. Mirrors useLookups in the users
 * feature.
 */
export function useWarehouseBranches(): UseWarehouseBranchesResult {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    branchService
      .list()
      .then((result) => {
        if (active) setBranches(result.items);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Could not load the branch list.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Rebuilt only when the list changes, so a table of 20 rows does 20 map reads
  // rather than 20 linear scans.
  const namesById = useMemo(
    () => new Map(branches.map((branch) => [branch._id, branch.name])),
    [branches],
  );

  const branchName = useCallback(
    (id: string | null) => {
      if (!id) return null;
      // While the branches are still in flight every id is "unknown"; saying so
      // would be a lie that corrects itself a moment later, so hold the id.
      if (loading) return "…";
      return namesById.get(id) ?? "Unknown branch";
    },
    [namesById, loading],
  );

  return { branches, loading, error, branchName };
}
