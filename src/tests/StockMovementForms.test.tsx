import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StockAdjustmentForm, StockTransferForm } from "@/features/inventory";
import { JournalPreview } from "@/features/inventory/components/JournalPreview";
import { productService } from "@/services/product.service";
import { warehouseService } from "@/services/warehouse.service";
import { stockMovementService } from "@/services/stockMovement.service";
import { productBatchService } from "@/services/productBatch.service";
import { ApiError } from "@/services/api-error";
import type { PageResult, Warehouse } from "@/types/api";
import type {
  PreviewMovementRow,
  Product,
  ProductBatch,
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
    location: { lat: null, lng: null, source: "manual" },
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
    productName: "Royal Canin Adult 3kg",
    movementType: "transfer_out",
    qty: "-4.0000",
    hppAtTime: "200000.0000",
    batchId: "b1",
    batchCode: "RC-B26-0455",
    batchExpiryDate: "2026-12-31T00:00:00.000Z",
    isNewBatch: false,
    destinationWarehouseId: OTHER_WAREHOUSE,
    short: false,
    lineNotes: null,
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
/** One lot, as the picker reads it: a code and what is left in it. */
function lot(overrides: Partial<ProductBatch> = {}): ProductBatch {
  return {
    _id: "lot-a",
    tenantId: "t1",
    warehouseId: WAREHOUSE,
    productId: PRODUCT,
    receiptId: null,
    batchCode: "WSK-A26",
    expiryDate: "2026-12-31T00:00:00.000Z",
    initialQty: "10.0000",
    qtyRemaining: "8.0000",
    costPerUnit: "200000.0000",
    isConsignment: false,
    createdBy: null,
    createdAt: "",
    updatedAt: "",
    productName: null,
    productSku: null,
    productUnit: null,
    warehouseName: null,
    ...overrides,
  };
}

function mockLookups({
  warehouses = [
    warehouse(WAREHOUSE, "Gudang Pusat"),
    warehouse(OTHER_WAREHOUSE, "Gudang Bazar"),
  ],
  detail = product(),
  catalogue,
  preview = previewOf(),
}: {
  warehouses?: Warehouse[];
  detail?: Product;
  /**
   * What `productService.list` answers with — the adjustment form's lookup AND
   * the transfer picker's search results, which is the same endpoint.
   */
  catalogue?: Product[];
  preview?: StockMovementPreview;
} = {}) {
  jest
    .spyOn(warehouseService, "list")
    .mockResolvedValue(page(warehouses) as never);
  jest
    .spyOn(productService, "list")
    .mockResolvedValue(page(catalogue ?? [detail]) as never);
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

/**
 * Picks the goods the adjustment is about.
 *
 * The form no longer opens on the first warehouse and the first product — a
 * default on a screen that writes stock is a suggestion somebody can save
 * without reading. So every test that fills this form starts here, which is
 * also the cheapest way to notice if either picker stops working.
 */
async function pickGoods(
  user: ReturnType<typeof userEvent.setup>,
  warehouse = "Gudang Pusat",
  product = "Royal Canin Adult 3kg",
  /**
   * False for a product that tracks lots: there the system figure belongs to a
   * BATCH, so the count field stays disabled until one is chosen and waiting
   * for it here would hang.
   */
  waitForStock = true,
) {
  await user.click(await screen.findByRole("button", { name: "Gudang" }));
  await user.click(screen.getByRole("option", { name: warehouse }));
  await user.click(screen.getByRole("button", { name: "Produk" }));
  await user.click(screen.getByRole("option", { name: product }));

  // The count field stays disabled until the system's own figure arrives —
  // there is nothing to subtract from until then. Typing into a disabled input
  // is a silent no-op, so a test that raced this would fill in nothing and fail
  // somewhere else entirely.
  if (waitForStock) {
    await waitFor(() =>
      expect(screen.getByLabelText(/^Stok baru/)).toBeEnabled(),
    );
  }
}

describe("StockAdjustmentForm", () => {
  /**
   * Nobody picks a direction any more: the field holds the quantity that is
   * really on the shelf, and the sign falls out of `baru − sistem`. The fixture
   * holds 20 at this warehouse, so a count of 25 is "+5".
   */
  it("derives a POSITIVE quantity from a count above the system's", async () => {
    const { create } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);
    await pickGoods(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "25");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "adjustment",
          productId: PRODUCT,
          warehouseId: WAREHOUSE,
          // Four decimals, as the ledger stores them — the subtraction is done
          // in minor units, not by string concatenation.
          qty: "5.0000",
        }),
      ),
    );
  });

  /**
   * The picker is a popover now, matching the filter panels next door — and the
   * tests around it all rode on the form's auto-selection of the first
   * warehouse, so none of them would have noticed if choosing one stopped
   * working. This one drives it.
   */
  it("saves against the warehouse chosen in the picker, not the default", async () => {
    const { create } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);
    await pickGoods(user, "Gudang Bazar");

    await user.type(await screen.findByLabelText(/^Stok baru/), "5");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ warehouseId: OTHER_WAREHOUSE }),
      ),
    );
  });

  it("derives a NEGATIVE quantity from a count below the system's", async () => {
    const { create } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);
    await pickGoods(user);

    // 20 on the system, 17 counted. Nobody types a minus, and nobody classifies
    // their own arithmetic before doing it.
    await user.type(await screen.findByLabelText(/^Stok baru/), "17");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ qty: "-3.0000" }),
      ),
    );
  });

  /**
   * The rule the business owner asked for, and the form's shape rather than a
   * message: the field holds what IS there, and a count is never below nothing.
   */
  it("refuses a count below zero", async () => {
    const { create } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);
    await pickGoods(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "-4");

    // The button does not wait to be pressed to refuse — and it says why,
    // because a greyed-out primary action that explains nothing sends people
    // filling fields at random to find the one it minds about.
    expect(
      screen.getByRole("button", { name: /Simpan penyesuaian/ }),
    ).toBeDisabled();
    expect(
      await screen.findByText("Stok tidak bisa kurang dari nol."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));
    expect(create).not.toHaveBeenCalled();
  });

  it("becomes pressable the moment the form is whole", async () => {
    mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);

    // Nothing chosen: the button already knows it cannot save.
    expect(
      await screen.findByRole("button", { name: /Simpan penyesuaian/ }),
    ).toBeDisabled();

    await pickGoods(user);
    // Goods chosen, count still empty — still not enough.
    expect(
      screen.getByRole("button", { name: /Simpan penyesuaian/ }),
    ).toBeDisabled();

    await user.type(screen.getByLabelText(/^Stok baru/), "25");
    expect(
      screen.getByRole("button", { name: /Simpan penyesuaian/ }),
    ).toBeEnabled();
  });

  it("writes nothing when the count agrees with the system", async () => {
    const { create } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);
    await pickGoods(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "20");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    expect(
      await screen.findByText(/tidak ada yang perlu dicatat/i),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("previews the SAME payload it would save", async () => {
    const { create, preview } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);
    await pickGoods(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "25");
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

  /**
   * The strip used to explain the weighted average here. It is gone: the
   * average is the system's own arithmetic over every movement, and showing the
   * working invited a decision this screen does not have.
   */
  it("does not show the HPP working — the system owns that arithmetic", async () => {
    mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);
    await pickGoods(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "25");
    await settlePreview();

    expect(
      screen.queryByText(/Perhitungan HPP rata-rata tertimbang/),
    ).not.toBeInTheDocument();
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
    await pickGoods(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "14");
    await settlePreview();

    expect(await screen.findByText(/Alokasi FEFO/)).toBeInTheDocument();
    expect(screen.getByText("2 baris movement")).toBeInTheDocument();
    expect(screen.getByText("RC-B26-0456")).toBeInTheDocument();
  });

  /**
   * This used to assert the opposite: a short withdrawal was previewed with a
   * warning and saved anyway. It can no longer be ASKED FOR. The field holds
   * the count, the count is at least zero, and the largest reduction it can
   * express is therefore exactly what the shelf holds — the guarantee is the
   * form's arithmetic, not a check somebody could route around.
   */
  it("cannot ask for more than the shelf holds", async () => {
    const { create } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);
    await pickGoods(user);

    // 20 on the system. The most that can leave is 20, reached by counting 0.
    await user.type(await screen.findByLabelText(/^Stok baru/), "0");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ qty: "-20.0000" }),
      ),
    );
  });

  /**
   * A product that tracks lots has no single balance to correct — it has one
   * per lot, and the person counting is holding a particular box. So the lot
   * comes first, and it is CHOSEN rather than typed.
   */
  it("insists on a batch before anything else, for a product that tracks them", async () => {
    const { create } = mockLookups({ detail: product({ hasExpiry: true }) });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);
    await pickGoods(user, "Gudang Pusat", "Royal Canin Adult 3kg", false);
    await screen.findByRole("button", { name: "Kode batch" });

    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    expect(
      await screen.findByText(/pilih batch mana yang disesuaikan/i),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("offers the lots the warehouse already holds, not a blank picker", async () => {
    mockLookups({ detail: product({ hasExpiry: true }) });
    jest.spyOn(productBatchService, "list").mockResolvedValue({
      items: [lot()],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);
    await pickGoods(user, "Gudang Pusat", "Royal Canin Adult 3kg", false);

    await user.click(
      await screen.findByRole("button", { name: "Kode batch" }),
    );

    // The lot is named with what a person needs to recognise it by — its code
    // and what is left in it.
    expect(
      await screen.findByRole("option", { name: /WSK-A26 · sisa 8/ }),
    ).toBeInTheDocument();
  });

  it("says an empty picker is empty, rather than showing one lonely option", async () => {
    mockLookups({ detail: product({ hasExpiry: true }) });
    jest.spyOn(productBatchService, "list").mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);
    await pickGoods(user, "Gudang Pusat", "Royal Canin Adult 3kg", false);

    // Without this, "no lots here" and "the read was refused" look identical:
    // a picker with nothing but "+ Batch baru…" in it.
    expect(
      await screen.findByText(/Belum ada batch untuk produk ini/),
    ).toBeInTheDocument();

    // And it goes away once its advice has been taken — a prompt telling
    // somebody to do what they have just done is noise.
    await user.click(screen.getByRole("button", { name: "Kode batch" }));
    await user.click(screen.getByRole("option", { name: /Batch baru/ }));

    expect(
      screen.queryByText(/Belum ada batch untuk produk ini/),
    ).not.toBeInTheDocument();
  });

  /**
   * A lot id belongs to one product at one warehouse. Left behind after a
   * switch it pointed at a lot the new product does not have — visible as a raw
   * ObjectId in the picker, and dangerous underneath: the id stayed in state,
   * so a save would have attached the adjustment to another product's lot.
   */
  it("forgets the batch and the count when the goods change", async () => {
    mockLookups({ detail: product({ hasExpiry: true }) });
    jest.spyOn(productBatchService, "list").mockResolvedValue({
      items: [lot()],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);
    await pickGoods(user, "Gudang Pusat", "Royal Canin Adult 3kg", false);

    await user.click(
      await screen.findByRole("button", { name: "Kode batch" }),
    );
    await user.click(await screen.findByRole("option", { name: /WSK-A26/ }));
    expect(
      screen.getByRole("button", { name: "Kode batch" }),
    ).toHaveTextContent("WSK-A26");

    // Switch warehouses. The picker must fall back to its placeholder, not to
    // the id of a lot that lives somewhere else.
    await user.click(screen.getByRole("button", { name: "Gudang" }));
    await user.click(screen.getByRole("option", { name: "Gudang Bazar" }));

    expect(
      await screen.findByRole("button", { name: "Kode batch" }),
    ).toHaveTextContent("Pilih batch");
  });

  it("describes a brand-new batch, and never sends it beside an existing id", async () => {
    const { create } = mockLookups({ detail: product({ hasExpiry: true }) });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);
    await pickGoods(user, "Gudang Pusat", "Royal Canin Adult 3kg", false);

    await user.click(
      await screen.findByRole("button", { name: "Kode batch" }),
    );
    await user.click(screen.getByRole("option", { name: /Batch baru/ }));

    await user.type(screen.getByLabelText(/Kode batch baru/), "WSK-B26-0640");
    await user.type(screen.getByLabelText(/Tanggal kedaluwarsa/), "2026-12-31");
    // A new lot starts at nothing, so whatever is counted is the whole arrival.
    await user.type(screen.getByLabelText(/^Stok baru/), "6");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          qty: "6.0000",
          batchCode: "WSK-B26-0640",
          // Naming a lot and creating one are mutually exclusive — the API
          // refuses the pair, so the form never assembles it.
          batchId: undefined,
        }),
      ),
    );
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
    await pickGoods(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "25");
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
    await pickGoods(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "25");
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
    await user.type(screen.getByLabelText(/^Stok baru/), "2");
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
    await pickGoods(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "25");
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

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);

    // Read from the picker's own list rather than from the page: the options
    // only exist while it is open.
    await user.click(await screen.findByRole("button", { name: "Gudang" }));

    expect(
      screen.getByRole("option", { name: "Gudang Pusat" }),
    ).toBeInTheDocument();
    // The stock card lists inactive warehouses because it only reads; here one
    // would be a rejection waiting to happen.
    expect(
      screen.queryByRole("option", { name: /Gudang Tutup/ }),
    ).not.toBeInTheDocument();
  });
});

