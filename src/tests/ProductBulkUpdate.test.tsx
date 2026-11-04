import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { actionLabel } from "@/features/audit-logs/constants";
import { describe as describeLog } from "@/features/audit-logs/components/AuditLogsTable";
import { ProductBulkUpdateScreen } from "@/features/inventory";
import { useProductBulkUpdate } from "@/features/inventory/hooks/useProductBulkUpdate";
import {
  mergePreviews,
  PRODUCT_UPDATE_COLUMNS,
  readProductUpdateSheet,
  saveProductUpdateTemplate,
  toBatches,
} from "@/features/inventory/utils/productBulkUpdate";
import { ApiError } from "@/services/api-error";
import { categoryService } from "@/services/category.service";
import { productBulkUpdateService } from "@/services/productBulkUpdate.service";
import { warehouseService } from "@/services/warehouse.service";
import type { AuditLog } from "@/types/api";
import type {
  ProductUpdateJob,
  ProductUpdatePreview,
  ProductUpdateRow,
  ProductUpdateVerdict,
} from "@/types/productBulkUpdate";
import { saveFile } from "@/utils/saveFile";

import { renderWithAuth as render } from "./helpers/renderWithAuth";

/**
 * Editing products from a spreadsheet.
 *
 * WHAT THESE GUARD: a column outside the template never reaches the API, a large
 * file is checked in batches and read as one, and the commit carries only the
 * rows the preview found changed.
 */
jest.mock("@/utils/saveFile", () => ({ saveFile: jest.fn() }));
jest.mock("@/services/productBulkUpdate.service");

const preview = jest.mocked(productBulkUpdateService.preview);
const commit = jest.mocked(productBulkUpdateService.commit);
const template = jest.mocked(productBulkUpdateService.template);
const job = jest.mocked(productBulkUpdateService.job);
const latestJob = jest.mocked(productBulkUpdateService.latestJob);
const resumeJob = jest.mocked(productBulkUpdateService.resumeJob);

/** A queued, running, done or failed bulk update — what Simpan answers with. */
const jobOf = (overrides: Partial<ProductUpdateJob> = {}): ProductUpdateJob => ({
  _id: "job1",
  type: "product_bulk_update",
  status: "queued",
  progress: { done: 0, total: 2 },
  error: null,
  result: null,
  fileName: "data-produk.csv",
  createdAt: "",
  finishedAt: null,
  ...overrides,
});

const HEADER = PRODUCT_UPDATE_COLUMNS.join(",");
const FIELD = "Pilih file CSV atau Excel";

const csvFile = (text: string, name = "data-produk.csv") =>
  Object.assign(new File([text], name), {
    text: () => Promise.resolve(text),
  });
const csvOf = (...lines: string[]) => [HEADER, ...lines].join("\n");

const verdict = (
  overrides: Partial<ProductUpdateVerdict> = {},
): ProductUpdateVerdict => ({
  rowNumber: 2,
  sku: "RC-1KG",
  status: "ok",
  problems: [],
  productId: "p1",
  productName: "Royal Canin",
  action: "skip",
  changes: [],
  ...overrides,
});

const changed = (overrides: Partial<ProductUpdateVerdict> = {}) =>
  verdict({
    action: "update",
    changes: [
      { field: "harga_jual", before: "150000.0000", after: "160000.0000" },
    ],
    ...overrides,
  });

const previewOf = (rows: ProductUpdateVerdict[]): ProductUpdatePreview => {
  const ok = rows.filter((row) => row.status === "ok").length;
  const update = rows.filter((row) => row.action === "update").length;

  return {
    summary: {
      rows: rows.length,
      ok,
      problems: rows.length - ok,
      changed: update,
      unchanged: ok - update,
    },
    canCommit: ok === rows.length && update > 0,
    rows,
  };
};

