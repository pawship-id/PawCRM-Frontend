import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as XLSX from "xlsx";

import { actionLabel } from "@/features/audit-logs/constants";
import { describe as describeLog } from "@/features/audit-logs/components/AuditLogsTable";
import { CashImportScreen } from "@/features/cash-transactions";
import {
  readCashImportSheet,
  referenceSheets,
  templateLists,
} from "@/features/cash-transactions/utils/cashImport";
import { ApiError } from "@/services/api-error";
import { cashTransactionImportService } from "@/services/cashTransactionImport.service";
import type { AuditLog } from "@/types/api";
import type { CashImportPreview, CashImportVerdict } from "@/types/cashImport";
import { buildTemplateWorkbook } from "@/utils/sheetTemplate";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/cashTransactionImport.service");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/dashboard/finance/cash-bank/transactions/import",
  useSearchParams: () => new URLSearchParams(),
}));

const service = jest.mocked(cashTransactionImportService);

function workbookFile(sheets: Record<string, unknown[][]>, name = "kas.xlsx") {
  const book = XLSX.utils.book_new();

  Object.entries(sheets).forEach(([sheet, rows]) => {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheet);
  });

  const bytes: ArrayBuffer = XLSX.write(book, { type: "array", bookType: "xlsx" });
  const file = new File([bytes], name);

  // jsdom's File has no arrayBuffer.
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(bytes),
  });

  return file;
}

const JUBELIO_HEADER = [
  "No",
  "Tanggal Transaksi",
  "Tipe",
  "Kontak",
  "No Telp Kontak",
  "Cabang",
  "Akun Kas/Bank",
  "Nilai Kas/Bank",
  "Keterangan",
  "Detil Akun",
  "Nilai",
  "Keterangan",
];

describe("reading Jubelio's file", () => {
  it("finds its sheet behind the instructions, and the second Keterangan is the line's", async () => {
    const sheet = await readCashImportSheet(
      workbookFile({
        Instruksi: [["Tata Cara"]],
        "Tata Cara Pengisian": [["Nama Label"]],
        template_kasdanbank: [
          JUBELIO_HEADER,
          [2, "2021-01-01 ", "Pembayaran", "PT Lintas", "021-58", "PST", "Bank", "10100000", "Sewa", "Biaya Sewa", 10000000, "Gedung"],
          ["", "", "", "", "", "", "", "", "", "Biaya Bunga", 100000, ""],
        ],
      }),
    );

    expect(sheet.unknownColumns).toEqual([]);
    expect(sheet.rows[0].row).toMatchObject({
      no: "2",
      tanggal: "2021-01-01",
      keterangan: "Sewa",
      keterangan_detil: "Gedung",
      nilai_kas: "10100000",
    });
    expect(sheet.rows[1].row).toEqual({
      rowNumber: 3,
      detil_akun: "Biaya Bunga",
      nilai: "100000",
    });
  });

  it("sends a real date cell as a date, and a General one as the serial the server reads", async () => {
    const sheet = await readCashImportSheet(
      workbookFile({
        Transaksi: [
          ["No", "Tanggal Transaksi", "Tipe", "Cabang", "Akun Kas/Bank", "Nilai Kas/Bank", "Detil Akun", "Nilai"],
          ["1", { t: "n", v: 46300, z: "dd/mm/yyyy" }, "Pembayaran", "PST", "1101", 100, "6102", 100],
          ["2", 46300, "Pembayaran", "PST", "1101", 100, "6102", 100],
        ],
      }),
    );

    expect(sheet.rows[0].row.tanggal).toBe("2026-10-05");
    expect(sheet.rows[1].row.tanggal).toBe("46300");
  });

  it("names the missing Cabang, which Jubelio's template does not have", async () => {
    await expect(
      readCashImportSheet(
        workbookFile({
          template_kasdanbank: [
            JUBELIO_HEADER.filter((header) => header !== "Cabang"),
            ["1"],
          ],
        }),
      ),
    ).rejects.toThrow(/cabang/);
  });

  it("refuses more rows than one file may hold, before asking the server", async () => {
    const rows = Array.from({ length: 501 }, (_, index) => [`R${index}`]);

    await expect(
      readCashImportSheet(
        workbookFile({ Transaksi: [JUBELIO_HEADER, ...rows] }),
      ),
    ).rejects.toThrow(/maksimal 500 baris/);
  });
});

