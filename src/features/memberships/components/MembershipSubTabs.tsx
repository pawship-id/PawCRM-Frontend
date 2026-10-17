"use client";

import { PageTabs } from "@/components";
import {
  usePermissions,
  visibleTabs,
  type GatedTab,
} from "@/features/permissions";

import { MEMBERSHIP_CARDS_HREF, MEMBERSHIP_HREF } from "../labels";

/**
 * The two sub-tabs of Promosi › Membership: Paket and Anggota.
 *
 * REAL ROUTES, not `useState`, for the reasons the Promosi tabs above them
 * already are: a deep link, a per-screen permission gate, and a back button
 * that works. They sit UNDER the module's own tab row, which is why they are a
 * second, smaller row — "Anggota" is not a sibling of "Ringkasan", it is
 * inside Membership.
 *
 * PERPANJANGAN IS NO LONGER A TAB (16 October 2026): the renewal call list is
 * folded into Promosi › Ringkasan and into the "Segera berakhir" status on
 * Anggota. Ringkasan's "Perlu tindakan" panel (GET /pet-memberships/attention)
 * replaced the old `RenewalPanel`.
 */
export const MEMBERSHIP_TABS: GatedTab[] = [
  {
    label: "Paket",
    href: MEMBERSHIP_HREF,
    anyOf: [{ feature: "membershipPlans" }],
    /*
      EXACT, because Anggota is a route UNDER this one. Left prefix-matched it
      would sit underlined beside Anggota — two current tabs, which says
      neither.
    */
    exact: true,
  },
  {
    label: "Anggota",
    href: MEMBERSHIP_CARDS_HREF,
    anyOf: [{ feature: "petMemberships" }],
  },
];

export function MembershipSubTabs() {
  const { can } = usePermissions();
  const tabs = visibleTabs(MEMBERSHIP_TABS, can);

  return <PageTabs tabs={tabs} ariaLabel="Bagian membership" />;
}