const rowsFrom = (count: number): ProductUpdateRow[] =>
  Array.from({ length: count }, (_, index) => ({
    rowNumber: index + 2,
    sku: `SKU-${index}`,
  }));

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(categoryService, "list")
    .mockResolvedValue({ items: [], pagination: {} } as never);
  jest
    .spyOn(warehouseService, "list")
    .mockResolvedValue({ items: [], pagination: {} } as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the audit log", () => {
  it("knows the action, and says how much landed", () => {
    expect(actionLabel("product_bulk_update")).toBe("Update massal produk");
    expect(
      describeLog({
        action: "product_bulk_update",
        metadata: { updatedCount: 3, failedCount: 1 },
      } as unknown as AuditLog),
    ).toBe("3 produk diperbarui · 1 gagal");
  });
});

describe("readProductUpdateSheet", () => {
  it("sends the cells as text, leaving blanks out", async () => {
    const { rows } = await readProductUpdateSheet(
      csvFile(csvOf("RC-1KG,,1.250.000,,4101,,,Aktif")),
    );

    expect(rows[0].row).toEqual({
      rowNumber: 2,
      sku: "RC-1KG",
      harga_jual: "1.250.000",
      akun_penjualan: "4101",
      status: "Aktif",
    });
  });

  it("names a column it will not send, and never sends it", async () => {
    const { rows, unknownColumns } = await readProductUpdateSheet(
      csvFile("sku,harga_jual,hpp,stok,barcode\nRC-1KG,1,99,1000,123"),
    );

    expect(unknownColumns).toEqual(["hpp", "stok", "barcode"]);
    expect(rows[0].row).toEqual({
      rowNumber: 2,
      sku: "RC-1KG",
      harga_jual: "1",
    });
  });

  it("refuses a file with no sku column", async () => {
    await expect(
      readProductUpdateSheet(csvFile("nama,harga_jual\nA,1")),
    ).rejects.toThrow();
  });
});

describe("toBatches", () => {
  it("keeps 500 in one request and sends 501 in two", () => {
    expect(toBatches(rowsFrom(500))).toHaveLength(1);
    expect(toBatches(rowsFrom(501)).map((batch) => batch.length)).toEqual([
      500, 1,
    ]);
  });
});

describe("mergePreviews", () => {
  it("adds the batches up", () => {
    const merged = mergePreviews([
      previewOf([changed()]),
      previewOf([verdict({ rowNumber: 3, sku: "B" })]),
    ]);

    expect(merged.summary).toEqual({
      rows: 2,
      ok: 2,
      problems: 0,
      changed: 1,
      unchanged: 1,
    });
    expect(merged.canCommit).toBe(true);
  });

  it("finds a SKU repeated across two batches", () => {
    const merged = mergePreviews([
      previewOf([changed()]),
      previewOf([changed({ rowNumber: 700 })]),
    ]);

    expect(merged.canCommit).toBe(false);
    expect(merged.summary.problems).toBe(2);
    expect(merged.rows[0].action).toBe("skip");
    expect(merged.rows[0].problems[0].message).toContain("baris 2, 700");
  });

  const changedRows = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      changed({ rowNumber: index + 2, sku: `SKU-${index}` }),
    );

  it("allows more than 500 changed products — the save runs in the background", () => {
    expect(
      mergePreviews([
        previewOf(changedRows(500)),
        previewOf([changed({ rowNumber: 1000, sku: "LAST" })]),
      ]).canCommit,
    ).toBe(true);
  });

  it("has nothing to save when nothing changed", () => {
    expect(mergePreviews([previewOf([verdict()])]).canCommit).toBe(false);
  });

  it("is blocked by a bad row in any batch", () => {
    const merged = mergePreviews([
      previewOf([changed()]),
      previewOf([
        verdict({
          rowNumber: 600,
          sku: "X",
          status: "not_found",
          problems: [{ field: "sku", message: "tidak ditemukan" }],
        }),
      ]),
    ]);

    expect(merged.canCommit).toBe(false);
  });
});

describe("saveProductUpdateTemplate", () => {
  const blob = (text: string) =>
    Object.assign(new Blob([text]), { text: () => Promise.resolve(text) });

  it("passes the filters and saves the server's CSV as it came", async () => {
    const file = blob(`${HEADER}\r\n`);
    template.mockResolvedValue({ blob: file, filename: "data-produk.csv" });

    await saveProductUpdateTemplate({ isActive: true }, "csv");

    expect(template).toHaveBeenCalledWith({ isActive: true });
    expect(saveFile).toHaveBeenCalledWith(file, "data-produk.csv");
  });
});

