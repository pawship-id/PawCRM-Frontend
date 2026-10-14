"use client";

import { PageTabs } from "@/components";
import {
  usePermissions,
  visibleTabs,
  type GatedTab,
} from "@/features/permissions";

import {
  MEMBERSHIP_CARDS_HREF,
  MEMBERSHIP_HREF,
  MEMBERSHIP_RENEWALS_HREF,
} from "../labels";

/**
 * The three sub-tabs of Membership: Paket, Kartu, Perpanjangan.
 *
 * REAL ROUTES, not `useState`, for the reasons the Pelanggan tabs above them
 * already are: a deep link, a per-screen permission gate, and a back button
 * that works. They sit UNDER the module's own tab row, which is why they are a
 * second, smaller row rather than four more entries on the first — "Kartu" is
 * not a sibling of "Pelanggan" and "Hewan", it is inside one of them.
 */
/** Membership's sub-tabs: Paket, and Kartu with Perpanjangan (one grant). */
export const MEMBERSHIP_TABS: GatedTab[] = [
  {
    label: "Paket",
    href: MEMBERSHIP_HREF,
    anyOf: [{ feature: "membershipPlans" }],
    /*
        EXACT, because the other two tabs are routes UNDER this one. Left
        prefix-matched it would sit underlined beside whichever of them the
        reader had actually opened — two current tabs, which says neither.
        Same reason Pelanggan carries it in the module header above.
      */
    exact: true,
  },
  {
    label: "Kartu",
    href: MEMBERSHIP_CARDS_HREF,
    anyOf: [{ feature: "petMemberships" }],
  },
  {
    label: "Perpanjangan",
    href: MEMBERSHIP_RENEWALS_HREF,
    anyOf: [{ feature: "petMemberships" }],
  },
];

export function MembershipSubTabs() {
  const { can } = usePermissions();
  const tabs = visibleTabs(MEMBERSHIP_TABS, can);

  return <PageTabs tabs={tabs} ariaLabel="Bagian membership" />;
}
