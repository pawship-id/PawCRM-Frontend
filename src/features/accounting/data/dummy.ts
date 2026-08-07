import type {
  AccountType,
  ChartOfAccount,
  JournalEntry,
} from "@/types/accounting";

/**
 * Fixtures for the two accounting screens, standing in for the API.
 *
 * WHY THESE EXIST. `/api/chart-of-accounts` and `/api/journal-entries` are both
 * live, but nothing in this frontend authenticates against a tenant whose books
 * have been posted to yet — wiring the screens straight through today renders an
 * empty COA and an empty ledger, which shows the layout and none of the
 * behaviour the screens exist to demonstrate: a hierarchy read by account
 * number, a source badge explaining where an entry came from, and a reversal
 * pair sitting next to each other in the same list.
 *
 * READ-ONLY, AND DELIBERATELY SO. Unlike the inventory demo store, nothing here
 * mutates: the ledger is immutable once posted and the COA's write paths are the
 * backend's to enforce (an account code is immutable on a seeded account, a
 * parent must share its child's type, an entry is corrected by reversal and
 * never by an edit). A frontend fake that let a user "post" an entry would be
 * teaching a workflow the API does not have.
 *
 * FAITHFUL TO THE BACKEND, on purpose:
 *   - money is a decimal STRING, never a float;
 *   - every entry carries at least two lines and Σdebit === Σcredit;
 *   - exactly one of debit/credit is non-zero on a line;
 *   - `source.type: "manual"` is the only kind a human could have authored here;
 *     the rest were posted by the module that owns the document;
 *   - the reversal pair (JE-2026-07-0041 / -0042) points both ways, which is how
 *     the real `reversedByEntryId` / `reversesEntryId` are written.
 *
 * Codes marked `isDefault` are the ones src/seeds/defaultAccounts.js writes into
 * every tenant — they are what inventory, purchasing and POS resolve against.
 */

/** Root, group and leaf accounts, in account-number order — how a COA is read. */
export const DUMMY_ACCOUNTS: ChartOfAccount[] = [
  // 1xxx — Aset
  acc("1000", "Aset", "asset", null),
  acc("1100", "Aset Lancar", "asset", "1000"),
  acc("1101", "Kas", "asset", "1100", { isDefault: true }),
  acc("1102", "Bank", "asset", "1100", { isDefault: true }),
  acc("1103", "Piutang Usaha", "asset", "1100", { isDefault: true }),
  acc("1200", "Persediaan", "asset", "1000"),
  acc("1201", "Persediaan Barang Dagangan", "asset", "1200", {
    isDefault: true,
  }),
  acc("1300", "Pajak Dibayar di Muka", "asset", "1000"),
  acc("1301", "PPN Masukan", "asset", "1300", { isDefault: true }),
  acc("1400", "Aset Tetap", "asset", "1000"),
  acc("1401", "Peralatan Grooming", "asset", "1400"),
  acc("1402", "Akumulasi Penyusutan Peralatan", "asset", "1400"),

  // 2xxx — Kewajiban
  acc("2000", "Kewajiban", "liability", null),
  acc("2100", "Utang Jangka Pendek", "liability", "2000"),
  acc("2101", "Utang Supplier", "liability", "2100", { isDefault: true }),
  acc("2102", "Utang Gaji & Komisi", "liability", "2100"),
  acc("2103", "PPN Keluaran", "liability", "2100"),

  // 3xxx — Ekuitas
  acc("3000", "Ekuitas", "equity", null),
  acc("3101", "Modal Pemilik", "equity", "3000"),
  acc("3201", "Laba Ditahan", "equity", "3000"),

  // 4xxx — Pendapatan
  acc("4000", "Pendapatan", "income", null),
  acc("4101", "Penjualan", "income", "4000", { isDefault: true }),
  acc("4102", "Pendapatan Grooming", "income", "4000"),
  acc("4103", "Pendapatan Pet Hotel", "income", "4000"),
  acc("4901", "Pendapatan Lain-lain", "income", "4000", { isDefault: true }),

  // 5xxx — Beban
  acc("5000", "Beban", "expense", null),
  acc("5101", "Harga Pokok Penjualan", "expense", "5000", { isDefault: true }),
  acc("5201", "Kerugian Persediaan", "expense", "5000", { isDefault: true }),
  acc("5301", "Beban Gaji & Komisi", "expense", "5000"),
  acc("5302", "Beban Sewa", "expense", "5000"),
  acc("5303", "Beban Listrik & Air", "expense", "5000"),
  // Deactivated rather than deleted: it still explains the entries posted
  // against it last year, but must not be offered for a new posting. That the
  // two states are orthogonal is the point of showing one here.
  acc("5304", "Beban Penyusutan", "expense", "5000", { isActive: false }),
];

