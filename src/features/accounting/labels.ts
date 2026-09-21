import type {
  AccountCategory,
  AccountType,
  CashflowType,
  JournalSourceType,
} from "@/types/accounting";
import { accountTypeOf, CATEGORY_CODE } from "@/types/accounting";

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
 * THE CATEGORIES, in the order the reports read them: the neraca top to bottom
 * (what the business owns, what it owes, what is left), then the laba rugi top
 * to bottom (revenue, cost of sales, operating cost, and the two non-operating
 * buckets that land below laba usaha).
 *
 * THE ORDER IS THE REPORTS' GRAMMAR, not a preference — the same reason
 * ACCOUNT_TYPES above is in accounting-equation order. Every screen that lists
 * categories walks this array, so a category added on the server lands in the
 * right place everywhere at once.
 *
 * Mirrors ACCOUNT_CATEGORIES in the backend model. `Record<AccountCategory, …>`
 * below is what keeps the two honest: adding a value to the union in
 * types/accounting.ts fails to compile until it is named here too.
 */
export const ACCOUNT_CATEGORIES: AccountCategory[] = [
  "cash_bank",
  "piutang_dagang",
  "persediaan",
  "aset_lancar_lainnya",
  "aset_tetap",
  "investasi_jangka_panjang",
  "hutang_dagang",
  "hutang_lainnya",
  "hutang_jangka_panjang",
  "modal",
  "pendapatan",
  "hpp",
  "biaya",
  "pendapatan_lainnya",
  "biaya_lainnya",
];

/**
 * BO's own wording, kept verbatim — "Cash & Bank" is English in a list that is
 * otherwise Indonesian because that is what the tenant's accountant asked for
 * and what the reference chart says. Renaming it to "Kas & Bank" here would make
 * the screen and the specification disagree about the same row.
 */
export const ACCOUNT_CATEGORY_LABEL: Record<AccountCategory, string> = {
  cash_bank: "Cash & Bank",
  piutang_dagang: "Piutang Dagang",
  persediaan: "Persediaan",
  aset_lancar_lainnya: "Aset Lancar Lainnya",
  aset_tetap: "Aset Tetap",
  investasi_jangka_panjang: "Investasi Jangka Panjang",
  hutang_dagang: "Hutang Dagang",
  hutang_lainnya: "Hutang Lainnya",
  hutang_jangka_panjang: "Hutang Jangka Panjang",
  modal: "Modal",
  pendapatan: "Pendapatan",
  hpp: "Harga Pokok Penjualan",
  biaya: "Biaya",
  pendapatan_lainnya: "Pendapatan Lainnya",
  biaya_lainnya: "Biaya Lainnya",
};

/**
 * A category as it reads in a picker: `"110 - Cash & Bank"`.
 *
 * THE NUMBER LEADS, which is the whole point of showing it: somebody holding a
 * chart of accounts on paper — BO's, or one exported from Jubelio — is looking
 * DOWN a column of numbers, and a label that puts its number last cannot be
 * scanned that way.
 *
 * A FUNCTION RATHER THAN A SECOND MAP, so the number and the label cannot drift
 * into two spellings of one row. `ACCOUNT_CATEGORY_LABEL` stays the plain name
 * for the places that show a category as a badge or a heading, where a leading
 * number would be noise.
 */
export function accountCategoryOption(category: AccountCategory): string {
  return `${CATEGORY_CODE[category]} - ${ACCOUNT_CATEGORY_LABEL[category]}`;
}

/**
 * One line saying what lands in a category, shown under the picker once a
 * choice is made.
 *
 * WHY THE FORM NEEDS IT AT ALL: the whole point of categories is that somebody
 * who is not an accountant can file an account correctly, and "Biaya Lainnya"
 * alone does not tell them it means the non-operating ones. The two "Lainnya"
 * pairs are the ones people actually get wrong, so their hints name the examples
 * BO gave rather than restating the label.
 */
