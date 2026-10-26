"use client";

import type { ReactNode } from "react";

import { PageTabs } from "@/components";
import {
  MEMBERSHIP_HREF,
  PROMOSI_SUMMARY_HREF,
} from "@/features/memberships/labels";
import {
  usePermissions,
  visibleTabs,
  type GatedTab,
} from "@/features/permissions";

/**
 * Promosi's tabs (16 October 2026). V1 carries Ringkasan and Membership only;
 * Loyalti, Promo and Voucher join this list when their screens exist.
 *
 * Ringkasan opens with the membership report grant or the card grant (the
 * renewal list lives there); Membership with either of its sub-tabs' grants,
 * and is NOT exact — it stays underlined on Paket, Anggota and every detail
 * route under them.
 */
export const PROMOSI_TABS: GatedTab[] = [
  {
    label: "Ringkasan",
    href: PROMOSI_SUMMARY_HREF,
    exact: true,
    anyOf: [{ feature: "membershipReports" }, { feature: "petMemberships" }],
  },
  {
    label: "Membership",
    href: MEMBERSHIP_HREF,
    anyOf: [{ feature: "membershipPlans" }, { feature: "petMemberships" }],
  },
];

/**
 * The head of the Promosi module, shared by every tab under it — the title and
 * the tab row. Same arrangement as CustomerModuleHeader: one header rendered
 * from each tab's page, so the routes read as the one module the rail says
 * they are.
 */
export function PromosiModuleHeader({
  /** The create button for the tab you are on — "+ Paket". */
  action,
}: {
  action?: ReactNode;
}) {
  const { can } = usePermissions();
  const tabs = visibleTabs(PROMOSI_TABS, can);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Promosi</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Paket membership hewan dan anggotanya. Semua jatah dan potongan
            member di kasir dan booking diatur dari sini.
          </p>
        </div>
        {action && <div className="ml-auto flex flex-none gap-2">{action}</div>}
      </div>

      <PageTabs tabs={tabs} ariaLabel="Bagian promosi" />
    </div>
  );
}
