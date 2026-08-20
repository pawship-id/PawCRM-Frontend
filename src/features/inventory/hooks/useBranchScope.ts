"use client";

import { useEffect, useMemo, useState } from "react";

import { branchService } from "@/services/branch.service";
import type { Branch } from "@/types/api";

/**
 * The three fields the filter below needs from a warehouse, structurally — so it
 * works with the full `Warehouse` and with the lookup's leaner `StockWarehouse`
 * alike.
 */
interface ScopedWarehouse {
  _id: string;
  isActive: boolean;
  defaultBranchId: string | null;
}

/**
 * What a branch may post at: its own warehouses, plus the shared ones.
 *
 * `defaultBranchId: null` is the central warehouse — it belongs to no branch and
 * serves all of them, so it appears under every choice. One pinned to another
 * branch does not appear at all: that pair is what the server refuses, and
 * offering it would only produce a rejection after the form was filled in.
 *
 * EMPTY BEFORE A BRANCH IS NAMED, rather than complete-then-narrowed, so a
 * warehouse cannot be chosen and then silently invalidated by a branch picked
 * after it.
 *
 * A plain function rather than part of the hook: it is a filter over data the
 * caller already holds, and putting it behind a hook would make the branch and
 * the warehouse list depend on each other in a circle.
 */
export function warehousesForBranch<T extends ScopedWarehouse>(
  branchId: string,
  warehouses: T[],
): T[] {
  if (branchId === "") return [];

  return warehouses.filter(
    (warehouse) =>
      warehouse.isActive &&
      (warehouse.defaultBranchId === branchId ||
        warehouse.defaultBranchId === null),
  );
}

interface UseBranchScopeResult {
  branches: Branch[];
  loading: boolean;
  /**
   * The one branch, when there is only one.
   *
   * ONE BRANCH IS NOT A CHOICE. A tenant with a single shop should not have to
   * open a dropdown with one option in it to reach the field below — the same
   * reasoning that already fills in a single warehouse. Empty when there are
   * several, because then it IS a choice and guessing would make it silently.
   */
  soleBranch: string;
}

/**
 * LOCATION FIRST, THEN THE SHELF — the order every hand-typed stock form asks
 * its two scoping questions in.
 *
 * WHY THIS WAY ROUND. Branch is a unit of bookkeeping and warehouse a unit of
 * stock, and the person filling in the form thinks in the first: they are
 * standing in, or answering for, a shop. Deriving the branch FROM the warehouse
 * — which is what these forms did first — asks the question backwards, and gives
 * one answer where a shared warehouse has several.
 *
 * WHAT A BRANCH MAY POST AT is its own warehouses plus the shared ones.
 * `defaultBranchId: null` is the central warehouse — it belongs to no branch and
 * serves all of them, so it appears under every choice. A warehouse pinned to
 * another branch does not appear at all: that is the mismatch the server
 * refuses, and offering it would only produce a rejection after the form was
 * filled in.
 *
 * NOTHING IS OFFERED BEFORE A BRANCH IS NAMED. The warehouse list is empty
 * rather than complete-then-narrowed, so a picker cannot be opened, a choice
 * made, and then silently invalidated by a branch chosen afterwards.
 *
 * THE BRANCH LIST FAILS SOFTLY, like every other lookup in this module: a user
 * may hold `stockMovements:create` without `branches:read`, and a form that
 * refused to render because a dropdown could not be filled would withhold the
 * whole document over one field.
 */
export function useBranchScope(): UseBranchScopeResult {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    branchService
      .list({ limit: 100 })
      .then((result) => {
        if (active) setBranches(result.items);
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
  }, []);

  const soleBranch = useMemo(
    () => (branches.length === 1 ? branches[0]._id : ""),
    [branches],
  );

  return { branches, loading, soleBranch };
}
