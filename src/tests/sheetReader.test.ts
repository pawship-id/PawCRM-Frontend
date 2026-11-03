import {
  gridFromCsv,
  normalizeDecimal,
  parseGrid,
  readGrid,
  SHEET_FORMATS,
  SheetError,
  type SheetSpec,
} from "@/utils/sheetReader";
import { buildTemplateWorkbook } from "@/utils/sheetTemplate";

/**
 * The reader every upload shares, driven by a throwaway spec. The product
 * template keeps its own suite (sheet.test.ts); these pin what a NEW upload gets.
 */
const SPEC: SheetSpec<{ rowNumber: number; kode?: string }> = {
  requiredColumns: ["kode"],
  isKnownColumn: (header) => header === "kode",
  toRow: (cells, headers, rowNumber) => ({
    row: { rowNumber, kode: cells[headers.indexOf("kode")] },
    problems: [],
  }),
};

describe("parseGrid", () => {
  it("numbers rows the way Excel's gutter does, past blank lines", () => {
    const parsed = parseGrid(gridFromCsv("\nkode\nA\n\nB\n"), SPEC);

    expect(parsed.rows.map(({ row }) => [row.rowNumber, row.kode])).toEqual([
      [3, "A"],
      [5, "B"],
    ]);
  });

  it("refuses a sheet missing a required column, naming it", () => {
    expect(() => parseGrid(gridFromCsv("nama\nA"), SPEC)).toThrow(
      "Kolom wajib tidak ditemukan: kode",
    );
  });

  it("reports a column it does not know", () => {
    const parsed = parseGrid(gridFromCsv("kode,kuantitas\nA,1"), SPEC);

    expect(parsed.unknownColumns).toEqual(["kuantitas"]);
  });

  it("refuses a header with no rows", () => {
    expect(() => parseGrid(gridFromCsv("kode\n"), SPEC)).toThrow(SheetError);
  });
});

describe("readGrid", () => {
  it("refuses a format the upload does not take, by name", async () => {
    const file = new File(["x"], "stok.pdf");

    await expect(readGrid(file, { formats: SHEET_FORMATS })).rejects.toThrow(
      "Pakai .xlsx atau .csv",
    );
  });

  it("reads a CSV it does take", async () => {
    const file = new File(["kode\nA"], "stok.CSV");
    file.text = async () => "kode\nA";

    const { grid } = await readGrid(file, { formats: SHEET_FORMATS });

    expect(grid).toEqual([["kode"], ["A"]]);
  });
});

describe("normalizeDecimal", () => {
  it.each([
    ["12", "12"],
    ["1,5", "1.5"],
    ["1.250.000", "1250000"],
    ["1,250,000", "1250000"],
  ])("reads %s", (value, expected) => {
    expect(normalizeDecimal(value)).toBe(expected);
  });

  it.each(["Rp 45.000", "abc", "-5", "1.23456"])("refuses %s", (value) => {
    expect(normalizeDecimal(value)).toBeNull();
  });
});

describe("buildTemplateWorkbook", () => {
  it("refuses an empty grid", async () => {
    await expect(
      buildTemplateWorkbook([], { kindOf: () => null, sheetName: "X" }),
    ).rejects.toThrow("Template kosong");
  });
});
