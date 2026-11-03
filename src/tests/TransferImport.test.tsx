import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StockTransferEditScreen, StockTransferForm } from "@/features/inventory";
import { TransferImportDialog } from "@/features/inventory/components/TransferImportDialog";
import {
  readTransferSheet,
  saveTransferTemplate,
  TRANSFER_TEMPLATE_COLUMNS,
} from "@/features/inventory/utils/transferImport";
import { productBatchService } from "@/services/productBatch.service";
import { productService } from "@/services/product.service";
import { stockTransferService } from "@/services/stockTransfer.service";
import { warehouseService } from "@/services/warehouse.service";
import type { ProductBatch, StockTransferDetail } from "@/types/inventory";
import type {
  TransferImportPreview,
  TransferImportVerdict,
} from "@/types/transferImport";
import { SheetError } from "@/utils/sheetReader";

import { renderWithAuth as render } from "./helpers/renderWithAuth";

/**
 * Filling a transfer from a spreadsheet.
 *
 * WHAT THESE GUARD: the file only ever fills the form, never the ledger; a file
 * with one bad row fills nothing; a blank batch on goods that expire reaches the
 * payload as `autoFefo`; and the limit holds at exactly 200 and 201 lines.
 */
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const WH_A = "wh1";
const WH_B = "wh2";
const ID_FIELD = "Pilih file CSV atau Excel";

const csvFile = (text: string, name = "transfer.csv") =>
  Object.assign(new File([text], name), {
    text: () => Promise.resolve(text),
  });

const csvOf = (...lines: string[]) =>
  ["sku,jumlah,kode_batch,catatan", ...lines].join("\n");

function verdict(
  overrides: Partial<TransferImportVerdict> = {},
): TransferImportVerdict {
  const id = overrides.productId ?? "p1";

  return {
    rowNumber: 2,
    sku: "RC-1KG",
    status: "ok",
    problems: [],
    productId: id,
    product: {
      _id: id,
      name: `Produk ${id}`,
      sku: "RC-1KG",
      unit: "sak",
      hasExpiry: false,
      hppAvg: "1000.0000",
    },
    qty: "3.0000",
    batchId: null,
    batchCode: null,
    autoFefo: false,
    notes: null,
    available: "10.0000",
    onHand: "10.0000",
    ...overrides,
  };
}

function preview(rows: TransferImportVerdict[]): TransferImportPreview {
  const ok = rows.filter((row) => row.status === "ok").length;

  return {
    warehouseName: "Gudang Pusat",
    summary: { rows: rows.length, ok, problems: rows.length - ok },
    canCommit: ok === rows.length,
    rows,
  };
}

const warehouse = (id: string, name: string) => ({
  _id: id,
  tenantId: "t1",
  name,
  defaultBranchId: "br1",
  isActive: true,
  deletedAt: null,
});

const page = <T,>(items: T[]) => ({
  items,
  pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
});

function mockServices(batches: Partial<ProductBatch>[] = []) {
  jest
    .spyOn(warehouseService, "list")
    .mockResolvedValue(
      page([warehouse(WH_A, "Gudang Pusat"), warehouse(WH_B, "Gudang Bazar")]) as never,
    );
  jest.spyOn(productService, "list").mockResolvedValue(page([]) as never);
  jest.spyOn(productService, "stock").mockResolvedValue({ items: [] } as never);
  jest
    .spyOn(productBatchService, "list")
    .mockResolvedValue(page(batches) as never);

  return jest
    .spyOn(stockTransferService, "create")
    .mockResolvedValue({
      _id: "tr1",
      transferNumber: "TRF/1",
      productCount: 1,
    } as never);
}

afterEach(() => jest.restoreAllMocks());

