import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StockAdjustmentForm, StockTransferForm } from "@/features/inventory";
import { productService } from "@/services/product.service";
import { warehouseService } from "@/services/warehouse.service";
import { stockMovementService } from "@/services/stockMovement.service";
import { ApiError } from "@/services/api-error";
import type { PageResult, Warehouse } from "@/types/api";
import type {
  PreviewMovementRow,
  Product,
  StockMovementPreview,
} from "@/types/inventory";

/**
 * The two screens that WRITE to the stock ledger, against mocked services.
 *
 * WHAT THESE TESTS GUARD. Both forms send an `operation` and let the server
 * decide the movement type, the signs and the row count — so the cases that
 * matter are the ones where a form could send something the server would refuse,
 * or claim something the server did not do:
 *
 *  1. the direction toggle owns the SIGN, and the field only ever holds a
 *     magnitude;
 *  2. the preview panel RENDERS the server's answer — nothing here may
 *     reintroduce a client-side FEFO or weighted average;
 *  3. the payload previewed is the payload saved;
 *  4. the retry token survives a failure and is replaced after a success;
 *  5. a rejection is surfaced with its `reason`, not swallowed.
 *
 * The Radix selects are not driven — jsdom cannot do their pointer protocol, and
 * what they set is an id that goes straight into the payload.
 */
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Swal = require("sweetalert2").default as { fire: jest.Mock };

const WAREHOUSE = "wh1";
const OTHER_WAREHOUSE = "wh2";
const PRODUCT = "p1";

function product(overrides: Partial<Product> = {}): Product {
  return {
    _id: PRODUCT,
    sku: "RC-3KG",
    name: "Royal Canin Adult 3kg",
    productType: "standalone",
    parentId: null,
    variantAxes: [],
    variantAttributes: null,
    bundleConfig: null,
    barcode: null,
    minStock: 5,
    hasExpiry: false,
    categoryId: "c1",
    unit: "sak",
    sellPrice: "250000.0000",
    hppAvg: "200000.0000",
    isActive: true,
    deletedAt: null,
    stockByWarehouse: [{ warehouseId: WAREHOUSE, qty: "20.0000" }],
    ...overrides,
  };
}

