"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { membershipService } from "@/services/membership.service";
import type {
  Pagination,
  PetMembership,
  PetMembershipListQuery,
} from "@/types/membership";

export const CARD_PAGE_SIZE = 20;

export const DEFAULT_CARDS_QUERY: PetMembershipListQuery = {
  page: 1,
  limit: CARD_PAGE_SIZE,
  sort: "newest",
};

/**
 * A page of membership CARDS, from GET /pet-memberships.
 *
 * `mode` PICKS THE ENDPOINT, and the two are deliberately not one query:
 *
 *   "list"     — GET /pet-memberships, everything, filterable by status.
 *   "expiring" — GET /pet-memberships/expiring, which is ordered by urgency and
 *                carries the OWNER'S PHONE on every row. The renewal screen
 *                exists to have a conversation, and a list of names without
 *                numbers is a second lookup per row.
 */
export function usePetMemberships(
  initial: PetMembershipListQuery = DEFAULT_CARDS_QUERY,
  mode: "list" | "expiring" = "list",
) {
  const [query, setQuery] = useState<PetMembershipListQuery>(initial);
  const [memberships, setMemberships] = useState<PetMembership[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const request =
      mode === "expiring"
        ? membershipService.expiring({
            page: query.page,
            limit: query.limit,
            withinDays: query.expiringWithinDays ?? 30,
          })
        : membershipService.listMemberships(query);

    request
      .then((result) => {
        if (!active) return;
        setMemberships(result.items);
        setPagination(result.pagination);
      })
      .catch((err) => {
        if (!active) return;
        setMemberships([]);
        setPagination(null);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat kartu membership. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query, nonce, mode]);

  const patchQuery = useCallback((patch: PetMembershipListQuery) => {
    setQuery((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  }, []);

  return { memberships, pagination, loading, error, query, patchQuery, reload };
}