/**
 * Puts a product on the transfer form the way a user does — through the picker
 * dialog, which is the ONLY way onto it.
 *
 * Unlike the form's Radix selects, this dialog IS drivable in jsdom: a search
 * box, a checkbox per match and a footer button. The picker's candidate list is
 * debounced, hence the timer advance before the checkbox is looked for.
 */
async function addProducts(
  user: ReturnType<typeof userEvent.setup>,
  count = 1,
) {
  await user.click(await screen.findByRole("button", { name: /Tambah produk/ }));

  const dialog = await screen.findByRole("dialog");
  await waitFor(() => jest.advanceTimersByTime(400));

  const boxes = await within(dialog).findAllByRole("checkbox");
  for (const box of boxes.slice(0, count)) await user.click(box);

  await user.click(within(dialog).getByRole("button", { name: /Tambahkan/ }));
}

describe("StockTransferForm", () => {
  it("sends both warehouse ids and a positive quantity, as one item", async () => {
    const { create } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await addProducts(user);
    await user.type(await screen.findByLabelText(/^Jumlah/), "6");
    await user.click(screen.getByRole("button", { name: /Simpan transfer/ }));

    // Direction comes from the two ids, never from a sign — "pindahkan -5 dari A
    // ke B" is the other direction written so every report reads backwards.
    //
    // The product travels in `items`, not at the top level: one transfer may
    // carry several, and the API refuses the old single-product shape outright.
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "transfer",
          fromWarehouseId: WAREHOUSE,
          toWarehouseId: OTHER_WAREHOUSE,
          items: [{ productId: PRODUCT, qty: "6" }],
        }),
      ),
    );
  });

  /**
   * BOTH LEVELS OF NOTE REACH THE PAYLOAD, and each is omitted when blank
   * rather than sent as "". An empty string is a note that says nothing, and
   * storing one on every row of a transfer nobody annotated would fill the
   * stock card's notes column with silence that looks like content.
   */
  it("carries the transfer's note and the line's own", async () => {
    const { create } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await addProducts(user);
    await user.type(await screen.findByLabelText(/^Jumlah/), "6");
    await user.type(
      screen.getByLabelText("Catatan transfer"),
      "persiapan bazar",
    );
    await user.type(screen.getByLabelText(/^Catatan Royal Canin/), "lot dekat ED");
    await user.click(screen.getByRole("button", { name: /Simpan transfer/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: "persiapan bazar",
          items: [
            { productId: PRODUCT, qty: "6", notes: "lot dekat ED" },
          ],
        }),
      ),
    );
  });

  /**
   * A PRODUCT ALREADY ON THE FORM IS NOT OFFERED AGAIN. The API refuses a
   * transfer carrying one twice — FEFO reads the source lots once per line and
   * would allocate the same goods to both — so a tick that could only ever
   * produce a refusal is worse than an absence. Preventing it beats validating
   * it: that rule is not something a clerk can be expected to know.
   */
  it("does not offer a product already on the form", async () => {
    mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await addProducts(user);
    // Reopened, with the catalogue's only product now on the form.
    await user.click(screen.getByRole("button", { name: /Tambah produk/ }));
    await waitFor(() => jest.advanceTimersByTime(400));

    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(/sudah ditambahkan/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("reports how many products moved, not just how many rows", async () => {
    const { create } = mockLookups();
    // Two lots × an out/in pair: four rows from one product.
    create.mockResolvedValue([{}, {}, {}, {}] as never);

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await addProducts(user);
    await user.type(await screen.findByLabelText(/^Jumlah/), "6");
    await user.click(screen.getByRole("button", { name: /Simpan transfer/ }));

    await waitFor(() =>
      expect(Swal.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("1 produk, 4 baris"),
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

    await addProducts(user);
    await user.type(await screen.findByLabelText(/^Jumlah/), "6");
    await settlePreview();

    // Two lots × an out/in pair each.
    expect(await screen.findByText("Batch yang berpindah")).toBeInTheDocument();
    expect(screen.getByText("4 baris movement")).toBeInTheDocument();
  });

  /**
   * The picker exists because a transfer is normally several products at once.
   * Ticking two and confirming must produce two rows in one payload, not two
   * transfers — that is the whole reason `items` is an array.
   */
  /**
   * The two ends used to be signalled only by a red border until somebody
   * pressed Simpan — status by colour alone, and nothing at all for a reader
   * who cannot see it.
   */
  it("says the two ends are the same as soon as they are, not on submit", async () => {
    mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await user.click(await screen.findByRole("button", { name: "Ke gudang" }));
    await user.click(screen.getByRole("option", { name: "Gudang Pusat" }));

    expect(
      await screen.findByText("Gudang asal dan tujuan harus berbeda."),
    ).toBeInTheDocument();
  });

  it("puts every product ticked in the picker into one payload", async () => {
    const second = product({ _id: "p2", sku: "SH-1L", name: "Shampoo Anjing" });
    const { create } = mockLookups({ catalogue: [product(), second] });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await addProducts(user, 2);

    const quantities = await screen.findAllByLabelText(/^Jumlah/);
    expect(quantities).toHaveLength(2);
    await user.type(quantities[0], "6");
    await user.type(quantities[1], "2");

    await user.click(screen.getByRole("button", { name: /Simpan transfer/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            { productId: PRODUCT, qty: "6" },
            { productId: "p2", qty: "2" },
          ],
        }),
      ),
    );
  });

  /**
   * A MINUS SIGN NEVER REACHES THE FIELD. The direction of a transfer comes
   * from its two warehouse ids, so "-5" is not a quantity the user meant — it is
   * the same move written so that every report reads backwards. Filtered as it
   * is typed rather than complained about afterwards.
   */
  it("refuses to hold a negative quantity", async () => {
    mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await addProducts(user);

    const qty = await screen.findByLabelText(/^Jumlah/);
    await user.type(qty, "-5");

    expect(qty).toHaveValue("5");
  });

  /** Decimals survive: `unit` is free text, and half a sack of feed is real. */
  it("keeps a decimal quantity", async () => {
    mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await addProducts(user);

    const qty = await screen.findByLabelText(/^Jumlah/);
    await user.type(qty, "2.5");

    expect(qty).toHaveValue("2.5");
  });

  /**
   * REFUSED, where a sale of the same shortfall would be RECORDED. Nothing has
   * left a shelf yet — this form is what moves it — so asking for more than the
   * source holds is a typo to correct, not a fact to record. Posting it would
   * drive the source negative AND invent a unit at the destination.
   *
   * The API refuses it too; this is the same refusal said earlier, in the row
   * that caused it. Blocking the submit is what stops the user discovering it
   * after filling in twelve rows.
   */
  it("blocks a quantity larger than the source warehouse holds", async () => {
    // The fixture holds 20 at the source warehouse.
    const { create, preview } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await addProducts(user);
    await user.type(await screen.findByLabelText(/^Jumlah/), "21");
    await settlePreview();

    expect(await screen.findByText(/Melebihi stok/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Simpan transfer/ }),
    ).toBeDisabled();

    // Not even asked about: the API would refuse the whole payload, so the
    // request could only ever come back as an error.
    expect(preview).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("allows moving exactly what is on hand", async () => {
    const { create } = mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await addProducts(user);
    // Emptying a warehouse is a normal thing to do — the guard is against going
    // BELOW zero, not against reaching it.
    await user.type(await screen.findByLabelText(/^Jumlah/), "20");
    await user.click(screen.getByRole("button", { name: /Simpan transfer/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ items: [{ productId: PRODUCT, qty: "20" }] }),
      ),
    );
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

/**
 * The panel every writing screen renders — the adjustment and transfer forms,
 * the goods receipt and the purchase return all feed it the lines their own
 * preview endpoint returned.
 */
describe("JournalPreview", () => {
  /**
   * ONE ROW PER LINE AS SENT, and the empty side is a DASH.
   *
   * Two endpoints feed this panel and they say "nothing on this side"
   * differently: the movement preview sends `null`, the goods receipt and the
   * purchase return send `"0"`. A truthiness check printed the first as a dash
   * and the second as "Rp 0", so which side a line sat on could only be learned
   * by reading both columns — the same confusion that hid a real bug on the
   * ledger's own detail page.
   */
  it("shows an empty side as a dash whether the API sent 0 or null", () => {
    render(
      <JournalPreview
        lines={[
          {
            accountCode: "1205",
            accountName: "Persediaan Hotel",
            debit: "160000.0000",
            credit: "0",
          },
          {
            accountCode: "2101",
            accountName: "Utang Supplier",
            debit: null,
            credit: "160000.0000",
          },
        ]}
      />,
    );

    const debitRow = screen.getByText("Persediaan Hotel").closest("tr")!;
    expect(within(debitRow).getByText("Rp 160.000")).toBeInTheDocument();
    expect(within(debitRow).getByText("—")).toBeInTheDocument();

    const creditRow = screen.getByText("Utang Supplier").closest("tr")!;
    expect(within(creditRow).getByText("Rp 160.000")).toBeInTheDocument();

    expect(screen.queryByText("Rp 0")).not.toBeInTheDocument();
  });

  /**
   * A delivery carrying retail goods and hotel supplies debits two different
   * asset accounts, because the products name them. The receipt used to blend
   * both into one 1201 line and the split was unrecoverable afterwards.
   */
  it("keeps one row per inventory account on a mixed delivery", () => {
    render(
      <JournalPreview
        lines={[
          {
            accountCode: "1205",
            accountName: "Persediaan Hotel",
            debit: "160000.0000",
            credit: "0",
          },
          {
            accountCode: "1201",
            accountName: "Persediaan Barang Dagangan",
            debit: "2000000.0000",
            credit: "0",
          },
          {
            accountCode: "2101",
            accountName: "Utang Supplier",
            debit: "0",
            credit: "2160000.0000",
          },
        ]}
      />,
    );

    const hotelRow = screen.getByText("Persediaan Hotel").closest("tr")!;
    const retailRow = screen
      .getByText("Persediaan Barang Dagangan")
      .closest("tr")!;

    expect(within(hotelRow).getByText("Rp 160.000")).toBeInTheDocument();
    expect(within(retailRow).getByText("Rp 2.000.000")).toBeInTheDocument();

    // Σdebit is the same whether it took one line or two, so the panel still
    // says the entry balances.
    expect(screen.getByText(/SEIMBANG/i)).toBeInTheDocument();
  });
});
