"use client";

import { useEffect, useState } from "react";

import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import type { BusinessLine } from "@/services/businessLine.service";
import type { Branch } from "@/types/api";

export interface UseAllocationTargetsResult {
  businessLines: BusinessLine[];
  branches: Branch[];
  /** True until both requests have settled — success or refusal. */
  loading: boolean;
}

/**
 * The two lists an allocation rule can point at: the tenant's lines of business
 * and its branches.
 *
 * FETCHED TOGETHER because they are always wanted together and neither depends
 * on the other. They also answer a question the chart of accounts asks before it
 * renders a single row: how many of each does this tenant have? One line and one
 * branch means there is nothing to allocate at all, and the screen says so
 * rather than offering a choice with one option.
 *
 * `Promise.allSettled` RATHER THAN `Promise.all`, and that is the whole reason
 * this is not two hooks. `businessLines:read` and `branches:read` are separate
 * grants from `chartOfAccounts:read`, so a bookkeeper can legitimately hold the
 * third without the first two — and a chart of accounts that refused to render
 * over a missing label would be a screen broken by a permission it does not
 * need. A refused list comes back empty and the caller renders the absence.
 *
 * READ ONCE. Neither list changes while somebody edits a chart of accounts, and
 * re-reading them per keystroke would put two requests behind a search box.
 */
export function useAllocationTargets(): UseAllocationTargetsResult {
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      businessLineService.list({ limit: 100 }),
      branchService.list({ limit: 100 }),
    ]).then(([lineResult, branchResult]) => {
      if (!active) return;

      if (lineResult.status === "fulfilled") {
        setBusinessLines(lineResult.value.items);
      }
      if (branchResult.status === "fulfilled") {
        setBranches(branchResult.value.items);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  return { businessLines, branches, loading };
}
