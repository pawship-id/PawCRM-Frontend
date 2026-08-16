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
  acc("5305", "Beban Pemasaran", "expense", "5000"),
  // The one expense class that is almost always attributable to a line: shampoo
  // belongs to grooming, pakan and laundry to the hotel. It exists so the
  // dashboard's per-line margins are not an artefact of every cost landing in
  // the shared bucket.
  acc("5306", "Beban Perlengkapan Layanan", "expense", "5000"),
];

/**
 * The ledger, newest transaction first — the order the list endpoint returns.
 *
 * Every source type the backend defines appears at least once, because the
 * badge column is most of what the screen is for: an entry nobody typed still
 * has to explain itself.
 */
export const DUMMY_ENTRIES: JournalEntry[] = [
  // ---------------------------------------------------------------- Agustus
  //
  // A FULL MONTH, added for the Keuangan dashboard. The seven entries below
  // these were enough to show a ledger — a source badge, a reversal pair — but
  // not enough to derive a month's figures from: three transactions against one
  // 12-juta rent posting reads as a business losing money, which is a property
  // of the fixture rather than of anything the screen does.
  //
  // POS HERE IS A DAILY RECAP, not a per-shift row like JE-2026-08-0007. Both
  // patterns are real — a shop either posts each shift or closes the day into
  // one entry — and a fixture that only had the first would need 300 rows to
  // add up to a month.
  //
  // PAYROLL IS SPLIT PER LINE (0020–0023) on purpose. Posted as one lump it
  // lands in the shared bucket, and every service line then shows an 80 % margin
  // it has not earned. Only the office half is genuinely unattributable.
  entry({
    _id: "je-0070",
    entryNumber: "JE-2026-08-0030",
    date: "2026-08-31",
    description: "Pelunasan piutang penitipan INV-2026-08-0009",
    branchName: "Cabang Kemang",
    source: { type: "receipt", id: "rcpt-0042", reference: "INV-2026-08-0009" },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    lines: [
      line("1102", "9900000", "0", null, "Transfer masuk BCA"),
      line("1103", "0", "9900000", null, "Piutang lunas"),
    ],
  }),
  entry({
    _id: "je-0069",
    entryNumber: "JE-2026-08-0029",
    date: "2026-08-30",
    description: "Rekap penjualan POS harian — BSD",
    branchName: "Cabang BSD",
    source: { type: "pos", id: "pos-0198", reference: "POS-2026-08-0198" },
    cashflowType: "operating",
    createdByName: null,
    lines: [
      line("1101", "14520000", "0", null, "Tunai + QRIS + kartu"),
      line("4101", "0", "7800000", "Retail", "Pakan, vitamin & aksesoris"),
      line("4102", "0", "5400000", "Grooming", "18 ekor"),
      line("2103", "0", "1320000", null, "PPN keluaran 10%"),
      line("5101", "4680000", "0", "Retail", "HPP rata-rata tertimbang"),
      line("1201", "0", "4680000", null, "Stok keluar"),
    ],
  }),
  entry({
    _id: "je-0068",
    entryNumber: "JE-2026-08-0028",
    date: "2026-08-29",
    description: "Beban pemasaran — konten & iklan Agustus",
    branchName: "Cabang Kemang",
    source: { type: "manual", id: null, reference: null },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    tags: ["pemasaran"],
    lines: [
      line("5305", "2400000", "0", null, "Iklan lokal + endorse"),
      line("1102", "0", "2400000", null, "Transfer ke agensi"),
    ],
  }),
  entry({
    _id: "je-0067",
    entryNumber: "JE-2026-08-0027",
    date: "2026-08-28",
    description: "Faktur penitipan korporat — Komunitas Anjing Ras BSD",
    branchName: "Cabang BSD",
    source: { type: "invoice", id: "inv-0012", reference: "INV-2026-08-0012" },
    cashflowType: null,
    createdByName: "Dimas Prasetyo",
    lines: [
      line("1103", "7700000", "0", null, "Jatuh tempo 11 Sep 2026"),
      line("4103", "0", "7000000", "Pet Hotel", "10 kamar × 3 malam"),
      line("2103", "0", "700000", null, "PPN keluaran 10%"),
    ],
  }),
  entry({
    _id: "je-0066",
    entryNumber: "JE-2026-08-0026",
    date: "2026-08-27",
    description: "Komisi groomer periode Agustus 2026",
    branchName: "Cabang BSD",
    source: { type: "commission", id: "comm-0009", reference: null },
    cashflowType: null,
    createdByName: null,
    lines: [
      line("5301", "3900000", "0", "Grooming", "7 groomer"),
      line("2102", "0", "3900000", null, "Dibayar bersama gaji September"),
    ],
  }),
  entry({
    _id: "je-0065",
    entryNumber: "JE-2026-08-0025",
    date: "2026-08-26",
    description: "Rekap penjualan POS harian — Kemang",
    branchName: "Cabang Kemang",
    source: { type: "pos", id: "pos-0191", reference: "POS-2026-08-0191" },
    cashflowType: "operating",
    createdByName: null,
    lines: [
      line("1101", "15950000", "0", null, "Tunai + QRIS + kartu"),
      line("4101", "0", "8600000", "Retail", "Pakan, pasir & mainan"),
      line("4102", "0", "5900000", "Grooming", "21 ekor"),
      line("2103", "0", "1450000", null, "PPN keluaran 10%"),
      line("5101", "5160000", "0", "Retail", "HPP rata-rata tertimbang"),
      line("1201", "0", "5160000", null, "Stok keluar"),
    ],
  }),
  entry({
    _id: "je-0064",
    entryNumber: "JE-2026-08-0024",
    date: "2026-08-25",
    description: "Laundry & kebersihan kandang pet hotel",
    branchName: "Cabang Kemang",
    source: { type: "manual", id: null, reference: null },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    tags: ["operasional"],
    lines: [
      line("5306", "3500000", "0", "Pet Hotel", "Vendor laundry mingguan"),
      line("1101", "0", "3500000", null, "Tunai"),
    ],
  }),
  entry({
    _id: "je-0063",
    entryNumber: "JE-2026-08-0023",
    date: "2026-08-24",
    description: "Gaji staf kantor & admin — Agustus 2026",
    branchName: "Cabang Kemang",
    source: { type: "manual", id: null, reference: null },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    tags: ["gaji"],
    recurring: { enabled: true, interval: "monthly" },
    lines: [
      line("5301", "5000000", "0", null, "Admin, kasir pusat, kurir"),
      line("1102", "0", "5000000", null, "Payroll transfer BCA"),
    ],
  }),
  entry({
    _id: "je-0062",
    entryNumber: "JE-2026-08-0022",
    date: "2026-08-24",
    description: "Gaji tim retail & kasir — Agustus 2026",
    branchName: "Cabang Kemang",
    source: { type: "manual", id: null, reference: null },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    tags: ["gaji"],
    recurring: { enabled: true, interval: "monthly" },
    lines: [
      line("5301", "6000000", "0", "Retail", "4 staf toko"),
      line("1102", "0", "6000000", null, "Payroll transfer BCA"),
    ],
  }),
  entry({
    _id: "je-0061",
    entryNumber: "JE-2026-08-0021",
    date: "2026-08-24",
    description: "Gaji tim pet hotel — Agustus 2026",
    branchName: "Cabang Kemang",
    source: { type: "manual", id: null, reference: null },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    tags: ["gaji"],
    recurring: { enabled: true, interval: "monthly" },
    lines: [
      line("5301", "7000000", "0", "Pet Hotel", "5 penjaga kandang"),
      line("1102", "0", "7000000", null, "Payroll transfer BCA"),
    ],
  }),
  entry({
    _id: "je-0060",
    entryNumber: "JE-2026-08-0020",
    date: "2026-08-24",
    description: "Gaji tim grooming — Agustus 2026",
    branchName: "Cabang Kemang",
    source: { type: "manual", id: null, reference: null },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    tags: ["gaji"],
    recurring: { enabled: true, interval: "monthly" },
    lines: [
      line("5301", "10000000", "0", "Grooming", "7 groomer + 2 asisten"),
      line("1102", "0", "10000000", null, "Payroll transfer BCA"),
    ],
  }),
  entry({
    _id: "je-0059",
    entryNumber: "JE-2026-08-0019",
    date: "2026-08-23",
    description: "Penitipan walk-in akhir pekan — BSD",
    branchName: "Cabang BSD",
    source: { type: "pos", id: "pos-0184", reference: "POS-2026-08-0184" },
    cashflowType: "operating",
    createdByName: null,
    lines: [
      line("1101", "7150000", "0", null, "Tunai + QRIS"),
      line("4103", "0", "6500000", "Pet Hotel", "13 kamar × 2 malam"),
      line("2103", "0", "650000", null, "PPN keluaran 10%"),
    ],
  }),
  entry({
    _id: "je-0058",
    entryNumber: "JE-2026-08-0018",
    date: "2026-08-21",
    description: "Penerimaan barang dari CV Anugerah Petshop",
    branchName: "Cabang Kemang",
    source: {
      type: "goods_receipt",
      id: "gr-0026",
      reference: "RCP-2026-08-0026",
    },
    cashflowType: null,
    createdByName: null,
    lines: [
      line("1201", "9000000", "0", null, "Pakan, pasir & vitamin"),
      line("1301", "990000", "0", null, "PPN masukan 11%"),
      line("2101", "0", "9990000", null, "Termin 30 hari"),
    ],
  }),
  entry({
    _id: "je-0057",
    entryNumber: "JE-2026-08-0017",
    date: "2026-08-20",
    description: "Rekap penjualan POS harian — BSD",
    branchName: "Cabang BSD",
    source: { type: "pos", id: "pos-0176", reference: "POS-2026-08-0176" },
    cashflowType: "operating",
    createdByName: null,
    lines: [
      line("1101", "13860000", "0", null, "Tunai + QRIS + kartu"),
      line("4101", "0", "7400000", "Retail", "Pakan & perawatan"),
      line("4102", "0", "5200000", "Grooming", "17 ekor"),
      line("2103", "0", "1260000", null, "PPN keluaran 10%"),
      line("5101", "4440000", "0", "Retail", "HPP rata-rata tertimbang"),
      line("1201", "0", "4440000", null, "Stok keluar"),
    ],
  }),
  entry({
    _id: "je-0056",
    entryNumber: "JE-2026-08-0016",
    date: "2026-08-18",
    description: "Penitipan walk-in — Kemang",
    branchName: "Cabang Kemang",
    source: { type: "pos", id: "pos-0169", reference: "POS-2026-08-0169" },
    cashflowType: "operating",
    createdByName: null,
    lines: [
      line("1101", "5500000", "0", null, "Tunai + QRIS"),
      line("4103", "0", "5000000", "Pet Hotel", "8 kamar × 2–3 malam"),
      line("2103", "0", "500000", null, "PPN keluaran 10%"),
    ],
  }),
  entry({
    _id: "je-0055",
    entryNumber: "JE-2026-08-0015",
    date: "2026-08-17",
    description: "Pakan & amenities pet hotel",
    branchName: "Cabang Kemang",
    source: { type: "manual", id: null, reference: null },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    tags: ["operasional"],
    lines: [
      line("5306", "4200000", "0", "Pet Hotel", "Pakan, alas kandang, snack"),
      line("1101", "0", "4200000", null, "Tunai"),
    ],
  }),
  entry({
    _id: "je-0054",
    entryNumber: "JE-2026-08-0014",
    date: "2026-08-16",
    description: "Pelunasan piutang faktur INV-2026-08-0009",
    branchName: "Cabang BSD",
    source: { type: "receipt", id: "rcpt-0038", reference: "INV-2026-08-0009" },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    lines: [
      line("1102", "2750000", "0", null, "Transfer masuk BCA"),
      line("1103", "0", "2750000", null, "Piutang lunas"),
    ],
  }),
  entry({
    _id: "je-0053",
    entryNumber: "JE-2026-08-0013",
    date: "2026-08-15",
    description: "Rekap penjualan POS harian — Kemang",
    branchName: "Cabang Kemang",
    source: { type: "pos", id: "pos-0161", reference: "POS-2026-08-0161" },
    cashflowType: "operating",
    createdByName: null,
    lines: [
      line("1101", "16830000", "0", null, "Tunai + QRIS + kartu"),
      line("4101", "0", "9200000", "Retail", "Akhir pekan — pakan & mainan"),
      line("4102", "0", "6100000", "Grooming", "22 ekor"),
      line("2103", "0", "1530000", null, "PPN keluaran 10%"),
      line("5101", "5520000", "0", "Retail", "HPP rata-rata tertimbang"),
      line("1201", "0", "5520000", null, "Stok keluar"),
    ],
  }),
  entry({
    _id: "je-0052",
    entryNumber: "JE-2026-08-0012",
    date: "2026-08-13",
    description: "Perlengkapan grooming — shampoo, conditioner, parfum",
    branchName: "Cabang Kemang",
    source: { type: "manual", id: null, reference: null },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    tags: ["operasional"],
    attachmentUrl: "https://files.pawship.id/bukti/perlengkapan-agu-2026.jpg",
    lines: [
      line("5306", "5800000", "0", "Grooming", "Stok 2 bulan"),
      line("1102", "0", "5800000", null, "Transfer ke distributor"),
    ],
  }),
  entry({
    _id: "je-0051",
    entryNumber: "JE-2026-08-0011",
    date: "2026-08-12",
    description: "Beban listrik & air — Agustus 2026",
    branchName: "Cabang Kemang",
    source: { type: "manual", id: null, reference: null },
    cashflowType: "operating",
    createdByName: "Rani Oktaviani",
    tags: ["operasional"],
    recurring: { enabled: true, interval: "monthly" },
    lines: [
      line("5303", "2850000", "0", null, "Dua cabang"),
      line("1102", "0", "2850000", null, "Autodebet PLN & PAM"),
    ],
  }),
  entry({
    _id: "je-0050",
    entryNumber: "JE-2026-08-0010",
    date: "2026-08-11",
    description: "Rekap penjualan POS harian — BSD",
    branchName: "Cabang BSD",
    source: { type: "pos", id: "pos-0154", reference: "POS-2026-08-0154" },
    cashflowType: "operating",
    createdByName: null,
    lines: [
      line("1101", "12430000", "0", null, "Tunai + QRIS + kartu"),
      line("4101", "0", "6500000", "Retail", "Pakan & aksesoris"),
      line("4102", "0", "4800000", "Grooming", "16 ekor"),
      line("2103", "0", "1130000", null, "PPN keluaran 10%"),
      line("5101", "3900000", "0", "Retail", "HPP rata-rata tertimbang"),
      line("1201", "0", "3900000", null, "Stok keluar"),
    ],
  }),
  entry({
    _id: "je-0049",
    entryNumber: "JE-2026-08-0009",
    date: "2026-08-10",
    description: "Faktur penitipan long-stay — Ibu Maryam",
    branchName: "Cabang Kemang",
    source: { type: "invoice", id: "inv-0011", reference: "INV-2026-08-0011" },
    cashflowType: null,
    createdByName: "Dimas Prasetyo",
    lines: [
      line("1103", "9900000", "0", null, "Jatuh tempo 24 Agu 2026"),
      line("4103", "0", "9000000", "Pet Hotel", "3 kamar × 15 malam"),
      line("2103", "0", "900000", null, "PPN keluaran 10%"),
    ],
  }),
  entry({
    _id: "je-0048",
    entryNumber: "JE-2026-08-0008",
    date: "2026-08-08",
    description: "Rekap penjualan POS harian — Kemang",
    branchName: "Cabang Kemang",
    source: { type: "pos", id: "pos-0148", reference: "POS-2026-08-0148" },
    cashflowType: "operating",
    createdByName: null,
    lines: [
      line("1101", "14850000", "0", null, "Tunai + QRIS + kartu"),
      line("4101", "0", "8000000", "Retail", "Pakan, vitamin & aksesoris"),
      line("4102", "0", "5500000", "Grooming", "19 ekor"),
      line("2103", "0", "1350000", null, "PPN keluaran 10%"),
      line("5101", "4800000", "0", "Retail", "HPP rata-rata tertimbang"),
      line("1201", "0", "4800000", null, "Stok keluar"),
    ],
  }),
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