/**
 * The ledger, newest transaction first — the order the list endpoint returns.
 *
 * Every source type the backend defines appears at least once, because the
 * badge column is most of what the screen is for: an entry nobody typed still
 * has to explain itself.
 */
export const DUMMY_ENTRIES: JournalEntry[] = [
  entry({
    _id: "je-0047",
    entryNumber: "JE-2026-08-0007",
    date: "2026-08-07",
    description: "Penjualan POS — kasir Kemang shift pagi",
    branchName: "Cabang Kemang",
    source: { type: "pos", id: "pos-0143", reference: "POS-2026-08-0143" },
    cashflowType: "operating",
    createdByName: null,
    lines: [
      line("1101", "385000", "0", "Tunai + QRIS"),
      line("4101", "0", "350000", "Retail", "Pakan & aksesoris"),
      line("2103", "0", "35000", null, "PPN keluaran 10%"),
      line("5101", "210000", "0", "Retail", "HPP rata-rata tertimbang"),
      line("1201", "0", "210000", null, "Stok keluar 6 item"),
    ],
  }),
  entry({
    _id: "je-0046",
    entryNumber: "JE-2026-08-0006",
    date: "2026-08-06",
    description: "Penerimaan barang dari PT Sumber Pakan Nusantara",
    branchName: "Cabang Kemang",
    source: {
      type: "goods_receipt",
      id: "gr-0021",
      reference: "RCP-2026-08-0021",
    },
    cashflowType: null,
    createdByName: null,
    lines: [
      line("1201", "4500000", "0", null, "30 karung Royal Canin 3kg"),
      line("1301", "495000", "0", null, "PPN masukan 11%"),
      line("2101", "0", "4995000", null, "Termin 30 hari"),
    ],
  }),
  entry({
    _id: "je-0045",
    entryNumber: "JE-2026-08-0005",
    date: "2026-08-05",
    description: "Pembayaran faktur pembelian PINV-2026-07-0018",
    branchName: "Cabang Kemang",
    source: {
      type: "purchase_payment",
      id: "pay-0033",
      reference: "PINV-2026-07-0018",
    },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    lines: [
      line("2101", "3200000", "0", null, "Pelunasan penuh"),
      line("1102", "0", "3200000", null, "Transfer BCA a/n PT Sumber Pakan"),
    ],
  }),
  entry({
    _id: "je-0044",
    entryNumber: "JE-2026-08-0004",
    date: "2026-08-04",
    description: "Faktur grooming korporat — Klinik Hewan Sentosa",
    branchName: "Cabang BSD",
    source: { type: "invoice", id: "inv-0009", reference: "INV-2026-08-0009" },
    cashflowType: null,
    createdByName: "Dimas Prasetyo",
    lines: [
      line("1103", "2750000", "0", null, "Jatuh tempo 18 Agu 2026"),
      line("4102", "0", "2500000", "Grooming", "25 ekor paket full grooming"),
      line("2103", "0", "250000", null, "PPN keluaran 10%"),
    ],
  }),
  entry({
    _id: "je-0043",
    entryNumber: "JE-2026-08-0003",
    date: "2026-08-03",
    description: "Pelunasan piutang faktur INV-2026-07-0031",
    branchName: "Cabang BSD",
    source: { type: "receipt", id: "rcpt-0031", reference: "INV-2026-07-0031" },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    lines: [
      line("1102", "1650000", "0", null, "Transfer masuk BCA"),
      line("1103", "0", "1650000", null, "Piutang lunas"),
    ],
  }),
  entry({
    _id: "je-0042",
    entryNumber: "JE-2026-08-0002",
    date: "2026-08-02",
    description: "Beban sewa ruko Kemang — Agustus 2026",
    branchName: "Cabang Kemang",
    source: { type: "manual", id: null, reference: null },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    tags: ["operasional", "sewa"],
    attachmentUrl: "https://files.pawship.id/bukti/sewa-agustus-2026.pdf",
    recurring: { enabled: true, interval: "monthly" },
    lines: [
      line("5302", "12000000", "0", null, "Sewa bulan ke-8"),
      line("1102", "0", "12000000", null, "Transfer ke pemilik ruko"),
    ],
  }),
  entry({
    _id: "je-0041",
    entryNumber: "JE-2026-08-0001",
    date: "2026-08-01",
    description: "Selisih kurang stok opname gudang Kemang",
    branchName: "Cabang Kemang",
    source: { type: "opname", id: "opn-0004", reference: "OPN-2026-07-0004" },
    cashflowType: null,
    createdByName: null,
    lines: [
      line("5201", "320000", "0", null, "4 item hilang / rusak"),
      line("1201", "0", "320000", null, "Penyesuaian ke hasil hitung fisik"),
    ],
  }),
  entry({
    _id: "je-0040",
    entryNumber: "JE-2026-07-0044",
    date: "2026-07-31",
    description: "Komisi groomer periode Juli 2026",
    branchName: "Cabang BSD",
    source: { type: "commission", id: "comm-0007", reference: null },
    cashflowType: null,
    createdByName: null,
    lines: [
      line("5301", "1850000", "0", "Grooming", "6 groomer"),
      line("2102", "0", "1850000", null, "Dibayar bersama gaji Agustus"),
    ],
  }),
  entry({
    _id: "je-0039",
    entryNumber: "JE-2026-07-0043",
    date: "2026-07-30",
    description: "Retur penjualan — pakan salah varian",
    branchName: "Cabang Kemang",
    source: { type: "return", id: "sr-0002", reference: "RTN-2026-07-0002" },
    cashflowType: "operating",
    createdByName: null,
    lines: [
      line("4101", "180000", "0", "Retail", "Pembatalan penjualan"),
      line("1101", "0", "180000", null, "Uang dikembalikan tunai"),
      line("1201", "108000", "0", null, "Barang masuk kembali"),
      line("5101", "0", "108000", "Retail", "Pembalikan HPP"),
    ],
  }),
  // The reversal and the entry it undoes, adjacent on purpose: this is what a
  // correction looks like in an immutable ledger, and both stay visible.
  entry({
    _id: "je-0038",
    entryNumber: "JE-2026-07-0042",
    date: "2026-07-29",
    description: "Pembalikan JE-2026-07-0041 — nominal listrik salah input",
    branchName: "Cabang Kemang",
    source: { type: "manual", id: null, reference: null },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    tags: ["koreksi"],
    reversesEntryId: "je-0037",
    lines: [
      line("1102", "1250000", "0", null, "Pembalikan"),
      line("5303", "0", "1250000", null, "Pembalikan"),
    ],
  }),
  entry({
    _id: "je-0037",
    entryNumber: "JE-2026-07-0041",
    date: "2026-07-29",
    description: "Beban listrik & air Juli 2026",
    branchName: "Cabang Kemang",
    source: { type: "manual", id: null, reference: null },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    tags: ["operasional"],
    reversedByEntryId: "je-0038",
    lines: [
      line("5303", "1250000", "0", null, "Nominal keliru — seharusnya 125.000"),
      line("1102", "0", "1250000", null, "Autodebet PLN"),
    ],
  }),
  entry({
    _id: "je-0036",
    entryNumber: "JE-2026-07-0040",
    date: "2026-07-28",
    description: "Penjualan POS — kasir BSD shift sore",
    branchName: "Cabang BSD",
    source: { type: "pos", id: "pos-0139", reference: "POS-2026-07-0139" },
    cashflowType: "operating",
    createdByName: null,
    lines: [
      line("1101", "742500", "0", null, "Tunai + kartu debit"),
      line("4101", "0", "475000", "Retail", "Pakan & vitamin"),
      line("4102", "0", "200000", "Grooming", "2 paket basic grooming"),
      line("2103", "0", "67500", null, "PPN keluaran 10%"),
      line("5101", "285000", "0", "Retail", "HPP rata-rata tertimbang"),
      line("1201", "0", "285000", null, "Stok keluar 9 item"),
    ],
  }),
  entry({
    _id: "je-0035",
    entryNumber: "JE-2026-07-0039",
    date: "2026-07-27",
    description: "Setoran modal pemilik untuk renovasi cabang BSD",
    branchName: "Cabang BSD",
    source: { type: "manual", id: null, reference: null },
    cashflowType: "financing",
    createdByName: "Rani Oktaviani",
    tags: ["modal"],
    lines: [
      line("1102", "25000000", "0", null, "Transfer masuk dari rekening owner"),
      line("3101", "0", "25000000", null, "Tambahan modal disetor"),
    ],
  }),
  entry({
    _id: "je-0034",
    entryNumber: "JE-2026-07-0038",
    date: "2026-07-26",
    description: "Faktur penitipan hewan — 5 kamar, 4 malam",
    branchName: "Cabang Kemang",
    source: { type: "invoice", id: "inv-0008", reference: "INV-2026-07-0038" },
    cashflowType: null,
    createdByName: "Dimas Prasetyo",
    lines: [
      line("1103", "3300000", "0", null, "Jatuh tempo 9 Agu 2026"),
      line("4103", "0", "3000000", "Pet Hotel", "5 kamar × 4 malam"),
      line("2103", "0", "300000", null, "PPN keluaran 10%"),
    ],
  }),
];