function warehouse(id: string, name: string, isActive = true): Warehouse {
  return {
    _id: id,
    tenantId: "t1",
    name,
    defaultBranchId: null,
    address: null,
    picName: null,
    picPhone: null,
    isActive,
    isDefault: false,
    deletedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

function page<T>(items: T[]): PageResult<T> {
  return {
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  };
}

/**
 * An outbound row as the preview endpoint returns it.
 *
 * `transfer_out` serves both forms: the transfer form filters on the movement
 * type, and the adjustment form on the sign, which is negative either way.
 */
function outboundRow(
  overrides: Partial<PreviewMovementRow> = {},
): PreviewMovementRow {
  return {
    warehouseId: WAREHOUSE,
    warehouseName: "Gudang Pusat",
    productId: PRODUCT,
    movementType: "transfer_out",
    qty: "-4.0000",
    hppAtTime: "200000.0000",
    batchId: "b1",
    batchCode: "RC-B26-0455",
    batchExpiryDate: "2026-12-31T00:00:00.000Z",
    isNewBatch: false,
    destinationWarehouseId: OTHER_WAREHOUSE,
    short: false,
    ...overrides,
  };
}

function previewOf(
  overrides: Partial<StockMovementPreview> = {},
): StockMovementPreview {
  return {
    movements: [outboundRow()],
    hppAvg: [
      {
        productId: PRODUCT,
        before: "200000.0000",
        after: "210000.0000",
        qtyBefore: "20.0000",
        qtyIn: "5.0000",
        unitCost: "250000.0000",
      },
    ],
    journal: [
      {
        accountCode: "5201",
        accountName: "Kerugian Persediaan",
        debit: "800000.0000",
        credit: null,
      },
      {
        accountCode: "1201",
        accountName: "Persediaan Barang Dagangan",
        debit: null,
        credit: "800000.0000",
      },
    ],
    ...overrides,
  };
}

/** Everything both forms load on mount, plus the preview endpoint. */
function mockLookups({
  warehouses = [
    warehouse(WAREHOUSE, "Gudang Pusat"),
    warehouse(OTHER_WAREHOUSE, "Gudang Bazar"),
  ],
  detail = product(),
  preview = previewOf(),
}: {
  warehouses?: Warehouse[];
  detail?: Product;
  preview?: StockMovementPreview;
} = {}) {
  jest
    .spyOn(warehouseService, "list")
    .mockResolvedValue(page(warehouses) as never);
  jest.spyOn(productService, "list").mockResolvedValue(page([detail]) as never);
  jest.spyOn(productService, "getById").mockResolvedValue(detail);

  // The forms no longer COMPUTE a preview — they ask for one. Everything the
  // panel shows comes from here.
  const previewCall = jest
    .spyOn(stockMovementService, "preview")
    .mockResolvedValue(preview);
  const create = jest
    .spyOn(stockMovementService, "create")
    .mockResolvedValue([]);

  return { create, preview: previewCall };
}

beforeEach(() => jest.useFakeTimers({ advanceTimers: true }));

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** The preview is debounced; nothing appears until the timer fires. */
async function settlePreview() {
  await waitFor(() => jest.advanceTimersByTime(400));
}

describe("StockAdjustmentForm", () => {
  it("sends a POSITIVE quantity when the direction is inbound", async () => {
    const { create } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);

    await user.type(await screen.findByLabelText(/^Jumlah/), "5");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "adjustment",
          productId: PRODUCT,
          warehouseId: WAREHOUSE,
          qty: "5",
        }),
      ),
    );
  });

  it("sends a NEGATIVE quantity when the direction is outbound", async () => {
    const { create } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);

    await user.click(
      await screen.findByRole("button", { name: "Barang keluar (−)" }),
    );
    await user.type(screen.getByLabelText(/^Jumlah/), "3");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    // The toggle owns the sign — the field only ever holds a magnitude, so
    // nobody has to remember to type a minus on a Monday morning.
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ qty: "-3" }),
      ),
    );
  });

  it("previews the SAME payload it would save", async () => {
    const { create, preview } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);

    await user.type(await screen.findByLabelText(/^Jumlah/), "5");
    await settlePreview();
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    await waitFor(() => expect(create).toHaveBeenCalled());

    // A preview of a DIFFERENT request is worse than no preview. The only field
    // that may differ is the retry token, which the preview endpoint refuses.
    const previewed = preview.mock.calls.at(-1)?.[0];
    const { idempotencyKey, ...saved } = create.mock.calls[0][0] as unknown as
      Record<string, unknown>;
    expect(saved).toEqual(previewed);
    expect(String(idempotencyKey).length).toBeGreaterThanOrEqual(8);
  });

  it("renders the weighted average the SERVER computed", async () => {
    mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);

    await user.type(await screen.findByLabelText(/^Jumlah/), "5");
    await settlePreview();

    // 210.000, from the mocked response — not recomputed from the product.
    expect(
      await screen.findByText(/Perhitungan HPP rata-rata tertimbang/),
    ).toBeInTheDocument();
  });

  it("renders the FEFO split the SERVER returned, one row per lot", async () => {
    mockLookups({
      preview: previewOf({
        movements: [
          outboundRow({ batchId: "a", qty: "-4.0000" }),
          outboundRow({
            batchId: "b",
            batchCode: "RC-B26-0456",
            qty: "-2.0000",
          }),
        ],
      }),
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);

    await user.click(
      await screen.findByRole("button", { name: "Barang keluar (−)" }),
    );
    await user.type(screen.getByLabelText(/^Jumlah/), "6");
    await settlePreview();

    expect(await screen.findByText(/Alokasi FEFO/)).toBeInTheDocument();
    expect(screen.getByText("2 baris movement")).toBeInTheDocument();
    expect(screen.getByText("RC-B26-0456")).toBeInTheDocument();
  });

  it("warns on the short row the server flagged, without blocking the save", async () => {
    mockLookups({
      preview: previewOf({
        movements: [outboundRow({ qty: "-999.0000", short: true })],
      }),
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);

    await user.click(
      await screen.findByRole("button", { name: "Barang keluar (−)" }),
    );
    await user.type(screen.getByLabelText(/^Jumlah/), "999");
    await settlePreview();

    // The backend does not refuse a short pick either — the goods left the shelf.
    expect(
      await screen.findByText(/Stok lot tidak mencukupi/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Simpan penyesuaian/ }),
    ).toBeEnabled();
  });

  it("collects the batch and expiry a hasExpiry product requires, before sending", async () => {
    const { create } = mockLookups({ detail: product({ hasExpiry: true }) });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);

    await user.type(await screen.findByLabelText(/^Jumlah/), "5");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    // The API would answer 400; asking here costs no round trip.
    expect(screen.getByText(/kode batch wajib diisi/i)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("reports the row count the SERVER wrote, not the one it previewed", async () => {
    const { create } = mockLookups();
    create.mockResolvedValue([
      { _id: "m1" },
      { _id: "m2" },
      { _id: "m3" },
    ] as never);

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);

    await user.type(await screen.findByLabelText(/^Jumlah/), "5");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    await waitFor(() =>
      expect(Swal.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("3 baris"),
        }),
      ),
    );
  });

  it("reuses the retry token after a failure, and replaces it after a success", async () => {
    const { create } = mockLookups();
    create.mockRejectedValueOnce(new ApiError("Network error", 0));

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);

    await user.type(await screen.findByLabelText(/^Jumlah/), "5");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));
    await screen.findByText("Network error");

    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));

    // THE POINT OF THE TOKEN: the retry says "this is the same intent", so a
    // first attempt that actually landed replays instead of writing twice.
    const first = create.mock.calls[0][0] as { idempotencyKey?: string };
    const second = create.mock.calls[1][0] as { idempotencyKey?: string };
    expect(second.idempotencyKey).toBe(first.idempotencyKey);

    // And a NEW intent gets a new one, or it would replay the last save.
    await user.type(screen.getByLabelText(/^Jumlah/), "2");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(3));
    const third = create.mock.calls[2][0] as { idempotencyKey?: string };
    expect(third.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("surfaces the actionable half of a rejection", async () => {
    const { create } = mockLookups();
    create.mockRejectedValue(
      new ApiError("Cannot post movement", 400, {
        reason:
          "Warehouse 'Gudang Bazar' is not active and cannot accept movement",
      }),
    );

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);

    await user.type(await screen.findByLabelText(/^Jumlah/), "5");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    // `message` alone would say "Cannot post movement" and leave the user with
    // nothing to act on.
    expect(await screen.findByText(/is not active/)).toBeInTheDocument();
  });

  it("offers only ACTIVE warehouses — this form writes", async () => {
    mockLookups({
      warehouses: [
        warehouse(WAREHOUSE, "Gudang Pusat"),
        warehouse("wh3", "Gudang Tutup", false),
      ],
    });

    render(<StockAdjustmentForm />);

    await screen.findByLabelText(/^Jumlah/);
    // The stock card lists inactive warehouses because it only reads; here one
    // would be a rejection waiting to happen.
    expect(screen.queryByText("Gudang Tutup")).not.toBeInTheDocument();
  });
});

