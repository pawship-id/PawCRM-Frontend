"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { membershipService } from "@/services/membership.service";
import type {
  MembershipPlan,
  MembershipPlanListQuery,
  Pagination,
} from "@/types/membership";

export const PLAN_PAGE_SIZE = 20;

export const DEFAULT_PLANS_QUERY: MembershipPlanListQuery = {
  page: 1,
  limit: PLAN_PAGE_SIZE,
  sort: "newest",
};

/**
 * A page of membership packages, from GET /membership-plans.
 *
 * `reload` IS THE POINT rather than an afterthought: every action on this list —
 * retiring a package, deleting one, restoring one — writes and then needs the
 * page re-read, and a hook that only fetched on mount would leave the table
 * showing what was true before the click.
 */
export function useMembershipPlans(initial: MembershipPlanListQuery = DEFAULT_PLANS_QUERY) {
  const [query, setQuery] = useState<MembershipPlanListQuery>(initial);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;

    // The sanctioned fetch-effect shape: flag the load, then synchronize with
    // the server, `active` guarding the late setStates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    membershipService
      .listPlans(query)
      .then((result) => {
        if (!active) return;
        setPlans(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setPlans([]);
        setPagination(null);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat paket membership. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query, nonce]);

  /**
   * Any change to a filter returns to page 1.
   *
   * Without it, narrowing a six-page list while standing on page 4 lands on an
   * empty page and reads as "no results" — a bug that only ever appears to
   * somebody who has scrolled, which is to say never in testing.
   */
  const patchQuery = useCallback((patch: MembershipPlanListQuery) => {
    setQuery((current) => ({
      ...current,
      ...patch,
      page: patch.page ?? 1,
    }));
  }, []);

  return { plans, pagination, loading, error, query, patchQuery, reload };
}