/* ------------------------------------------------------------------ lookup */

/** Accounts keyed by id — how a journal line resolves the account it names. */
export const ACCOUNTS_BY_ID = new Map(
  DUMMY_ACCOUNTS.map((account) => [account._id, account]),
);

/** One entry by id, for the detail screen. Null when the id is unknown. */
export function findEntry(entryId: string): JournalEntry | null {
  return DUMMY_ENTRIES.find((item) => item._id === entryId) ?? null;
}

/** The entry number for a linked id (a reversal pair), or null. */
export function entryNumberOf(entryId: string | null): string | null {
  if (!entryId) return null;
  return findEntry(entryId)?.entryNumber ?? null;
}

/* -------------------------------------------------------------- fixtures */

/**
 * The account id is derived from the code rather than invented, so a line can
 * name "1101" and stay readable in this file. The real API returns ObjectIds and
 * the screens never assume otherwise — they resolve through ACCOUNTS_BY_ID.
 */
function accountId(code: string): string {
  return `acc-${code}`;
}

function acc(
  code: string,
  name: string,
  accountType: AccountType,
  parentCode: string | null,
  options: { isDefault?: boolean; isActive?: boolean } = {},
): ChartOfAccount {
  return {
    _id: accountId(code),
    code,
    name,
    accountType,
    parentAccountId: parentCode ? accountId(parentCode) : null,
    isDefault: options.isDefault ?? false,
    isActive: options.isActive ?? true,
  };
}

