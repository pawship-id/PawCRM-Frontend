/**
 * CONTOH DATA — the figures the two report screens render until the API can
 * answer them. Temporary, and meant to be deleted rather than grown.
 *
 * WHY THIS EXISTS AGAIN, having been deleted once. `./dummy.ts` held the whole
 * accounting feature up before the ledger endpoints landed, and it went the day
 * they did. This is the same bargain for the two screens that come next: the
 * layout is worth reviewing before the backend can feed it, and a screen built
 * against nothing is a screen built against assumptions nobody wrote down.
 *
 * WHAT REPLACES EACH PART, so the swap is mechanical rather than archaeological:
 *
 *   `PROFIT_LOSS_ROWS`  → a `GET /journal-entries/profit-loss` that groups by
 *                         (accountId × businessLineId) over the period. Today
 *                         `/summary` groups by (businessLineId × accountType)
 *                         only, so it can produce the three group TOTALS below
 *                         but none of the per-account rows under them.
 *   `CASHFLOW_ROWS`     → per-account movement over a period. `/balances` gives
 *                         a position as of a date, not the inflow/outflow split.
 *   `FIXTURE_BRANCHES`  → `GET /branches`, which already exists.
 *   `FIXTURE_LINES`     → `GET /business-lines`, which already exists.
 *
 * THE COGS/OPEX SPLIT IS DECLARED PER ROW, on the `group` field, and that is the
 * point rather than a shortcut. The backend has ONE expense class — the chart of
 * accounts carries `accountType: "expense"` and nothing finer — so there is no
 * server-side way to tell Harga Pokok Penjualan from Beban Sewa, and therefore
 * no Laba Kotor row. The codes below follow the conventional 5xxx/6xxx ledger
 * numbering because that is what a shop's accountant expects to read, but
 * NOTHING here classifies by the code: tenants number their own accounts, and
 * the seeded chart already puts `5201 Kerugian Persediaan` — which is not HPP —
 * inside the 5xxx range. The real fix is a field on the account.
 *
 * Amounts are decimal strings, like every other money value in the product, so
 * they go through `utils/decimal` untouched when the real ones arrive.
 */

/** Cabang contoh. Shaped like the `{ _id, name }` the filters read off a Branch. */
export const FIXTURE_BRANCHES = [
  { _id: "cabang-kemang", name: "Cabang Kemang" },
  { _id: "cabang-bintaro", name: "Cabang Bintaro" },
];

/**
 * Lini bisnis contoh — the matrix's columns.
 *
 * `color` is carried because `BusinessLine` has it and the filter reads the
 * shape, not because anything below paints with it.
 */
export const FIXTURE_LINES = [
  { _id: "lini-grooming", name: "Grooming", color: "#0D9488" },
  { _id: "lini-penitipan", name: "Penitipan", color: "#7C3AED" },
  { _id: "lini-retail", name: "Retail", color: "#B45309" },
];

/**
 * The period the numbers below describe, said out loud.
 *
 * One period, and the screens say so: the periode filter cannot narrow a fixture
 * that only covers one month, and a control that silently does nothing is worse
 * than one that admits it.
 */
export const FIXTURE_PERIOD_LABEL = "1 – 31 Agustus 2026";

/** Which side of the P&L a row sits on. */
export type ProfitLossGroupKey = "revenue" | "cogs" | "opex";

/**
 * One account's contribution, per cabang and per lini.
 *
 * SPARSE ON PURPOSE. A missing key is zero, and most cells genuinely are: sewa
 * belongs to no line, and grooming buys no retail stock. Writing the zeros out
 * would quadruple the file and hide the shape.
 *
 * The inner key is a business line id, or `""` for the shared bucket — the same
 * "no line" convention `financeSummary` renders as "Bersama (HQ)".
 */
export interface ProfitLossFixtureRow {
  group: ProfitLossGroupKey;
  code: string;
  name: string;
  /** cabang id → (lini id | "") → jumlah, as a decimal string. */
  amounts: Record<string, Record<string, string>>;
}

/**
 * Every amount is stated POSITIVE, including the expenses.
 *
 * A P&L prints "Beban Sewa 15.000.000", not "−15.000.000"; the minus belongs to
 * the arithmetic, not to the row. The fold below subtracts the cogs and opex
 * groups, so a sign here would subtract them twice.
 */