export const ACCOUNT_CATEGORY_HINT: Record<AccountCategory, string> = {
  cash_bank: "Kas di laci, rekening bank, dan saldo yang menunggu diteruskan.",
  piutang_dagang: "Tagihan ke pelanggan yang belum dibayar.",
  persediaan: "Barang dagangan yang masih di gudang.",
  aset_lancar_lainnya:
    "Aset lancar di luar tiga di atas — misalnya PPN Masukan atau uang muka.",
  aset_tetap:
    "Barang pakai jangka panjang: kendaraan, peralatan, renovasi. Penyusutan belum dihitung sistem.",
  investasi_jangka_panjang: "Penempatan dana jangka panjang di luar usaha.",
  hutang_dagang: "Utang ke supplier atas barang yang dibeli.",
  hutang_lainnya:
    "Kewajiban jangka pendek lain — utang gaji, PPN Keluaran, utang komisi.",
  hutang_jangka_panjang: "Pinjaman yang jatuh temponya lebih dari setahun.",
  modal: "Modal disetor pemilik. Laba berjalan masuk sendiri, tidak perlu akun.",
  pendapatan:
    "Penjualan utama — barang dan jasa. Diskon dan retur ikut di sini sebagai pengurang.",
  hpp: "Harga pokok barang atau jasa yang terjual. Dipotong dari pendapatan jadi laba kotor.",
  biaya: "Biaya operasional harian: gaji, sewa, listrik, pemasaran, komisi.",
  pendapatan_lainnya:
    "Pemasukan di luar penjualan utama — ongkos kirim yang ditagih di faktur, selisih opname yang plus.",
  biaya_lainnya:
    "Biaya di luar operasional — biaya bank, biaya lain di faktur, selisih opname yang minus.",
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
 * A category's badge tone INHERITS ITS CLASS's, deliberately.
 *
 * Fifteen distinct colours would make the chart a paint chart: nobody can hold
 * fifteen hues in mind, and the distinction people actually read off a colour is
 * the one below — what the business owns, what it owes, what it earned, what it
 * spent. The category is already spelled out in the badge's own text.
 */
export function accountCategoryTone(category: AccountCategory): string {
  return ACCOUNT_TYPE_TONE[accountTypeOf(category)];
}

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
  // "HPP faktur", paired with "Faktur" the way "HPP kasir" pairs with "Kasir":
  // a reader scanning the ledger sees the two halves of one invoice as one act.
  invoice_cogs: "HPP faktur",
  invoice: "Faktur",
  receipt: "Penerimaan kas",
  goods_receipt: "Penerimaan barang",
  purchase_payment: "Bayar supplier",
  opname: "Stok opname",
  return: "Retur",
  return_cogs: "HPP retur",
  commission: "Komisi",
  commission_payment: "Bayar komisi",
  expense: "Pengeluaran",
  other_income: "Pemasukan lain",
  // "Jurnal manual", the mockup's word — and not bare "Manual", which the
  // Kas & Bank list already uses for a hand-typed TRANSACTION. A journal list
  // that said "Manual" too would put one word on two different things.
  manual: "Jurnal manual",
};

/**
 * NAMED TINTS, not opacity arithmetic (§9). These read the same as before, but
 * `bg-success/12` composites over whatever is behind it — and a badge sitting on
 * a hovered or selected row went muddy, which is exactly the case a status badge
 * has to survive. The `bg-tint-*` tokens are opaque.
 */
/**
 * The label for a source type, falling back to the raw value.
 *
 * WHY THIS EXISTS. `SOURCE_TYPES` on the server and `JournalSourceType` here are
 * two lists, and NOTHING checks that they agree. When `invoice_cogs` shipped on
 * the server the union here still had ten types, so the ledger rendered those
 * rows with an EMPTY Sumber column — quieter than a crash and worse: a reader
 * cannot tell an unfamiliar source from an entry that genuinely has none.
 *
 * A ledger row is a fact that already happened; the list has to draw it whether
 * or not this build recognises where it came from.
 */
export function sourceLabel(type: JournalSourceType): string {
  return SOURCE_LABEL[type] ?? type;
}

export const SOURCE_TONE: Record<JournalSourceType, string> = {
  pos: "bg-tint-brand text-primary",
  // The same tone as its revenue half, deliberately: the two entries are one
  // sale, and tinting the cost side differently would suggest another event.
  pos_cogs: "bg-tint-brand text-primary",
  invoice: "bg-tint-brand text-primary",
  // The same tone as its revenue half — one invoice, two entries.
  invoice_cogs: "bg-tint-brand text-primary",
  receipt: "bg-tint-success text-success",
  goods_receipt: "bg-tint-warning text-secondary-foreground",
  purchase_payment: "bg-tint-danger text-danger",
  opname: "bg-tint-neutral text-muted",
  return: "bg-tint-neutral text-muted",
  // The same tone as its refund half, the way `pos_cogs` shares `pos`: the two
  // entries are one return, and a second tint would read as another event.
  return_cogs: "bg-tint-neutral text-muted",
  commission: "bg-tint-neutral text-muted",
  // The same tone as the accrual it settles, the way `return_cogs` shares
  // `return`: they are two halves of one commission, and a second tint would
  // read as an unrelated event.
  commission_payment: "bg-tint-neutral text-muted",
  // Money out and money in, tinted like the payments beside them.
  expense: "bg-tint-danger text-danger",
  other_income: "bg-tint-success text-success",
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
