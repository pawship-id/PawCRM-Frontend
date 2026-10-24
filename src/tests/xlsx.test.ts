import { buildXlsx, csvToXlsx, type XlsxColumn } from "@/utils/xlsx";

/**
 * The workbook writer.
 *
 * EVERY CASE READS THE FILE BACK, through the real SheetJS. A test asserting the
 * blob is non-empty would pass just as well with `cellStyles` off — the one flag
 * whose absence silently discards every type this module exists to apply.
 *
 * What is under test is the TYPING, because that is the whole reason `.xlsx` is
 * produced instead of handing over the CSV that already exists: a number the
 * recipient can sum, a date they can sort, and a SKU of digits that keeps its
 * leading zero.
 */

interface Row {
  sku: string;
  name: string;
  qty: string;
  value: string | null;
  expiry: string;
}

const ROWS: Row[] = [
  {
    sku: "0012",
    name: "Shampoo Anjing",
    qty: "12.5",
    value: "360000",
    expiry: "2027-08-01",
  },
];

const COLUMNS: XlsxColumn<Row>[] = [
  { header: "SKU", value: (row) => row.sku },
  { header: "Produk", value: (row) => row.name },
  { header: "Qty", value: (row) => row.qty, type: "number" },
  { header: "Nilai", value: (row) => row.value, type: "number" },
  { header: "Kedaluwarsa", value: (row) => row.expiry, type: "date" },
];

/** jsdom's Blob has no `arrayBuffer()`, but it does implement FileReader. */
function blobBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function readBack(blob: Blob) {
  const XLSX = jest.requireActual<typeof import("xlsx")>("xlsx");
  const workbook = XLSX.read(await blobBuffer(blob), {
    cellNF: true,
    cellStyles: true,
    sheetStubs: true,
  });
  return {
    sheet: workbook.Sheets[workbook.SheetNames[0]],
    names: workbook.SheetNames,
  };
}

describe("buildXlsx", () => {
  it("writes the headers on the first row", async () => {
    const { sheet } = await readBack(await buildXlsx(COLUMNS, ROWS));

    expect(sheet.A1.v).toBe("SKU");
    expect(sheet.E1.v).toBe("Kedaluwarsa");
  });

  it("writes a numeric column as a number the recipient can sum", async () => {
    const { sheet } = await readBack(await buildXlsx(COLUMNS, ROWS));

    expect(sheet.C2.t).toBe("n");
    expect(sheet.C2.v).toBe(12.5);
  });

  /**
   * `0012` in a General column is the number 12, and the leading zeros are gone
   * before the recipient can notice. Text is the default for exactly this.
   */
  it("keeps a digit-only SKU as text, leading zero intact", async () => {
    const { sheet } = await readBack(await buildXlsx(COLUMNS, ROWS));

    expect(sheet.A2.t).toBe("s");
    expect(sheet.A2.v).toBe("0012");
    expect(sheet.A2.z).toBe("@");
  });

  // A serial, not a string — arithmetic on the date rather than a Date object,
  // so no timezone can shift the day.
  it("writes a date column as an Excel serial", async () => {
    const { sheet } = await readBack(await buildXlsx(COLUMNS, ROWS));

    expect(sheet.E2.t).toBe("n");
    expect(sheet.E2.v).toBe(46600);
    expect(sheet.E2.z).toBe("yyyy-mm-dd");
  });

  /**
   * The distinction the stock reports rely on: an empty cell says "no cost basis
   * yet", a zero says "worth nothing", and only one of them is a data problem.
   */
  it("leaves a null value as an empty cell rather than writing zero", async () => {
    const { sheet } = await readBack(
      await buildXlsx(COLUMNS, [{ ...ROWS[0], value: null }]),
    );

    expect(sheet.D2).toBeUndefined();
  });

  // Visible and fixable beats silently blank: the recipient can see what was in
  // the cell, which an empty one would not let them do.
  it("falls back to text when a numeric cell does not parse", async () => {
    const { sheet } = await readBack(
      await buildXlsx(COLUMNS, [{ ...ROWS[0], qty: "dua belas" }]),
    );

    expect(sheet.C2.t).toBe("s");
    expect(sheet.C2.v).toBe("dua belas");
  });

  it("falls back to text when a date cell is not YYYY-MM-DD", async () => {
    const { sheet } = await readBack(
      await buildXlsx(COLUMNS, [{ ...ROWS[0], expiry: "01/08/2027" }]),
    );

    expect(sheet.E2.t).toBe("s");
  });

  it("produces a header-only sheet for an empty export", async () => {
    const { sheet } = await readBack(await buildXlsx(COLUMNS, []));

    expect(sheet.A1.v).toBe("SKU");
    expect(sheet.A2).toBeUndefined();
  });

  // Excel refuses a sheet name past 31 characters; a silent truncation beats a
  // file the recipient cannot open.
  it("truncates an over-long sheet name", async () => {
    const { names } = await readBack(
      await buildXlsx(COLUMNS, ROWS, {
        sheetName: "Laporan Stok Persediaan Per Cabang Dan Gudang",
      }),
    );

    expect(names[0]).toHaveLength(31);
  });
});

