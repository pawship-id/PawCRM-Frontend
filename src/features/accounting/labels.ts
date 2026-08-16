import type { AccountType, CashflowType, JournalSourceType } from "@/types/accounting";

/**
 * The words and colours the accounting screens share.
 *
 * ONE PLACE, because both screens name the same things: the COA colours an
 * account class and the ledger colours a source, and a badge whose wording drifts
 * between two tables reads as two different systems. Everything here is a lookup
 * keyed by an enum the backend owns, so adding a value there fails to compile
 * until it is named here too.
 */

/** Account classes, in the order the accounting equation reads them. */
export const ACCOUNT_TYPES: AccountType[] = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: "Aset",
  liability: "Kewajiban",
  equity: "Ekuitas",
  income: "Pendapatan",
  expense: "Beban",
};

/**
 * Tones follow the balance sheet, not decoration: what the business owns reads
 * one way, what it owes another, and the two P&L classes are the pair a shop
 * owner compares — income against expense.
 */
export const ACCOUNT_TYPE_TONE: Record<AccountType, string> = {
  asset: "bg-tint-info text-info",
  liability: "bg-tint-danger text-danger",
  // The one warm badge: an orange FILL with navy ink, never orange text (§4).
  equity: "bg-tint-warning text-secondary-foreground",
  income: "bg-tint-success text-success",
  expense: "bg-tint-neutral text-muted",
};

/**
 * Where an entry came from. `manual` is the only one a person typed; the rest
 * name the module that posted it service-to-service, which is exactly the
 * question somebody reading an unfamiliar entry asks first.
 */
export const SOURCE_LABEL: Record<JournalSourceType, string> = {
  pos: "POS",
  invoice: "Faktur",
  receipt: "Penerimaan kas",
  goods_receipt: "Penerimaan barang",
  purchase_payment: "Bayar supplier",
  opname: "Stok opname",
  return: "Retur",
  commission: "Komisi",
  manual: "Manual",
};

export const SOURCE_TONE: Record<JournalSourceType, string> = {
  pos: "bg-primary/10 text-primary",
  invoice: "bg-primary/10 text-primary",
  receipt: "bg-success/12 text-success",
  goods_receipt: "bg-secondary/25 text-secondary-foreground",
  purchase_payment: "bg-danger/10 text-danger",
  opname: "bg-accent text-muted-foreground",
  return: "bg-accent text-muted-foreground",
  commission: "bg-accent text-muted-foreground",
  // Manual entries are the ones an auditor looks at first — a human chose both
  // sides — so they are the only source that carries an outline instead of a
  // fill, which is what makes them findable while scrolling.
  manual: "border-border text-foreground",
};

export const CASHFLOW_LABEL: Record<CashflowType, string> = {
  operating: "Operasi",
  investing: "Investasi",
  financing: "Pendanaan",
};

/**
 * A date-only ISO string ("2026-08-07") rendered as "07 Agu 2026".
 *
 * Parses the YYYY-MM-DD parts by hand rather than through `new Date(iso)`, which
 * reads a bare date as UTC midnight and would print the day before for anyone
 * west of Greenwich. A transaction date is a calendar date, not an instant.
 */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

export function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  const index = Number(month) - 1;
  if (!year || !MONTHS[index] || !day) return iso;
  return `${day} ${MONTHS[index]} ${year}`;
}

/** The month an entry belongs to, e.g. "Agustus 2026" — the ledger's grouping. */
const LONG_MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function formatMonth(iso: string): string {
  const [year, month] = iso.slice(0, 10).split("-");
  const index = Number(month) - 1;
  if (!year || !LONG_MONTHS[index]) return iso;
  return `${LONG_MONTHS[index]} ${year}`;
}
