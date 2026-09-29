"use client";

import { PageTabs, type PageTab } from "@/components";

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
export function MembershipSubTabs() {
  const tabs: PageTab[] = [
    {
      label: "Paket",
      href: MEMBERSHIP_HREF,
      /*
        EXACT, because the other two tabs are routes UNDER this one. Left
        prefix-matched it would sit underlined beside whichever of them the
        reader had actually opened — two current tabs, which says neither.
        Same reason Pelanggan carries it in the module header above.
      */
      exact: true,
    },
    { label: "Kartu", href: MEMBERSHIP_CARDS_HREF },
    { label: "Perpanjangan", href: MEMBERSHIP_RENEWALS_HREF },
  ];

  return (
    <PageTabs tabs={tabs} ariaLabel="Bagian membership" />
  );
}