describe("buildXlsx — grouped rows", () => {
  interface Line {
    invoice: string;
    item: string;
    total: string;
  }

  const LINES: Line[] = [
    { invoice: "INV-1", item: "Pakan", total: "150000" },
    { invoice: "INV-1", item: "Pasir", total: "150000" },
    { invoice: "INV-1", item: "Mandi", total: "150000" },
    { invoice: "INV-2", item: "Snack", total: "20000" },
  ];

  const LINE_COLUMNS: XlsxColumn<Line>[] = [
    { header: "No. faktur", value: (r) => r.invoice, merge: true },
    { header: "Barang", value: (r) => r.item },
    { header: "Total", value: (r) => r.total, type: "number", merge: true },
  ];

  // A faktur's cells once, merged over its lines — so a SUM over Total counts
  // each faktur once.
  it("writes a merge column once per group and merges it down", async () => {
    const { sheet } = await readBack(
      await buildXlsx(LINE_COLUMNS, LINES, { groupKey: (r) => r.invoice }),
    );

    expect(sheet.A2.v).toBe("INV-1");
    expect(sheet.A3?.v).toBeUndefined();
    expect(sheet.B3.v).toBe("Pasir");
    expect(sheet.C2.v).toBe(150000);
    expect(sheet.C4?.v).toBeUndefined();
    expect(sheet.A5.v).toBe("INV-2");
    expect(sheet["!merges"]).toEqual([
      { s: { r: 1, c: 0 }, e: { r: 3, c: 0 } },
      { s: { r: 1, c: 2 }, e: { r: 3, c: 2 } },
    ]);
  });

  it("ignores merge without a group key", async () => {
    const { sheet } = await readBack(await buildXlsx(LINE_COLUMNS, LINES));

    expect(sheet.A3.v).toBe("INV-1");
    expect(sheet["!merges"]).toBeUndefined();
  });
});

describe("csvToXlsx", () => {
  const CSV = [
    "Cabang,SKU,Qty,Nilai persediaan",
    "Cabang Timur,0012,12.5,360000",
    "",
  ].join("\r\n");

  it("uses the CSV's own header row as the columns", async () => {
    const { sheet } = await readBack(await csvToXlsx(CSV));

    expect(sheet.A1.v).toBe("Cabang");
    expect(sheet.D1.v).toBe("Nilai persediaan");
  });

  /**
   * BY HEADER NAME, never by position — the server owns the column list, so a
   * column added there flows through as text and nothing breaks. A positional
   * map would silently retype every column after the new one.
   */
  it("types the columns the map names", async () => {
    const { sheet } = await readBack(
      await csvToXlsx(CSV, {
        types: { Qty: "number", "Nilai persediaan": "number" },
      }),
    );

    expect(sheet.C2.t).toBe("n");
    expect(sheet.D2.v).toBe(360000);
  });

  it("leaves an unmapped column as text — degraded, not broken", async () => {
    const { sheet } = await readBack(
      await csvToXlsx(CSV, { types: { Qty: "number" } }),
    );

    expect(sheet.B2.t).toBe("s");
    expect(sheet.B2.v).toBe("0012");
  });

  // Excel writes CSV with the system list separator, and an Indonesian locale
  // uses a semicolon.
  it("reads a semicolon-separated export", async () => {
    const { sheet } = await readBack(
      await csvToXlsx("Cabang;SKU\r\nCabang Timur;0012\r\n"),
    );

    expect(sheet.A1.v).toBe("Cabang");
    expect(sheet.B2.v).toBe("0012");
  });

  it("strips the BOM the server prepends", async () => {
    const { sheet } = await readBack(await csvToXlsx(`﻿${CSV}`));

    expect(sheet.A1.v).toBe("Cabang");
  });

  // An empty row at the bottom is one the recipient's SUM range quietly
  // includes.
  it("drops the trailing blank line", async () => {
    const { sheet } = await readBack(await csvToXlsx(CSV));

    expect(sheet.A2.v).toBe("Cabang Timur");
    expect(sheet.A3).toBeUndefined();
  });

  it("keeps a quoted field containing the delimiter in one cell", async () => {
    const { sheet } = await readBack(
      await csvToXlsx('Produk,SKU\r\n"Royal Canin, Adult",RC-1KG\r\n'),
    );

    expect(sheet.A2.v).toBe("Royal Canin, Adult");
  });
});