describe("the template", () => {
  const template = {
    columns: [
      "No",
      "Tanggal Transaksi",
      "Tipe",
      "Cabang",
      "Akun Kas/Bank",
      "Nilai Kas/Bank",
      "Detil Akun",
      "Nilai",
    ],
    limits: { maxLines: 20, backdateMonths: 3 },
    accounts: [
      {
        code: "1103",
        name: "Piutang",
        label: "1103 - Piutang",
        category: "piutang_dagang",
        isCash: false,
        refusal: "Lewat faktur",
        branches: null,
      },
      {
        code: "1101",
        name: "Kas",
        label: "1101 - Kas",
        category: "cash_bank",
        isCash: true,
        refusal: null,
        branches: null,
      },
      {
        code: "1109",
        name: "Bank Lain",
        label: "1109 - Bank Lain",
        category: "cash_bank",
        isCash: true,
        refusal: null,
        branches: [],
      },
      {
        code: "6102",
        name: "Beban Sewa",
        label: "6102 - Beban Sewa",
        category: "biaya",
        isCash: false,
        refusal: null,
        branches: ["Pusat"],
      },
    ],
    branches: [{ code: "PST", name: "Pusat", label: "PST - Pusat" }],
    subAccounts: [],
    examples: [
      [
        "CONTOH-1",
        "2026-11-02",
        "Pembayaran",
        "PST - Pusat",
        "1101 - Kas",
        "100",
        "6102 - Beban Sewa",
        "100",
      ],
    ],
  };

  async function build() {
    const blob = await buildTemplateWorkbook(
      [template.columns, ...template.examples],
      {
        sheetName: "Transaksi",
        kindOf: () => null,
        extraSheets: referenceSheets(template),
        lists: templateLists(template),
      },
    );

    return new Uint8Array(
      await new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(blob);
      }),
    );
  }

  it("puts the examples on Transaksi, a guide beside it, and the lists out of sight", async () => {
    const book = XLSX.read(await build());

    expect(book.SheetNames).toEqual([
      "Panduan Pengisian",
      "Transaksi",
      "Daftar Akun",
      "Daftar Cabang",
      "Pilihan",
    ]);
    expect(book.Workbook?.Sheets?.map((sheet) => sheet.Hidden)).toEqual([
      0, 0, 0, 0, 1,
    ]);
    expect(
      XLSX.utils.sheet_to_json<string[]>(book.Sheets.Transaksi, {
        header: 1,
      })[1][0],
    ).toBe("CONTOH-1");
    expect(
      XLSX.utils.sheet_to_json<string[]>(book.Sheets["Daftar Akun"], {
        header: 1,
      })[1],
    ).toContain("Tidak bisa dipakai");

    // Piutang is refused, Bank Lain is in no branch of this user's, and a rekening
    // is never a Detil Akun: transfers are not imported.
    expect(
      XLSX.utils.sheet_to_json<string[]>(book.Sheets.Pilihan, { header: 1 }),
    ).toEqual([
      ["Tipe", "Cabang", "Akun Kas/Bank", "Detil Akun"],
      ["Pembayaran", "PST - Pusat", "1101 - Kas", "6102 - Beban Sewa"],
      ["Penerimaan", "", "", ""],
    ]);
  });

  it("writes the dropdowns into the sheet, where Excel expects them", async () => {
    const zip = XLSX.CFB.read(await build(), { type: "array" });
    const xml = new TextDecoder().decode(
      // The guide comes first, so Transaksi is the second part.
      XLSX.CFB.find(zip, "/xl/worksheets/sheet2.xml").content,
    );

    expect(xml).toContain(
      "sqref=\"E2:E1001\"><formula1>'Pilihan'!$C$2:$C$2</formula1>",
    );
    expect(xml).toContain(
      "sqref=\"G2:G1001\"><formula1>'Pilihan'!$D$2:$D$2</formula1>",
    );
    expect(xml.indexOf("<dataValidations")).toBeGreaterThan(
      xml.indexOf("</sheetData>"),
    );
    const after = xml.search(/<ignoredErrors|<pageMargins/);
    if (after >= 0) expect(xml.indexOf("<dataValidations")).toBeLessThan(after);
  });

  it("dresses the guide: styles in styles.xml, named on its cells, no gridlines", async () => {
    const zip = XLSX.CFB.read(await build(), { type: "array" });
    const read = (path: string) =>
      new TextDecoder().decode(XLSX.CFB.find(zip, path).content);
    const styles = read("/xl/styles.xml");
    const guide = read("/xl/worksheets/sheet1.xml");

    expect(styles).toContain('<fgColor rgb="FF1E3A6B"/>');
    const xfCount = Number(/<cellXfs count="(\d+)">/.exec(styles)?.[1]);
    expect(styles.match(/<xf [^>]*xfId=/g)).toHaveLength(xfCount);

    expect(guide).toContain('<sheetView showGridLines="0"');
    expect(guide).toMatch(/<c r="A1" s="\d+"/);
    expect(guide).toContain('<mergeCell ref="A1:C1"/>');
    expect(XLSX.read(await build()).Sheets["Panduan Pengisian"].A1.v).toMatch(/^Panduan Pengisian/);
  });

  it("is read from Transaksi on upload, though the guide is the first tab", async () => {
    const bytes = await build();
    const file = new File([bytes], "template-kas-bank.xlsx");
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(bytes.buffer),
    });

    const parsed = await readCashImportSheet(file);

    expect(parsed.sheetName).toBe("Transaksi");
    expect(parsed.rows[0].row).toMatchObject({
      no: "CONTOH-1",
      cabang: "PST - Pusat",
      akun_kas: "1101 - Kas",
    });
  });
});