/** One journal line, written as `(account code, debit, credit)`. */
function line(
  code: string,
  debit: string,
  credit: string,
  businessLine: string | null = null,
  memo: string | null = null,
): JournalEntry["lines"][number] {
  return { accountId: accountId(code), debit, credit, businessLine, memo };
}

/** Fills the fields most entries leave at their default. */
function entry(
  input: Pick<
    JournalEntry,
    | "_id"
    | "entryNumber"
    | "date"
    | "description"
    | "branchName"
    | "source"
    | "lines"
    | "cashflowType"
    | "createdByName"
  > &
    Partial<JournalEntry>,
): JournalEntry {
  return {
    _id: input._id,
    entryNumber: input.entryNumber,
    date: input.date,
    description: input.description,
    branchName: input.branchName,
    source: input.source,
    lines: input.lines,
    cashflowType: input.cashflowType,
    createdByName: input.createdByName,
    tags: input.tags ?? [],
    attachmentUrl: input.attachmentUrl ?? null,
    recurring: input.recurring ?? { enabled: false, interval: null },
    reversedByEntryId: input.reversedByEntryId ?? null,
    reversesEntryId: input.reversesEntryId ?? null,
    // The row was written the day the transaction happened, except where a
    // fixture says otherwise — `date` and `createdAt` genuinely differ in real
    // life (a payment taken on the 30th, keyed in on the 3rd) and the detail
    // screen shows both.
    createdAt: input.createdAt ?? input.date,
  };
}
