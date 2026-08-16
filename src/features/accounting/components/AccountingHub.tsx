"use client";

import Link from "next/link";

import { usePermissions } from "@/features/permissions";
import { formatMoney, sumDecimals } from "@/utils/decimal";

import { DUMMY_ACCOUNTS, DUMMY_ENTRIES } from "../data/dummy";
import { formatDate } from "../labels";
import { entryTotal } from "./JournalEntriesScreen";

/**
 * The Keuangan landing screen — the way in to the two accounting modules that
 * exist, and an honest statement about the ones that do not.
 *
 * IT REPLACED A SECTION PLACEHOLDER whose text promised cash flow, expenses and
 * financial reporting. Two of those three are still unbuilt, and a landing page
 * that lists features nobody can open is how a module gets reported as broken.
 * What is here now is what is here.
 *
 * THE COUNTS ARE ROW COUNTS AND ONE TOTAL, both derived from the fixtures — the
 * same rule the Purchasing hub follows. Anything grander (a P&L figure, a cash
 * position) would read as a report of the tenant's actual books while being a
 * property of the dummy data.
 */
const SECTIONS = [
  {
    href: "/dashboard/keuangan/chart-of-accounts",
    title: "Daftar Akun (COA)",
    description:
      "Fondasi pembukuan: setiap baris jurnal menunjuk salah satu akun di sini.",
    feature: "chartOfAccounts",
  },
  {
    href: "/dashboard/keuangan/journal-entries",
    title: "Jurnal Umum",
    description:
      "Buku besar tenant. Semua modul mencatat ke sini, dan laporan dibaca dari sini.",
    feature: "journalEntries",
  },
] as const;

export function AccountingHub() {
  const { can } = usePermissions();

  const sections = SECTIONS.filter((section) => can(section.feature, "read"));
  const latest = DUMMY_ENTRIES.slice(0, 5);

  const counts: Record<string, string> = {
    "/dashboard/keuangan/chart-of-accounts": `${DUMMY_ACCOUNTS.filter((account) => account.isActive).length} akun aktif`,
    "/dashboard/keuangan/journal-entries": `${DUMMY_ENTRIES.length} entri`,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Keuangan</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Pembukuan double-entry: daftar akun sebagai fondasinya, jurnal umum
          sebagai buku besarnya. Laporan laba rugi, neraca, dan arus kas nanti
          dibaca dari jurnal — belum dibuat di frontend.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm"
          >
            <p className="font-semibold text-foreground group-hover:text-primary-hover">
              {section.title}
            </p>
            <p className="mt-1.5 text-sm text-muted">{section.description}</p>
            <p className="mt-3 tabular-nums text-xs text-muted">
              {counts[section.href]}
            </p>
          </Link>
        ))}
      </div>

      {can("journalEntries", "read") && (
        <section className="flex flex-col rounded-xl border border-border bg-surface">
          <header className="flex items-baseline gap-2 border-b border-border px-5 py-3">
            <h2 className="font-bold">Entri terakhir</h2>
            <span className="text-xs text-muted">data contoh</span>
            <Link
              href="/dashboard/keuangan/journal-entries"
              className="ml-auto text-xs font-medium text-primary hover:text-primary-hover"
            >
              Lihat jurnal umum →
            </Link>
          </header>

          <ul className="divide-y divide-border/60">
            {latest.map((entry) => (
              <li key={entry._id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/keuangan/journal-entries/${entry._id}`}
                    className="block truncate text-sm font-medium hover:text-primary-hover"
                  >
                    {entry.description}
                  </Link>
                  <p className="truncate tabular-nums text-xs text-muted">
                    {entry.entryNumber} · {formatDate(entry.date)}
                  </p>
                </div>
                <span className="tabular-nums text-sm font-semibold">
                  {formatMoney(entryTotal(entry))}
                </span>
              </li>
            ))}
          </ul>

          <div className="border-t border-border px-5 py-2.5 text-right text-xs text-muted">
            Total {latest.length} entri terakhir{" "}
            <b className="ml-1 tabular-nums text-foreground">
              {formatMoney(sumDecimals(latest.map(entryTotal)))}
            </b>
          </div>
        </section>
      )}
    </div>
  );
}
