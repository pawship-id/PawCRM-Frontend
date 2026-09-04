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
  hub: { label: "Keuangan", href: "/dashboard/keuangan" },
  profitLoss: {
    label: "Laba Rugi",
    href: "/dashboard/keuangan/laba-rugi",
  },
  cashflow: {
    label: "Arus Kas",
    href: "/dashboard/keuangan/arus-kas",
  },
  accounts: {
    label: "Daftar Akun",
    href: "/dashboard/keuangan/chart-of-accounts",
  },
  journal: {
    label: "Jurnal Umum",
    href: "/dashboard/keuangan/journal-entries",
  },
  businessLines: {
    label: "Lini Bisnis",
    href: "/dashboard/keuangan/business-lines",
  },
} satisfies Record<string, Crumb>;
