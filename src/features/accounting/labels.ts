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
  // "Kasir", not "POS" — ui-rules §12 lists POS among the words the product
  // does not use. The route and the source type keep their identifiers.
  pos: "Kasir",
  pos_cogs: "HPP kasir",
  invoice: "Faktur",
  receipt: "Penerimaan kas",
  goods_receipt: "Penerimaan barang",
  purchase_payment: "Bayar supplier",
  opname: "Stok opname",
  return: "Retur",
  return_cogs: "HPP retur",
  commission: "Komisi",
  manual: "Manual",
};

/**
 * NAMED TINTS, not opacity arithmetic (§9). These read the same as before, but
 * `bg-success/12` composites over whatever is behind it — and a badge sitting on
 * a hovered or selected row went muddy, which is exactly the case a status badge
 * has to survive. The `bg-tint-*` tokens are opaque.
 */
export const SOURCE_TONE: Record<JournalSourceType, string> = {
  pos: "bg-tint-brand text-primary",
  // The same tone as its revenue half, deliberately: the two entries are one
  // sale, and tinting the cost side differently would suggest another event.
  pos_cogs: "bg-tint-brand text-primary",
  invoice: "bg-tint-brand text-primary",
  receipt: "bg-tint-success text-success",
  goods_receipt: "bg-tint-warning text-secondary-foreground",
  purchase_payment: "bg-tint-danger text-danger",
  opname: "bg-tint-neutral text-muted",
  return: "bg-tint-neutral text-muted",
  // The same tone as its refund half, the way `pos_cogs` shares `pos`: the two
  // entries are one return, and a second tint would read as another event.
  return_cogs: "bg-tint-neutral text-muted",
  commission: "bg-tint-neutral text-muted",
  // Manual entries are the ones an auditor looks at first — a human chose both
  // sides — so they are the only source that carries an outline instead of a
  // fill, which is what makes them findable while scrolling.
  manual: "border border-border text-foreground",
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