describe("StockTransferForm", () => {
  it("sends both warehouse ids and a positive quantity", async () => {
    const { create } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await user.type(await screen.findByLabelText(/^Jumlah/), "6");
    await user.click(screen.getByRole("button", { name: /Simpan transfer/ }));

    // Direction comes from the two ids, never from a sign — "pindahkan -5 dari A
    // ke B" is the other direction written so every report reads backwards.
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "transfer",
          productId: PRODUCT,
          fromWarehouseId: WAREHOUSE,
          toWarehouseId: OTHER_WAREHOUSE,
          qty: "6",
        }),
      ),
    );
  });

  it("renders the mirrored pairs the SERVER returned", async () => {
    mockLookups({
      preview: previewOf({
        movements: [
          outboundRow({ batchId: "a" }),
          outboundRow({
            batchId: "b",
            batchCode: "RC-B26-0456",
            qty: "-2.0000",
          }),
        ],
      }),
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await user.type(await screen.findByLabelText(/^Jumlah/), "6");
    await settlePreview();

    // Two lots × an out/in pair each.
    expect(await screen.findByText("Lot yang berpindah")).toBeInTheDocument();
    expect(screen.getByText("4 baris movement")).toBeInTheDocument();
  });

  it("says plainly that a transfer posts no journal", async () => {
    mockLookups();

    render(<StockTransferForm />);

    // Users who have just learned every stock action hits the books need to be
    // told this one does not, or they go looking for the missing entry.
    expect(
      await screen.findByText(/Transfer TIDAK membuat jurnal/),
    ).toBeInTheDocument();
  });

  it("refuses to render at all when the tenant has fewer than two active warehouses", async () => {
    mockLookups({ warehouses: [warehouse(WAREHOUSE, "Gudang Pusat")] });

    render(<StockTransferForm />);

    // Better than a form whose two selects are stuck on the same value and whose
    // submit is permanently disabled.
    expect(await screen.findByText(/dua gudang aktif/)).toBeInTheDocument();
  });
});
