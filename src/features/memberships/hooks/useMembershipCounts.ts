"use client";

import { useEffect, useState } from "react";

import { membershipService } from "@/services/membership.service";
import type { PetMembershipListQuery } from "@/types/membership";

/** The Anggota pill row's lenses, each a list query the server can answer. */
export type MemberLens = "active" | "expiringSoon" | "unusedQuota" | "expired" | "paused" | "awaiting_payment";

/*
 * "Aktif" asks for `activeNotExpiring` (active, more than 14 days left) so a
 * card ending soon sits under "Segera berakhir" only — never counted twice.
 */
export const MEMBER_LENS_QUERY: Record<MemberLens, PetMembershipListQuery> = {
  active: { status: ["activeNotExpiring"] },
  expiringSoon: { status: ["expiringSoon"] },
  unusedQuota: { hasUnusedQuota: true },
  expired: { status: ["expired"] },
  paused: { status: ["paused"] },
  awaiting_payment: { status: ["awaiting_payment"] },
};

const LENSES = Object.keys(MEMBER_LENS_QUERY) as MemberLens[];

/**
 * How many cards sit behind each pill — `limit=1` per lens, reading
 * `pagination.total` (the contract's own recipe, §3.6). Six small requests,
 * made once when the screen opens; a lens that fails shows no number rather
 * than a wrong one.
 */
export function useMembershipCounts() {
  const [counts, setCounts] = useState<Partial<Record<MemberLens, number>>>({});

  useEffect(() => {
    let active = true;

    Promise.allSettled(
      LENSES.map((lens) =>
        membershipService.listMemberships({ ...MEMBER_LENS_QUERY[lens], page: 1, limit: 1 }),
      ),
    ).then((results) => {
      if (!active) return;
      const next: Partial<Record<MemberLens, number>> = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled") next[LENSES[index]] = result.value.pagination.total;
      });
      setCounts(next);
    });

    return () => {
      active = false;
    };
  }, []);

  return counts;
}
