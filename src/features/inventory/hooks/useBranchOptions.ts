"use client";

import { useEffect, useState } from "react";

import { branchService } from "@/services/branch.service";
import { useAuth } from "@/features/auth";
import { accessibleBranches } from "@/utils/accessScope";
import type { Branch } from "@/types/api";

interface UseBranchOptionsResult {
  branches: Branch[];
  loading: boolean;
}

/**
 * Just the branch names, for labelling rows that name a warehouse.
 *
 * A LOT HAS NO BRANCH OF ITS OWN. It belongs to a warehouse, and the warehouse
 * carries the soft link (`defaultBranchId`, PCR-019) — so a screen that wants to
 * say which shop a lot sits in resolves it in two steps, exactly as the stock
 * card does when it groups a product's stock by branch.
 *
 * NARROWED TO THE BRANCHES THIS USER HOLDS, like `useBranchScope` and every
 * other lookup in this module. A COURTESY, NOT THE ISOLATION — the server
 * narrows the rows and refuses an out-of-scope filter on its own. It matters on
 * both jobs this list does: a picker must not offer a branch whose only possible
 * outcome is a 403, and a label has nothing to name from a row the server would
 * not have sent in the first place.
 *
 * IT FAILS SOFTLY AND SILENTLY. `branches:read` is a separate grant from the one
 * that opens the batch report, so a role can legitimately hold the second
 * without the first — and a red alert over a column that degrades to an em dash
 * would report a problem the user cannot act on. An empty list is the answer;
 * the caller renders the absence.
 */
export function useBranchOptions(enabled = true): UseBranchOptionsResult {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  // Starts idle when disabled, so a caller does not hold a cell on "…" for a
  // request that is never made.
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    branchService
      .list({ limit: 100 })
      .then((result) => {
        if (active) setBranches(accessibleBranches(user, result.items));
      })
      .catch(() => {
        if (active) setBranches([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled, user]);

  return { branches, loading };
}