export const PROFIT_LOSS_ROWS: ProfitLossFixtureRow[] = [
  /* ------------------------------------------------------------ pendapatan */
  {
    group: "revenue",
    code: "4101",
    name: "Penjualan Produk",
    amounts: {
      "cabang-kemang": { "lini-retail": "48500000" },
      "cabang-bintaro": { "lini-retail": "27900000" },
    },
  },
  {
    group: "revenue",
    code: "4102",
    name: "Pendapatan Jasa Grooming",
    amounts: {
      "cabang-kemang": { "lini-grooming": "62400000" },
      "cabang-bintaro": { "lini-grooming": "34100000" },
    },
  },
  {
    group: "revenue",
    code: "4103",
    name: "Pendapatan Penitipan",
    amounts: {
      "cabang-kemang": { "lini-penitipan": "37800000" },
      "cabang-bintaro": { "lini-penitipan": "19600000" },
    },
  },
  {
    group: "revenue",
    code: "4901",
    name: "Pendapatan Lain-lain",
    amounts: {
      "cabang-kemang": { "": "1250000" },
      "cabang-bintaro": { "": "480000" },
    },
  },

  /* ------------------------------------------------------- beban pokok/HPP */
  {
    group: "cogs",
    code: "5101",
    name: "Harga Pokok Penjualan",
    amounts: {
      "cabang-kemang": { "lini-retail": "29100000" },
      "cabang-bintaro": { "lini-retail": "17250000" },
    },
  },
  {
    group: "cogs",
    code: "5102",
    name: "Pemakaian Bahan Grooming",
    amounts: {
      "cabang-kemang": { "lini-grooming": "12480000" },
      "cabang-bintaro": { "lini-grooming": "6820000" },
    },
  },
  {
    group: "cogs",
    code: "5103",
    name: "Pemakaian Pakan & Alas Kandang",
    amounts: {
      "cabang-kemang": { "lini-penitipan": "9450000" },
      "cabang-bintaro": { "lini-penitipan": "4900000" },
    },
  },

  /* ------------------------------------------------------ beban operasional */
  {
    group: "opex",
    code: "6101",
    name: "Beban Gaji & Tunjangan",
    amounts: {
      "cabang-kemang": {
        "lini-grooming": "18000000",
        "lini-penitipan": "11000000",
        "lini-retail": "6000000",
        "": "14000000",
      },
      "cabang-bintaro": {
        "lini-grooming": "9500000",
        "lini-penitipan": "6200000",
        "lini-retail": "3400000",
        "": "7500000",
      },
    },
  },
  {
    group: "opex",
    code: "6201",
    name: "Beban Sewa",
    amounts: {
      "cabang-kemang": { "": "15000000" },
      "cabang-bintaro": { "": "9000000" },
    },
  },
  {
    group: "opex",
    code: "6301",
    name: "Beban Listrik & Air",
    amounts: {
      "cabang-kemang": { "": "4800000" },
      "cabang-bintaro": { "": "2700000" },
    },
  },
  {
    group: "opex",
    code: "6401",
    name: "Beban Pemasaran",
    amounts: {
      "cabang-kemang": { "lini-retail": "1500000", "": "3200000" },
      "cabang-bintaro": { "lini-retail": "800000", "": "1400000" },
    },
  },
  {
    // Seeded as 5xxx but operational, which is the whole argument against
    // classifying by code prefix — see the header.
    group: "opex",
    code: "5201",
    name: "Kerugian Persediaan",
    amounts: {
      "cabang-kemang": { "lini-retail": "620000" },
      "cabang-bintaro": { "lini-retail": "310000" },
    },
  },
];

/**
 * One kas/bank account's movement over the period.
 *
 * NO BUSINESS LINE DIMENSION, deliberately, and the Arus Kas screen drops the
 * filter for it: a rupiah in the bank belongs to the shop, not to grooming or
 * retail. The dashboard's cash card already states the same thing.
 */
export interface CashflowFixtureRow {
  code: string;
  name: string;
  /** cabang id → the three figures. `saldoAkhir` is derived, never stored. */
  amounts: Record<
    string,
    { saldoAwal: string; inflow: string; outflow: string }
  >;
}

export const CASHFLOW_ROWS: CashflowFixtureRow[] = [
  {
    code: "1101",
    name: "Kas",
    amounts: {
      "cabang-kemang": {
        saldoAwal: "12400000",
        inflow: "96300000",
        outflow: "88150000",
      },
      "cabang-bintaro": {
        saldoAwal: "7100000",
        inflow: "54800000",
        outflow: "51200000",
      },
    },
  },
  {
    code: "1102",
    name: "Bank BCA",
    amounts: {
      "cabang-kemang": {
        saldoAwal: "84200000",
        inflow: "142700000",
        outflow: "131900000",
      },
      "cabang-bintaro": {
        saldoAwal: "46500000",
        inflow: "78300000",
        outflow: "74900000",
      },
    },
  },
  {
    code: "1112",
    name: "Bank Mandiri",
    // Kemang only — Bintaro has no account here, which is why the row still
    // belongs in the table when "Semua cabang" is selected and disappears from
    // it when Bintaro is.
    amounts: {
      "cabang-kemang": {
        saldoAwal: "31000000",
        inflow: "18400000",
        outflow: "22750000",
      },
    },
  },
];
