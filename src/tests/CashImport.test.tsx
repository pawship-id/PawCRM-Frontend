import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as XLSX from "xlsx";

import { actionLabel } from "@/features/audit-logs/constants";
import { describe as describeLog } from "@/features/audit-logs/components/AuditLogsTable";
import { CashImportScreen } from "@/features/cash-transactions";
import {
  readCashImportSheet,
  referenceSheets,
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
    columns: ["No", "Tanggal Transaksi", "Tipe", "Cabang", "Akun Kas/Bank", "Nilai Kas/Bank", "Detil Akun", "Nilai"],
    accounts: [
      { code: "1103", name: "Piutang", category: "piutang_dagang", isCash: false, refusal: "Lewat faktur" },
      { code: "1101", name: "Kas", category: "cash_bank", isCash: true, refusal: null },
    ],
    branches: [{ code: "PST", name: "Pusat" }],
    subAccounts: [],
    examples: [["CONTOH-1", "2026-11-02", "Pembayaran", "PST", "1101", "100", "6102", "100"]],
  };

  it("keeps the examples off the sheet that gets read", async () => {
    const blob = await buildTemplateWorkbook([template.columns], {
      sheetName: "Transaksi",
      kindOf: () => null,
      extraSheets: referenceSheets(template),
    });
    const bytes = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    const book = XLSX.read(bytes);

    expect(book.SheetNames).toEqual([
      "Transaksi",
      "Contoh",
      "Daftar Akun",
      "Daftar Cabang",
    ]);
    expect(
      XLSX.utils
        .sheet_to_json(book.Sheets.Transaksi, { header: 1 })
        .flat(),
    ).not.toContain("CONTOH-1");
    expect(
      XLSX.utils
        .sheet_to_json<string[]>(book.Sheets["Daftar Akun"], { header: 1 })[1],
    ).toContain("Tidak bisa dipakai");
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
  isTransfer: false,
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
