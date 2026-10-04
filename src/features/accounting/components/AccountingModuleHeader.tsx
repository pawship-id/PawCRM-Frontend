"use client";

import type { ReactNode } from "react";

import { Breadcrumb, PageTabs, type PageTab } from "@/components";
import { usePermissions } from "@/features/permissions";

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
export function AccountingModuleHeader({
  /** The create affordance for the tab you are on — not every tab has one. */
  action,
}: {
  action?: ReactNode;
}) {
  const { can } = usePermissions();

  const tabs: PageTab[] = [
    // EXACT: its href is the prefix of all three siblings.
    { label: "Ringkasan", href: "/dashboard/keuangan", exact: true },
    /*
      KAS & BANK — where the money sits, and everything that moved it. Second,
      beside Ringkasan, because it is the tab a shop opens daily.

      TRANSAKSI USED TO BE A TAB OF ITS OWN and is now the first of its two
      SUB-tabs (16 September 2026, with the mockup): a list of movements is only
      readable next to the accounts they moved through, and two module tabs that
      answered halves of one question meant picking the right one before you
      could look. The old route redirects, query and all.

      EITHER GRANT OPENS IT, because the page is two halves: the channel table
      needs `paymentChannels:read` and the list needs `cashTransactions:read`,
      and each is gated again inside. Requiring only the first would have taken
      the transaction list away from everyone who could read it before the move.
    */
    ...(can("paymentChannels", "read") || can("cashTransactions", "read")
      ? [{ label: "Kas & Bank", href: "/dashboard/keuangan/kas-bank" }]
      : []),
    /*
      GATED ON `users:read`, not on a finance grant, and that is the screen's own
      rule rather than this row's: Komisi IS payroll — it names every groomer
      and what they are owed — so whoever may read the staff register may read
      it, and a bookkeeper who may not is not shown the door.
    */
    ...(can("users", "read")
      ? [{ label: "Komisi", href: "/dashboard/keuangan/komisi" }]
      : []),
    ...(can("journalEntries", "read")
      ? [{ label: "Jurnal", href: "/dashboard/keuangan/journal-entries" }]
      : []),
  ];

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
