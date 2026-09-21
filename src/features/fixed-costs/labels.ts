import type { FixedCostInterval, FixedCostKind } from "@/types/accounting";

/**
 * The words Biaya Tetap is read in. Bahasa Indonesia, per §12 — the API's own
 * vocabulary (`expense`, `monthly`) stays in the API.
 */

export const FIXED_COSTS_HREF = "/dashboard/keuangan/kas-bank/biaya-tetap";

export function fixedCostHref(id: string): string {
  return `${FIXED_COSTS_HREF}/${id}`;
}

/**
 * TIPE — the same two words as the Transaksi table's own filter, the cards
 * above it and a transaction's heading. One screen names one thing one way.
 */
export const KIND_LABEL: Record<FixedCostKind, string> = {
  other_income: "Uang masuk",
  expense: "Uang keluar",
};

/** The badge in the mockup's Tipe column, which is shorter than the filter's. */
export const KIND_BADGE: Record<FixedCostKind, string> = {
  other_income: "Masuk",
  expense: "Keluar",
};

export const INTERVAL_LABEL: Record<FixedCostInterval, string> = {
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
  yearly: "Tahunan",
};

/**
 * KATEGORI — the mockup's column, from the counter accounts. One is named and
 * several are counted: a cell printing the first of three misfiles the rest.
 */
export function categoryLabel(
  counterAccounts: { name: string }[],
): string | null {
  if (counterAccounts.length === 0) return null;
  if (counterAccounts.length === 1) return counterAccounts[0].name;
  return `${counterAccounts.length} akun`;
}

/** "12 Sep 2026" — the same short form the Transaksi table uses. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * WHAT THE DUE DATE MEANS TODAY, in words.
 *
 * `dueCount` comes from the server, which derives it against its own clock —
 * never a stored flag, which would be wrong from the moment the date passed
 * until something wrote to the row.
 */
export function dueLabel(
  fixedCost: { dueCount: number; isActive: boolean },
): { text: string; tone: "danger" | "warning" | "muted" } | null {
  if (!fixedCost.isActive) return null;
  if (fixedCost.dueCount <= 0) return null;
  if (fixedCost.dueCount === 1) {
    return { text: "Jatuh tempo", tone: "warning" };
  }
  // Plural is a COUNT, not a tone change for its own sake: three unpaid months
  // is a different problem from one, and the screen should not hide the two.
  return { text: `${fixedCost.dueCount}× belum dicatat`, tone: "danger" };
}