describe("the workbook", () => {
  it("keeps a code's leading zero and a price as written", async () => {
    const text = `${HEADER}\r\n007,Nama,12.125,5,4101,,,Aktif\r\n`;
    template.mockResolvedValue({
      blob: Object.assign(new Blob([text]), {
        text: () => Promise.resolve(text),
      }),
      filename: "data-produk.csv",
    });

    await saveProductUpdateTemplate({}, "xlsx");

    const [workbook, name] = jest.mocked(saveFile).mock.calls[0];
    const buffer = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(workbook);
    });
    const XLSX = await import("xlsx");
    const sheet = XLSX.read(buffer).Sheets.Produk;

    expect(name).toBe("data-produk.xlsx");
    expect(sheet.A2.v).toBe("007");
    expect(sheet.C2).toMatchObject({ t: "s", v: "12.125" });
  });
});

describe("useProductBulkUpdate", () => {
  it("checks a large file in sequence and commits only the changed rows", async () => {
    const lines = Array.from(
      { length: 501 },
      (_, index) => `SKU-${index},,${index === 500 ? "2" : ""},,,,,`,
    );
    preview.mockImplementation(async (rows) =>
      previewOf(
        rows.map((row) =>
          row.harga_jual
            ? changed({ rowNumber: row.rowNumber, sku: row.sku })
            : verdict({ rowNumber: row.rowNumber, sku: row.sku }),
        ),
      ),
    );
    commit.mockResolvedValue(jobOf({ progress: { done: 0, total: 1 } }));

    const { result } = renderHook(() => useProductBulkUpdate());

    await act(() => result.current.pickFile(csvFile(csvOf(...lines))));

    expect(preview.mock.calls.map(([rows]) => rows.length)).toEqual([500, 1]);
    expect(result.current.preview?.summary.changed).toBe(1);
    expect(result.current.canCommit).toBe(true);

    await act(() => result.current.commit());

    expect(commit).toHaveBeenCalledWith({
      rows: [{ rowNumber: 502, sku: "SKU-500", harga_jual: "2" }],
      fileName: "data-produk.csv",
    });
    expect(result.current.step).toBe("done");
  });

  it("goes back to checking when the commit is refused", async () => {
    preview.mockResolvedValue(previewOf([changed()]));
    commit.mockRejectedValue(new ApiError("File ditolak", 400));

    const { result } = renderHook(() => useProductBulkUpdate());

    await act(() => result.current.pickFile(csvFile(csvOf("RC-1KG,,1"))));
    await act(() => result.current.commit());

    expect(result.current.error).toBe("File ditolak");
    expect(result.current.preview).toBeNull();
  });
});

