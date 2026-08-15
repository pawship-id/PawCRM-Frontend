import { render, screen, waitFor, within } from "@testing-library/react";
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

    await user.click(await screen.findByRole("button", { name: "Gudang" }));
    await user.click(screen.getByRole("option", { name: "Gudang Bazar" }));

    await user.type(await screen.findByLabelText(/^Jumlah/), "5");
    await user.click(screen.getByRole("button", { name: /Simpan penyesuaian/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ warehouseId: OTHER_WAREHOUSE }),
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
      await screen.findByText(/Stok batch tidak mencukupi/),
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