const verdict = (overrides: Partial<CashImportVerdict> = {}): CashImportVerdict => ({
  rowNumber: 2,
  no: "1",
  rowNumbers: [2],
  status: "ok",
  problems: [],
  warnings: [],
  date: "2026-11-01",
  tipe: "Pembayaran",
  branchName: "Pusat",
  cashAccount: { code: "1101", name: "Kas" },
  contact: null,
  note: null,
  lines: [{ code: "6102", name: "Beban Sewa", amount: "150000.0000", memo: null }],
  total: "150000.0000",
  duplicate: null,
  ...overrides,
});

const previewOf = (
  transactions: CashImportVerdict[],
  summary: Partial<CashImportPreview["summary"]> = {},
): CashImportPreview => ({
  canCommit: true,
  transactions,
  summary: {
    transactions: transactions.length,
    fileRows: transactions.length,
    ok: transactions.length,
    problems: 0,
    ready: transactions.length,
    alreadyImported: 0,
    sameFile: 0,
    readyAmount: "150000.0000",
    ...summary,
  },
});

const FILE = () =>
  workbookFile({
    Transaksi: [
      ["No", "Tanggal Transaksi", "Tipe", "Cabang", "Akun Kas/Bank", "Nilai Kas/Bank", "Detil Akun", "Nilai"],
      ["1", "2026-11-01", "Pembayaran", "PST", "1101", "150000", "6102", "150000"],
    ],
  });

async function upload() {
  const user = userEvent.setup();
  const view = renderWithAuth(<CashImportScreen />);
  const input = view.container.querySelector("input[type=file]") as HTMLInputElement;

  await user.upload(input, FILE());

  return user;
}

describe("the import screen", () => {
  it("shows one row per transaction, with its warning, and saves", async () => {
    service.preview.mockResolvedValue(
      previewOf([verdict({ warnings: ["Tanggal ada di bulan lalu"] })]),
    );
    service.commit.mockResolvedValue({
      createdCount: 1,
      skippedCount: 0,
      failedCount: 0,
      created: [],
      skipped: [],
      failed: [],
    });

    const user = await upload();

    expect(await screen.findByText("Tanggal ada di bulan lalu")).toBeInTheDocument();
    expect(screen.getByText(/6102 Beban Sewa/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simpan 1 transaksi" }));

    expect(await screen.findByText(/1 transaksi tersimpan/)).toBeInTheDocument();
    expect(service.commit).toHaveBeenCalledWith(
      expect.objectContaining({ importAnyway: false, fileName: "kas.xlsx" }),
    );
  });

  it("keeps Simpan off until Tetap impor is ticked, when nothing else is new", async () => {
    service.preview.mockResolvedValue(
      previewOf(
        [verdict({ duplicate: "other_file", existingNumber: "BKK/1" })],
        { ready: 0, alreadyImported: 1 },
      ),
    );
    service.commit.mockResolvedValue({
      createdCount: 1,
      skippedCount: 0,
      failedCount: 0,
      created: [],
      skipped: [],
      failed: [],
    });

    const user = await upload();
    const save = await screen.findByRole("button", { name: "Simpan 0 transaksi" });

    expect(save).toBeDisabled();
    expect(screen.getByText("Sudah pernah diimpor: BKK/1")).toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", { name: "Tetap impor, ini transaksi baru" }),
    );
    await user.click(screen.getByRole("button", { name: "Simpan 1 transaksi" }));

    await waitFor(() =>
      expect(service.commit).toHaveBeenCalledWith(
        expect.objectContaining({ importAnyway: true }),
      ),
    );
  });

  it("does not let a file with a problem be saved", async () => {
    service.preview.mockResolvedValue({
      ...previewOf(
        [
          verdict({
            status: "invalid",
            problems: [{ field: "Nilai Kas/Bank", message: "tidak sama" }],
          }),
        ],
        { ok: 0, problems: 1, ready: 0 },
      ),
      canCommit: false,
    });

    await upload();

    expect(await screen.findByText(/masih bermasalah/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Simpan/ })).toBeDisabled();
  });

  it("does not call a timed-out save a failure: it may still be writing", async () => {
    service.preview.mockResolvedValue(previewOf([verdict()]));
    service.commit.mockRejectedValue(
      new ApiError("Request timed out after 300000ms", 0, { isTimeout: true }),
    );

    const user = await upload();

    await user.click(await screen.findByRole("button", { name: "Simpan 1 transaksi" }));

    expect(await screen.findByText(/yang sudah masuk akan dilewati/)).toBeInTheDocument();
  });
});

describe("the audit log", () => {
  it("names the upload and says what it did", () => {
    const log = {
      action: "cash_transaction_bulk_import",
      metadata: { createdCount: 3, skippedCount: 1, failedCount: 0 },
    } as unknown as AuditLog;

    expect(actionLabel("cash_transaction_bulk_import")).toBe("Impor transaksi kas");
    expect(describeLog(log)).toBe("3 transaksi diimpor · 1 dilewati");
  });
});
