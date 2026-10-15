"use client";

import type { ReactNode } from "react";

import { Breadcrumb, PageTabs } from "@/components";
import {
  usePermissions,
  visibleTabs,
  type GatedTab,
} from "@/features/permissions";

/**
 * The head of the Keuangan module, worn by its tabs.
 *
 * THE MOCKUP HAS FOUR, and the module had seven rows before this: Lini Bisnis,
 * Laba Rugi and Arus Kas are not tabs. Their screens are untouched and their
 * routes still work — they are reached from the Ringkasan tab's card list until
 * the homes the mockup gives them exist (`Pengaturan › Keuangan` for Lini
 * Bisnis, `Laporan` for the other two). A tab row that matched the mockup while
 * quietly stranding three screens would be the wrong kind of faithful.
 *
 * DAFTAR AKUN IS NO LONGER A TAB. It was one from 12 September 2026, as a
 * stopgap: the mockup files it under Pengaturan, that section did not exist yet,
 * and a card at the foot of Ringkasan was too far down for the screen every
 * journal line depends on. It moved on 20 September, on request, to
 * /dashboard/pengaturan/daftar-akun — the old address redirects, and Ringkasan's
 * card list still reaches it, which is how the other three non-tab screens are
 * reached too.
 *
 * KOMISI MOVED HOUSE, AND THEN WAS REBUILT. The per-groomer recap moved here
 * from the reports hub (its old route still redirects); on 21 September 2026 it
 * was replaced by the mockup's screen — one row per booking × groomer, with
 * approval and payment — which lives in `features/commissions`.
 *
 * NO TILE ROW. The Ringkasan tab IS the module's tile row — SummaryCards, margin
 * insights and recent transactions, all scoped by its own period picker. A
 * second, unscoped set up here would be two answers to one question, which is
 * the trap the Stok header avoided for the same reason.
 */
/**
 * Keuangan's tabs, each opened by its own "Lihat" (14 October 2026).
 *
 * Kas & Bank opens with either of its two sub-tabs' grants — Transaksi or Biaya
 * Tetap — and the channel table inside it keeps `paymentChannels:read`.
 */
export const ACCOUNTING_TABS: GatedTab[] = [
  // EXACT: its href is the prefix of every sibling.
  {
    label: "Ringkasan",
    href: "/dashboard/keuangan",
    exact: true,
    anyOf: [{ feature: "financeSummary" }],
  },
  {
    label: "Kas & Bank",
    href: "/dashboard/keuangan/kas-bank",
    anyOf: [{ feature: "cashTransactions" }, { feature: "fixedCosts" }],
  },
  { label: "Komisi", href: "/dashboard/keuangan/komisi", anyOf: [{ feature: "commissionReports" }] },
  { label: "Jurnal", href: "/dashboard/keuangan/journal-entries", anyOf: [{ feature: "journalEntries" }] },
];

export function AccountingModuleHeader({
  /** The create affordance for the tab you are on — not every tab has one. */
  action,
}: {
  action?: ReactNode;
}) {
  const { can } = usePermissions();

  const tabs = visibleTabs(ACCOUNTING_TABS, can);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <Breadcrumb items={[{ label: "Keuangan" }]} />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Keuangan
          </h1>
        </div>
        {action && <div className="ml-auto flex flex-none gap-2">{action}</div>}
      </div>

      <PageTabs tabs={tabs} ariaLabel="Bagian keuangan" />
    </div>
  );
}
