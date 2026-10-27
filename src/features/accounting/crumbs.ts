import type { Crumb } from "@/components";

/**
 * The ancestors every accounting trail is built from.
 *
 * LABELS MATCH THE SIDEBAR EXACTLY (features/dashboard/nav.ts) — a user who
 * clicked "Jurnal Umum" in the menu should read "Jurnal Umum" in the trail;
 * renaming one and not the other makes them read as two different places. Same
 * contract as features/purchasing/crumbs.ts.
 *
 * These are ANCESTORS only, so each carries an href. The crumb for the page you
 * are on is written inline at the page WITHOUT one — that is what marks it as
 * the current one. See components/Breadcrumb.
 */
export const ACCOUNTING_CRUMBS = {
  hub: { label: "Keuangan", href: "/dashboard/finance" },
  /**
   * Kas & Bank — and the trail a transaction hangs from, since Transaksi became
   * its first sub-tab rather than a tab of its own.
   */
  cashBank: {
    label: "Kas & Bank",
    href: "/dashboard/finance/cash-bank",
  },
  profitLoss: {
    label: "Laba Rugi",
    href: "/dashboard/finance/profit-loss",
  },
  balanceSheet: {
    label: "Neraca",
    href: "/dashboard/finance/balance-sheet",
  },
  /**
   * THE ONE ENTRY THAT IS NOT UNDER /keuangan — the chart of accounts moved to
   * Pengaturan on 20 September 2026, per the BO mockup. It stays in this map
   * because it is still the accounting feature's screen and half a dozen files
   * link to it from inside the module; the old address redirects.
   */
  accounts: {
    label: "Daftar Akun",
    href: "/dashboard/settings/chart-of-accounts",
  },
  journal: {
    // "Jurnal", the tab's own name — the mockup's trail and the tab it came
    // from read the same word (21 September 2026).
    label: "Jurnal",
    href: "/dashboard/finance/journal-entries",
  },
  /**
   * Also under Pengaturan since 22 September 2026, beside Daftar Akun — the
   * mockup files it there. Same reason `accounts` is in this map.
   */
  businessLines: {
    label: "Lini Bisnis",
    href: "/dashboard/settings/business-lines",
  },
} satisfies Record<string, Crumb>;