describe("readTransferSheet", () => {
  it("takes the four columns and leaves blank cells out", async () => {
    const parsed = await readTransferSheet(
      csvFile(csvOf("RC-1KG,3,,", "VKS,1.250.000,B-1,dekat ED")),
    );

    expect(parsed.rows.map(({ row }) => row)).toEqual([
      { rowNumber: 2, sku: "RC-1KG", qty: "3" },
      {
        rowNumber: 3,
        sku: "VKS",
        qty: "1250000",
        batchCode: "B-1",
        notes: "dekat ED",
      },
    ]);
  });

  it("passes a bad quantity on as written, for the server to refuse by row", async () => {
    const parsed = await readTransferSheet(csvFile(csvOf("RC-1KG,dua,,")));

    expect(parsed.rows[0]).toEqual({
      row: { rowNumber: 2, sku: "RC-1KG", qty: "dua" },
      problems: [],
    });
  });

  it("refuses a file that is not .xlsx or .csv", async () => {
    await expect(
      readTransferSheet(csvFile(csvOf("A,1,,"), "transfer.xls")),
    ).rejects.toThrow("Pakai .xlsx atau .csv");
  });

  it("refuses a sheet without the required columns", async () => {
    await expect(
      readTransferSheet(csvFile("sku,catatan\nA,x")),
    ).rejects.toThrow("Kolom wajib tidak ditemukan: jumlah");
  });

  const lines = (count: number) =>
    Array.from({ length: count }, (_, i) => `SKU-${i},1,,`);

  it("takes exactly 200 lines", async () => {
    const parsed = await readTransferSheet(csvFile(csvOf(...lines(200))));

    expect(parsed.rows).toHaveLength(200);
  });

  it("refuses 201 lines, saying how many there are", async () => {
    await expect(
      readTransferSheet(csvFile(csvOf(...lines(201)))),
    ).rejects.toThrow(new SheetError(
      "File ini berisi 201 baris, sedangkan satu transfer maksimal 200 baris. Pecah jadi dua file, lalu buat dua transfer.",
    ));
  });
});

describe("the template", () => {
  it("has exactly the agreed columns, in order", () => {
    expect(TRANSFER_TEMPLATE_COLUMNS).toEqual([
      "sku",
      "jumlah",
      "kode_batch",
      "catatan",
    ]);
  });

  const capture = () => {
    const saved: Blob[] = [];
    jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    URL.createObjectURL = jest.fn((blob: Blob) => {
      saved.push(blob);
      return "blob:x";
    });
    URL.revokeObjectURL = jest.fn();
    return saved;
  };

  const read = <T extends string | ArrayBuffer>(
    blob: Blob,
    how: "readAsText" | "readAsArrayBuffer",
  ) =>
    new Promise<T>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as T);
      reader[how](blob);
    });

  it("saves a CSV holding only that header", async () => {
    const saved = capture();

    await saveTransferTemplate("csv");

    expect((await read<string>(saved[0], "readAsText")).trim()).toContain(
      "sku,jumlah,kode_batch,catatan",
    );
  });

  it("saves a workbook with the code columns held as text", async () => {
    const saved = capture();

    await saveTransferTemplate("xlsx");

    const XLSX = await import("xlsx");
    const workbook = XLSX.read(
      await read<ArrayBuffer>(saved[0], "readAsArrayBuffer"),
      { cellNF: true, sheetStubs: true },
    );
    const sheet = workbook.Sheets.Transfer;

    expect(["A1", "B1", "C1", "D1"].map((cell) => sheet[cell].v)).toEqual([
      "sku",
      "jumlah",
      "kode_batch",
      "catatan",
    ]);
    expect(sheet.A200.z).toBe("@");
  });
});