describe("ProductBulkUpdateScreen", () => {
  const FILTERS = {
    search: "",
    categoryId: "",
    productType: "" as const,
    status: "active" as const,
  };

  const pick = async (text: string) => {
    render(<ProductBulkUpdateScreen initialFilters={FILTERS} />);
    await userEvent.upload(screen.getByLabelText(FIELD), csvFile(text));
  };

  it("shows before and after, only for rows that say something", async () => {
    preview.mockResolvedValue(
      previewOf([
        changed(),
        verdict({ rowNumber: 3, sku: "SAMA", productName: "Tidak berubah" }),
      ]),
    );

    await pick(csvOf("RC-1KG,,160000", "SAMA,,1"));

    expect(await screen.findByText("1 produk akan berubah. 1 baris tidak berubah.")).toBeInTheDocument();

    const row = screen.getByText("Royal Canin").closest("tr") as HTMLElement;

    expect(within(row).getByText(/Rp\s?150\.000 → Rp\s?160\.000/)).toBeInTheDocument();
    expect(screen.queryByText("Tidak berubah")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Simpan 1 produk" }),
    ).toBeEnabled();
  });

  it("keeps sen visible in a price change", async () => {
    preview.mockResolvedValue(
      previewOf([
        changed({
          changes: [
            { field: "harga_jual", before: "100.1000", after: "100.2000" },
          ],
        }),
      ]),
    );

    await pick(csvOf("RC-1KG,,100.2"));

    expect(await screen.findByText(/100\.1000 → 100\.2000/)).toBeInTheDocument();
  });

  it("warns about ignored columns", async () => {
    preview.mockResolvedValue(previewOf([changed()]));

    await pick("sku,harga_jual,hpp\nRC-1KG,1,99");

    expect(
      await screen.findByText(/diabaikan dan tidak akan disimpan/),
    ).toHaveTextContent("hpp");
  });

  it("will not save while a row has a problem", async () => {
    preview.mockResolvedValue(
      previewOf([
        changed(),
        verdict({
          rowNumber: 3,
          sku: "X",
          status: "not_found",
          problems: [{ field: "sku", message: "tidak ditemukan" }],
        }),
      ]),
    );

    await pick(csvOf("RC-1KG,,1", "X,,1"));

    expect(await screen.findByText(/1 dari 2 baris perlu diperbaiki/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    ).toBeDisabled();
  });

  it("saves in the background, says the page may be closed, then reports", async () => {
    preview.mockResolvedValue(previewOf([changed()]));
    commit.mockResolvedValue(jobOf({ status: "running", progress: { done: 1, total: 2 } }));
    job.mockResolvedValue(
      jobOf({
        status: "done",
        progress: { done: 2, total: 2 },
        finishedAt: "2026-11-03T05:00:00.000Z",
        result: {
          updatedCount: 1,
          failedCount: 1,
          updated: [{ rowNumber: 2, sku: "RC-1KG" }],
          failed: [{ rowNumber: 3, sku: "RC-3KG", message: "Product not found" }],
        },
      }),
    );

    await pick(csvOf("RC-1KG,,1"));
    expect(screen.getByText(/halaman ini boleh ditutup/)).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: "Simpan 1 produk" }),
    );

    expect(await screen.findByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText(/Halaman ini boleh ditutup/)).toBeInTheDocument();

    expect(
      await screen.findByText("1 produk diperbarui, 1 gagal.", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Product not found")).toBeInTheDocument();
  });

  it("shows where a save got to when somebody comes back", async () => {
    latestJob.mockResolvedValue(
      jobOf({ status: "running", progress: { done: 300, total: 900 } }),
    );

    render(<ProductBulkUpdateScreen initialFilters={FILTERS} />);

    expect(await screen.findByText(/300 dari 900 produk sudah diproses/)).toBeInTheDocument();
  });

  it("offers Lanjutkan on a save that stopped", async () => {
    latestJob.mockResolvedValue(
      jobOf({ status: "failed", error: "Proses terhenti", progress: { done: 100, total: 900 } }),
    );
    resumeJob.mockResolvedValue(jobOf({ status: "queued" }));

    render(<ProductBulkUpdateScreen initialFilters={FILTERS} />);

    await userEvent.click(await screen.findByRole("button", { name: "Lanjutkan" }));
    expect(resumeJob).toHaveBeenCalledWith("job1");
    expect(await screen.findByText(/Menunggu giliran/)).toBeInTheDocument();
  });

  it("leaves out a save that finished before the page was opened", async () => {
    latestJob.mockResolvedValue(
      jobOf({
        status: "done",
        finishedAt: "2026-01-01T00:00:00.000Z",
        result: { updatedCount: 5, failedCount: 0, updated: [], failed: [] },
      }),
    );

    render(<ProductBulkUpdateScreen initialFilters={FILTERS} />);

    await waitFor(() => expect(latestJob).toHaveBeenCalled());
    expect(screen.queryByText(/Update massal terakhir/)).not.toBeInTheDocument();
  });

  it("downloads with the filters it opened on", async () => {
    template.mockResolvedValue({
      blob: new Blob([HEADER]),
      filename: "data-produk.csv",
    });

    render(<ProductBulkUpdateScreen initialFilters={FILTERS} />);

    await userEvent.click(
      screen.getByRole("button", { name: /Unduh data produk/ }),
    );
    await userEvent.click(await screen.findByText("CSV (.csv)"));

    await waitFor(() =>
      expect(template).toHaveBeenCalledWith({ isActive: true }),
    );
  });
});
