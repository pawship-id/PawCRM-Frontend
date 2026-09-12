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
 * DAFTAR AKUN IS A TAB, added 12 September 2026 on request. The mockup files it
 * under `Pengaturan › Keuangan`, which is not built, and a card at the foot of
 * Ringkasan was too far down for the screen every journal line depends on.
 *
 * KOMISI IS THE ONE TAB THAT MOVED HOUSE. The recap already existed as a card on
 * the reports hub; the mockup files it under Keuangan, so its route moved to
 * /dashboard/keuangan/komisi and the old one redirects. The screen itself is
 * unchanged, and the reports hub still links to it — from a report's point of
 * view nothing happened but an address change.
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
      TRANSAKSI — every numbered movement of money in one list: receipts,
      supplier and commission payments, till payments, expenses. Second, beside
      Ringkasan, because it is the tab a shop opens daily.
    */
    ...(can("cashTransactions", "read")
      ? [{ label: "Transaksi", href: "/dashboard/keuangan/transaksi" }]
      : []),
    ...(can("paymentChannels", "read")
      ? [{ label: "Kas & Bank", href: "/dashboard/keuangan/kas-bank" }]
      : []),
    /*
      GATED ON `users:read`, not on a finance grant, and that is the screen's own
      rule rather than this row's: the recap IS payroll — it names every groomer
      and what they are owed — so whoever may read the staff register may read
      it, and a bookkeeper who may not is not shown the door.
    */
    ...(can("users", "read")
      ? [{ label: "Komisi", href: "/dashboard/keuangan/komisi" }]
      : []),
    // Before Jurnal, the order the sidebar's comment gives: a journal line has
    // nowhere to land without an account.
    ...(can("chartOfAccounts", "read")
      ? [{ label: "Daftar Akun", href: "/dashboard/keuangan/chart-of-accounts" }]
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