describe("TransferImportDialog", () => {
  const renderDialog = (hasLines = false) => {
    const onApply = jest.fn();
    render(
      <TransferImportDialog
        fromWarehouseId={WH_A}
        fromWarehouseName="Gudang Pusat"
        hasLines={hasLines}
        onApply={onApply}
        onClose={jest.fn()}
      />,
    );
    return onApply;
  };

  it("resolves a file against the source shelf as soon as it is read", async () => {
    const resolve = jest
      .spyOn(stockTransferService, "resolveImport")
      .mockResolvedValue(preview([verdict()]));
    const onApply = renderDialog();

    await userEvent.upload(
      screen.getByLabelText(ID_FIELD),
      csvFile(csvOf("RC-1KG,3,,")),
    );

    await screen.findByText(/Semua 1 baris siap/);
    expect(resolve).toHaveBeenCalledWith({
      fromWarehouseId: WH_A,
      rows: [{ rowNumber: 2, sku: "RC-1KG", qty: "3" }],
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Isi 1 baris ke form" }),
    );
    expect(onApply).toHaveBeenCalledWith([expect.objectContaining({ qty: "3.0000" })]);
  });

  it("says the file replaces what is on the form", async () => {
    jest
      .spyOn(stockTransferService, "resolveImport")
      .mockResolvedValue(preview([verdict()]));
    renderDialog(true);

    await userEvent.upload(
      screen.getByLabelText(ID_FIELD),
      csvFile(csvOf("RC-1KG,3,,")),
    );

    await screen.findByText(/akan diganti isi file ini/);
  });

  it("fills nothing while one row is wrong, and names that row", async () => {
    jest.spyOn(stockTransferService, "resolveImport").mockResolvedValue(
      preview([
        verdict(),
        verdict({
          rowNumber: 3,
          sku: "HILANG",
          status: "not_found",
          problems: [{ field: "sku", message: "SKU 'HILANG' tidak ditemukan" }],
        }),
      ]),
    );
    const onApply = renderDialog();

    await userEvent.upload(
      screen.getByLabelText(ID_FIELD),
      csvFile(csvOf("RC-1KG,3,,", "HILANG,1,,")),
    );

    await screen.findByText(/1 dari 2 baris perlu diperbaiki/);
    const row = screen.getByRole("row", { name: /HILANG/ });
    expect(within(row).getByText("3")).toBeInTheDocument();
    expect(within(row).getByText("Tidak ditemukan")).toBeInTheDocument();
    // Only the row to fix: the good one is not in the way.
    expect(screen.queryByText("Siap")).not.toBeInTheDocument();

    const fill = screen.getByRole("button", { name: "Isi ke form" });
    expect(fill).toBeDisabled();
    await userEvent.click(fill);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("refuses 201 lines without asking the server", async () => {
    const resolve = jest.spyOn(stockTransferService, "resolveImport");
    renderDialog();

    await userEvent.upload(
      screen.getByLabelText(ID_FIELD),
      csvFile(
        csvOf(...Array.from({ length: 201 }, (_, i) => `SKU-${i},1,,`)),
      ),
    );

    await screen.findByText(/berisi 201 baris/);
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("StockTransferForm, from a file", () => {
  const importFile = async (rows: TransferImportVerdict[]) => {
    jest
      .spyOn(stockTransferService, "resolveImport")
      .mockResolvedValue(preview(rows));

    await userEvent.click(
      await screen.findByRole("button", { name: "Impor file" }),
    );
    await userEvent.upload(
      screen.getByLabelText(ID_FIELD),
      csvFile(csvOf(...rows.map((row) => `${row.sku},1,,`))),
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: `Isi ${rows.length} baris ke form`,
      }),
    );
  };

  it("fills the form and posts nothing until Simpan", async () => {
    const create = mockServices();
    render(<StockTransferForm />);

    await importFile([verdict({ notes: "rusak" })]);

    expect(await screen.findByText("Produk p1")).toBeInTheDocument();
    expect(screen.getByLabelText("Jumlah Produk p1")).toHaveValue("3");
    expect(screen.getByLabelText("Catatan Produk p1")).toHaveValue("rusak");
    expect(create).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: /Simpan transfer/ }),
    );

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          fromWarehouseId: WH_A,
          toWarehouseId: WH_B,
          items: [{ productId: "p1", qty: "3", notes: "rusak" }],
        }),
      ),
    );
  });

  it("sends a blank batch on goods that expire as autoFefo", async () => {
    const create = mockServices([
      {
        _id: "lot1",
        productId: "p1",
        batchCode: "B-1",
        qtyRemaining: "10.0000",
        expiryDate: null,
      },
    ]);
    render(<StockTransferForm />);

    const row = verdict({ autoFefo: true });
    await importFile([
      { ...row, product: { ...row.product!, hasExpiry: true } },
    ]);

    await screen.findByText("Produk p1");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Simpan transfer/ }),
      ).toBeEnabled(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Simpan transfer/ }),
    );

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ productId: "p1", qty: "3", autoFefo: true }],
        }),
      ),
    );
  });

  it("sends a named batch as its id", async () => {
    const create = mockServices([
      {
        _id: "lot1",
        productId: "p1",
        batchCode: "B-1",
        qtyRemaining: "10.0000",
        expiryDate: null,
      },
    ]);
    render(<StockTransferForm />);

    const row = verdict({ batchId: "lot1", batchCode: "B-1" });
    await importFile([
      { ...row, product: { ...row.product!, hasExpiry: true } },
    ]);

    await screen.findByText("Produk p1");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Simpan transfer/ }),
      ).toBeEnabled(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Simpan transfer/ }),
    );

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ productId: "p1", qty: "3", batchId: "lot1" }],
        }),
      ),
    );
  });

  it("replaces the rows already on the form", async () => {
    mockServices();
    render(<StockTransferForm />);

    await importFile([verdict()]);
    await screen.findByText("Produk p1");

    await importFile([verdict({ productId: "p2", sku: "X" })]);

    await screen.findByText("Produk p2");
    expect(screen.queryByText("Produk p1")).not.toBeInTheDocument();
  });

  it("holds exactly 200 lines and can still be saved", async () => {
    const create = mockServices();
    render(<StockTransferForm />);

    await importFile(
      Array.from({ length: 200 }, (_, i) =>
        verdict({
          rowNumber: i + 2,
          sku: `SKU-${i}`,
          productId: `p${i}`,
        }),
      ),
    );

    expect(await screen.findByText("200 dari 200 baris")).toBeInTheDocument();
    // Fifty products used to be the end of the road.
    expect(screen.getByText(/Sudah 200 produk/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Simpan transfer/ }),
    );

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0].items).toHaveLength(200);
  }, 60_000);

  it("does not offer a file on a transfer being corrected", async () => {
    mockServices();
    const transfer = {
      _id: "tr1",
      transferNumber: "TRF/1",
      status: "in_transit",
      fromWarehouseId: WH_A,
      toWarehouseId: WH_B,
      items: [
        { productId: "p1", qty: "1.0000", batchId: null, autoFefo: false, notes: null },
      ],
      lines: [],
    } as unknown as StockTransferDetail;

    render(<StockTransferForm transfer={transfer} />);

    await screen.findByRole("button", { name: /Simpan transfer/ });
    expect(
      screen.queryByRole("button", { name: "Impor file" }),
    ).not.toBeInTheDocument();
  });
});

describe("StockTransferEditScreen, at 200 lines", () => {
  it("reads the products a few at a time, not all at once", async () => {
    mockServices();
    const items = Array.from({ length: 200 }, (_, i) => ({
      productId: `p${i}`,
      qty: "1.0000",
      batchId: null,
      autoFefo: false,
      notes: null,
    }));
    jest.spyOn(stockTransferService, "getById").mockResolvedValue({
      _id: "tr1",
      transferNumber: "TRF/1",
      status: "in_transit",
      fromWarehouseId: WH_A,
      toWarehouseId: WH_B,
      items,
      lines: [],
    } as never);

    let running = 0;
    let peak = 0;
    jest.spyOn(productService, "getById").mockImplementation(async (id) => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
      return { _id: id, name: id, sku: id, stockByWarehouse: [] } as never;
    });

    render(<StockTransferEditScreen transferId="tr1" />);

    await waitFor(
      () => expect(productService.getById).toHaveBeenCalledTimes(200),
      { timeout: 10_000 },
    );
    expect(peak).toBeLessThanOrEqual(10);
  }, 60_000);
});
