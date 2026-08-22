import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  OpeningStockForm,
  StockAdjustmentForm,
  StockTransferForm,
} from "@/features/inventory";
import {
  FULL_REACH_USER,
  renderWithAuth as render,
} from "./helpers/renderWithAuth";
import { JournalPreview } from "@/features/inventory/components/JournalPreview";
import { blockingReason } from "@/features/inventory/utils/blocker";
import { productService } from "@/services/product.service";
import { branchService } from "@/services/branch.service";
import { warehouseService } from "@/services/warehouse.service";
import { stockMovementService } from "@/services/stockMovement.service";
import { stockEntryService } from "@/services/stockEntry.service";
import { productBatchService } from "@/services/productBatch.service";
import { ApiError } from "@/services/api-error";
import type { PageResult, User, Warehouse } from "@/types/api";
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

// The opening-stock sheet leaves for the stock card once a save lands, which is
// the half of "it worked" a toast never has to do.
const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Swal = require("sweetalert2").default as { fire: jest.Mock };

const WAREHOUSE = "wh1";
const OTHER_WAREHOUSE = "wh2";
const PRODUCT = "p1";

function product(overrides: Partial<Product> = {}): Product {
  return {
    _id: PRODUCT,
    isConsignment: false,
    isPreorder: false,
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

const BRANCH = "br1";

/** The one branch these forms offer, and the one every warehouse defaults to. */
function branchFixture() {
  return { _id: BRANCH, name: "Cabang Pusat", isActive: true };
}

/**
 * Warehouses carry a default branch, which is the ordinary shape: every branch
 * is auto-provisioned one. `defaultBranchId: null` — the central warehouse
 * serving several branches — is passed explicitly by the test that needs it.
 */
function warehouse(
  id: string,
  name: string,
  isActive = true,
  defaultBranchId: string | null = BRANCH,
): Warehouse {
  return {
    _id: id,
    tenantId: "t1",
    name,
    defaultBranchId,
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
  batches = [],
  preview = previewOf(),
}: {
  warehouses?: Warehouse[];
  detail?: Product;
  /**
   * What `productService.list` answers with — the adjustment form's lookup AND
   * the transfer picker's search results, which is the same endpoint.
   */
  catalogue?: Product[];
  /**
   * The lots at the SOURCE warehouse, which the transfer form reads so a
   * lot-tracked product can name the one that leaves the shelf. Empty by
   * default: a product without `hasExpiry` never asks.
   */
  batches?: ProductBatch[];
  preview?: StockMovementPreview;
} = {}) {
  jest
    .spyOn(warehouseService, "list")
    .mockResolvedValue(page(warehouses) as never);
  jest
    .spyOn(productService, "list")
    .mockResolvedValue(page(catalogue ?? [detail]) as never);
  jest.spyOn(productService, "getById").mockResolvedValue(detail);
  jest
    .spyOn(productBatchService, "list")
    .mockResolvedValue(page(batches) as never);

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
 * Puts products on a sheet the way a user does — through the picker dialog,
 * which is the ONLY way onto any of them.
 *
 * Unlike the forms' Radix selects, this dialog IS drivable in jsdom: a search
 * box, a checkbox per match and a footer button. The picker's candidate list is
 * debounced, hence the timer advance before the checkbox is looked for.
 */
async function addProducts(
  user: ReturnType<typeof userEvent.setup>,
  count = 1,
) {
  await user.click(
    await screen.findByRole("button", { name: /Tambah produk/ }),
  );

  const dialog = await screen.findByRole("dialog");
  await waitFor(() => jest.advanceTimersByTime(400));

  const boxes = await within(dialog).findAllByRole("checkbox");
  for (const box of boxes.slice(0, count)) await user.click(box);

  await user.click(within(dialog).getByRole("button", { name: /Tambahkan/ }));
}

describe("StockAdjustmentForm", () => {
  /**
   * The adjustment is a DOCUMENT now — one number, however many products — so
   * every test here drives the sheet the same way a person does: warehouse,
   * reason, products through the picker, then the quantity that is really on
   * the shelf.
   *
   * WHAT IS WORTH ASSERTING. The rules the form owns and the server cannot see:
   * the sign is derived from the subtraction and never typed, a count is never
   * below nothing, a row that changes nothing is not a row, and the payload
   * carries both halves of the arithmetic so the document can explain itself
   * later.
   */
  function mockSheet(
    products: Product[] = [product()],
    batches: ProductBatch[] = [],
  ) {
    jest
      .spyOn(warehouseService, "list")
      .mockResolvedValue(
        page([
          warehouse(WAREHOUSE, "Gudang Pusat"),
          warehouse(OTHER_WAREHOUSE, "Gudang Bazar"),
        ]) as never,
      );
    jest
      .spyOn(productService, "list")
      .mockResolvedValue(page(products) as never);
    jest
      .spyOn(productBatchService, "list")
      .mockResolvedValue(page(batches) as never);
    jest
      .spyOn(branchService, "list")
      .mockResolvedValue(page([branchFixture()]) as never);

    return jest.spyOn(stockEntryService, "createAdjustment").mockResolvedValue({
      _id: "se-1",
      entryNumber: "ADJ-2026-0007",
    } as never);
  }

  async function renderSheet() {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockAdjustmentForm />);
    await screen.findByLabelText("Gudang");
    return user;
  }

  /**
   * LOCATION FIRST, THEN THE SHELF — the order the forms now ask in, so every
   * test that needs a warehouse has to name a branch to reach one.
   */
  async function pickWarehouse(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByLabelText("Cabang"));
    await user.click(
      await screen.findByRole("option", { name: /Cabang Pusat/ }),
    );
    await user.click(screen.getByLabelText("Gudang"));
    await user.click(
      await screen.findByRole("option", { name: /Gudang Pusat/ }),
    );
  }

  /** Warehouse, reason, one product — everything but the quantity. */
  async function fillHeader(user: ReturnType<typeof userEvent.setup>) {
    await pickWarehouse(user);
    await user.type(screen.getByLabelText(/Catatan/), "Rusak kena air");
    await addProducts(user);
  }

  it("reads the system quantity from the chosen warehouse", async () => {
    mockSheet();
    const user = await renderSheet();
    await fillHeader(user);

    // The fixture holds 20 at WAREHOUSE and nothing at the other.
    expect(await screen.findByText("20")).toBeInTheDocument();
  });

  /**
   * THE SUBTRACTION OWNS THE SIGN. Nobody picks a direction: the field holds
   * what is really on the shelf, and "keluar" or "masuk" falls out of it.
   */
  it("derives the difference from the count, including its sign", async () => {
    mockSheet();
    const user = await renderSheet();
    await fillHeader(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "18");
    expect(screen.getByText("-2")).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^Stok baru/));
    await user.type(screen.getByLabelText(/^Stok baru/), "25");
    expect(screen.getByText("+5")).toBeInTheDocument();
  });

  /**
   * A count is never below nothing, and the rule is the FIELD'S SHAPE rather
   * than a message: while it held "how much to remove", entering more than the
   * shelf had was one keystroke.
   */
  it("refuses a negative count", async () => {
    const create = mockSheet();
    const user = await renderSheet();
    await fillHeader(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "-3");

    expect(
      screen.getByRole("button", { name: /Simpan penyesuaian/ }),
    ).toBeDisabled();
    expect(create).not.toHaveBeenCalled();
  });

  /** A row that changes nothing is a ledger row recording that nothing happened. */
  it("refuses a row whose count matches the system", async () => {
    const create = mockSheet();
    const user = await renderSheet();
    await fillHeader(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "20");

    // Said once, under the disabled button — the table carries no messages of
    // its own now, only the required markers in its headers.
    expect(screen.getByText(/Tidak ada selisih/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  /** The sentence an audit reads first. The server refuses without it too. */
  it("will not submit without a reason", async () => {
    const create = mockSheet();
    const user = await renderSheet();

    await pickWarehouse(user);
    await addProducts(user);
    await user.type(await screen.findByLabelText(/^Stok baru/), "18");

    expect(
      screen.getByRole("button", { name: /Simpan penyesuaian/ }),
    ).toBeDisabled();
    expect(create).not.toHaveBeenCalled();
  });

  /**
   * BOTH HALVES OF THE ARITHMETIC ARE SENT. `qty` is what the ledger moves;
   * `systemQty` is what the screen was showing when somebody decided, and it
   * cannot be recovered later because every movement since has moved it.
   */
  it("sends the derived difference and the balance it was measured against", async () => {
    const create = mockSheet();
    const user = await renderSheet();
    await fillHeader(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "18");
    await user.click(
      screen.getByRole("button", { name: /Simpan penyesuaian/ }),
    );

    await waitFor(() => expect(create).toHaveBeenCalled());
    const sent = create.mock.calls[0][0];
    expect(sent.warehouseId).toBe(WAREHOUSE);
    expect(sent.notes).toBe("Rusak kena air");
    // Both at the 4-place scale the ledger uses — `toDecimalString` produces it,
    // and the server parses the same shape from every other client.
    expect(sent.lines[0]).toMatchObject({
      productId: PRODUCT,
      qty: "-2.0000",
      systemQty: "20.0000",
    });
  });

  /** Goods leaving carry no new cost — they are drawn at the running average. */
  it("asks for a purchase price only on a row that grows", async () => {
    mockSheet();
    const user = await renderSheet();
    await fillHeader(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "18");
    expect(
      screen.queryByLabelText(/Harga beli per unit/),
    ).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^Stok baru/));
    await user.type(screen.getByLabelText(/^Stok baru/), "25");
    expect(
      await screen.findByLabelText(/Harga beli per unit/),
    ).toBeInTheDocument();
  });

  /**
   * A LOT-TRACKED PRODUCT IS ADJUSTED ONE LOT AT A TIME: it has no single
   * balance to correct, and the person counting is holding a particular box.
   */
  /**
   * THE PICKER IS A COLUMN, not a row of its own. A lot-tracked product has one
   * balance PER LOT, and the Stok sistem beside it is read from whichever lot is
   * named — putting the question on a separate row from its answer is what this
   * replaced.
   */
  it("puts the batch picker in the product's own row", async () => {
    mockSheet([product({ hasExpiry: true })], [lot()]);
    const user = await renderSheet();
    await fillHeader(user);

    const row = (await screen.findByText("Royal Canin Adult 3kg")).closest(
      "tr",
    );
    expect(within(row!).getByLabelText(/^Batch /)).toBeInTheDocument();
    expect(within(row!).getByLabelText(/^Stok baru/)).toBeInTheDocument();
  });

  /**
   * A COLUMN NOBODY ON THIS SHEET CAN FILL is a column of dashes, paid for in
   * width on every row.
   */
  it("leaves the batch column out when nothing on the sheet tracks lots", async () => {
    mockSheet();
    const user = await renderSheet();
    await fillHeader(user);

    await screen.findByLabelText(/^Stok baru/);
    expect(screen.queryByRole("columnheader", { name: "Batch" })).toBeNull();
  });

  /**
   * ONE ROW PER PRODUCT, WHOLE. Everything a line needs is a cell in its own
   * row — the picker, the new lot's two halves, the quantities, the price —
   * so a reader follows one line left to right instead of down and back.
   */
  it("keeps a new lot's fields on the product's own row", async () => {
    mockSheet([product({ hasExpiry: true })], [lot()]);
    const user = await renderSheet();
    await fillHeader(user);

    await user.click(await screen.findByLabelText(/^Batch /));
    await user.click(await screen.findByRole("option", { name: /Batch baru/ }));

    const row = (await screen.findByText("Royal Canin Adult 3kg")).closest(
      "tr",
    );
    expect(within(row!).getByLabelText(/Kode batch baru/)).toBeInTheDocument();
    expect(
      within(row!).getByLabelText(/Tanggal kedaluwarsa/),
    ).toBeInTheDocument();
    expect(within(row!).getByLabelText(/^Stok baru/)).toBeInTheDocument();
  });

  /**
   * The two columns arrive together and leave together — a lot is only a lot
   * when both halves are there — and both are absent until some line names one.
   */
  it("leaves both lot columns out until a batch is chosen", async () => {
    mockSheet([product({ hasExpiry: true })], [lot()]);
    const user = await renderSheet();
    await fillHeader(user);

    await screen.findByLabelText(/^Batch /);

    expect(
      screen.queryByRole("columnheader", { name: "Kode batch" }),
    ).toBeNull();
    expect(
      screen.queryByRole("columnheader", { name: "Kedaluwarsa" }),
    ).toBeNull();
  });

  /**
   * NAMING A LOT FILLS THE TWO COLUMNS RATHER THAN DASHING THEM.
   *
   * The picker says `WSK-A26 - sisa 8`, which identifies the lot but hides what
   * the row is about: goods are going into a batch that expires on a particular
   * day, and that day belongs on the row being read. Dashes said the opposite —
   * that this lot has no code and no date — about a lot that has both.
   *
   * Disabled, because they describe the goods. Nothing on an adjustment sheet
   * may rewrite a lot that already exists.
   */
  it("shows a named lot's code and date, read-only", async () => {
    mockSheet([product({ hasExpiry: true })], [lot()]);
    const user = await renderSheet();
    await fillHeader(user);

    await user.click(await screen.findByLabelText(/^Batch /));
    await user.click(await screen.findByRole("option", { name: /WSK-A26/ }));

    const code = await screen.findByLabelText(/^Kode batch Royal Canin/);
    expect(code).toHaveValue("WSK-A26");
    expect(code).toBeDisabled();

    const expiry = screen.getByLabelText(/^Kedaluwarsa Royal Canin/);
    expect(expiry).toHaveValue("2026-12-31");
    expect(expiry).toBeDisabled();

    // The date is not required of anybody here — there is nothing to type.
    expect(
      screen.queryByRole("columnheader", { name: /Kedaluwarsa \*/ }),
    ).toBeNull();
  });

  /** A named lot is read, a new one is typed — and only one of them is sent. */
  it("sends the named lot's id, not its code or its date", async () => {
    const create = mockSheet([product({ hasExpiry: true })], [lot()]);
    const user = await renderSheet();
    await fillHeader(user);

    await user.click(await screen.findByLabelText(/^Batch /));
    await user.click(await screen.findByRole("option", { name: /WSK-A26/ }));
    await user.type(screen.getByLabelText(/^Stok baru/), "12");
    await user.click(
      screen.getByRole("button", { name: /Simpan penyesuaian/ }),
    );

    await waitFor(() => expect(create).toHaveBeenCalled());
    const [line] = create.mock.calls[0][0].lines;
    expect(line.batchId).toBe("lot-a");
    // The keys are present but empty — the payload is assembled with a fixed
    // shape, and naming a lot and creating one are mutually exclusive.
    expect(line.batchCode).toBeUndefined();
    expect(line.expiryDate).toBeUndefined();
  });

  /**
   * REQUIRED IS SAID UP FRONT, not complained about afterwards.
   *
   * A red border and a sentence under the row told somebody they had got it
   * wrong; the asterisk tells them before they do — the same marker `TextField`
   * puts after a label, so the table and the fields above it agree — and the
   * disabled save button names what is still missing.
   *
   * ONLY THE DATE CARRIES ONE. The code is optional: left blank it is filled
   * with `sku:tanggal-expired`, and an asterisk over a field nobody has to type
   * is the marker meaning nothing the next time it appears.
   */
  it("marks the new lot's date required and its code not", async () => {
    mockSheet([product({ hasExpiry: true })], [lot()]);
    const user = await renderSheet();
    await fillHeader(user);

    await user.click(await screen.findByLabelText(/^Batch /));
    await user.click(await screen.findByRole("option", { name: /Batch baru/ }));

    expect(
      await screen.findByRole("columnheader", { name: /Kedaluwarsa \*/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Kode batch" }),
    ).toBeInTheDocument();
  });

  /**
   * THE PLACEHOLDER IS THE EXPLANATION. Somebody who leaves the code blank can
   * read what the lot will be called before they save, which is worth more than
   * a sentence under the table saying a code will be generated.
   */
  it("previews the code the lot will take when none is typed", async () => {
    const create = mockSheet([product({ hasExpiry: true })], [lot()]);
    const user = await renderSheet();
    await fillHeader(user);

    await user.click(await screen.findByLabelText(/^Batch /));
    await user.click(await screen.findByRole("option", { name: /Batch baru/ }));
    await user.type(screen.getByLabelText(/Tanggal kedaluwarsa/), "2027-03-01");
    await user.type(screen.getByLabelText(/^Stok baru/), "5");

    expect(screen.getByLabelText(/Kode batch baru/)).toHaveAttribute(
      "placeholder",
      "RC-3KG:2027-03-01",
    );

    // And it saves with the code left blank, because the server fills it too.
    await user.click(
      screen.getByRole("button", { name: /Simpan penyesuaian/ }),
    );

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0].lines[0].batchCode).toBeUndefined();
  });

  /**
   * THE REFUSAL NAMES THE ROW, not just the rule.
   *
   * "Pilih batch dulu." is unanswerable on a sheet of twenty lines: it states a
   * rule the reader already agrees with and leaves them to find which row broke
   * it. The product — variant name included, as the Produk column spells it —
   * is what turns the message into somewhere to go.
   */
  it("names the product the save is waiting on", async () => {
    mockSheet(
      [
        product({ hasExpiry: true }),
        product({
          _id: "p2",
          sku: "WSK-1KG",
          name: "Whiskas Tuna 1kg",
          hasExpiry: true,
        }),
      ],
      [lot()],
    );
    const user = await renderSheet();
    await pickWarehouse(user);
    await user.type(screen.getByLabelText(/Catatan/), "Rusak kena air");
    await addProducts(user, 2);

    // The first row is settled, so the complaint belongs to the second.
    await user.click(await screen.findByLabelText(/^Batch Royal Canin/));
    await user.click(await screen.findByRole("option", { name: /WSK-A26/ }));
    await user.type(screen.getByLabelText(/^Stok baru Royal Canin/), "12");

    expect(
      screen.getByRole("button", { name: /Simpan penyesuaian/ }),
    ).toBeDisabled();
    expect(
      await screen.findByText(/Whiskas Tuna 1kg - Pilih batch dulu/),
    ).toBeInTheDocument();
  });

  /** The refusal itself lives on the button, and it names the field. */
  it("will not save a new lot with no expiry date, and says which field", async () => {
    const create = mockSheet([product({ hasExpiry: true })], [lot()]);
    const user = await renderSheet();
    await fillHeader(user);

    await user.click(await screen.findByLabelText(/^Batch /));
    await user.click(await screen.findByRole("option", { name: /Batch baru/ }));
    await user.type(await screen.findByLabelText(/Kode batch baru/), "WSK-B26");
    await user.type(screen.getByLabelText(/^Stok baru/), "5");

    expect(
      screen.getByRole("button", { name: /Simpan penyesuaian/ }),
    ).toBeDisabled();
    expect(
      await screen.findByText(/Tanggal kedaluwarsa wajib diisi/),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  /** Nothing red inside the table: the marker carries it, not the cells. */
  it("leaves the cells unmarked while a required one is empty", async () => {
    mockSheet([product({ hasExpiry: true })], [lot()]);
    const user = await renderSheet();
    await fillHeader(user);

    await user.click(await screen.findByLabelText(/^Batch /));
    await user.click(await screen.findByRole("option", { name: /Batch baru/ }));

    const table = await screen.findByRole("table");
    expect(within(table).queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText(/Tanggal kedaluwarsa/)).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  /** Only a lot being CREATED needs the two extra columns: a code and a date. */
  it("asks for the new lot's code and date in the row, not for an existing one", async () => {
    mockSheet([product({ hasExpiry: true })], [lot()]);
    const user = await renderSheet();
    await fillHeader(user);

    await user.click(await screen.findByLabelText(/^Batch /));
    await user.click(await screen.findByRole("option", { name: /WSK-A26/ }));
    expect(screen.queryByLabelText(/Kode batch baru/)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/^Batch /));
    await user.click(await screen.findByRole("option", { name: /Batch baru/ }));
    expect(await screen.findByLabelText(/Kode batch baru/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tanggal kedaluwarsa/)).toBeInTheDocument();
  });

  it("asks a lot-tracked product which batch, and counts against that lot", async () => {
    mockSheet([product({ hasExpiry: true })], [lot()]);
    const user = await renderSheet();
    await fillHeader(user);

    const batch = await screen.findByLabelText(/^Batch /);
    expect(batch).toBeInTheDocument();

    // Nothing to count against until a lot is named.
    expect(screen.getByLabelText(/^Stok baru/)).toBeDisabled();

    await user.click(batch);
    await user.click(await screen.findByRole("option", { name: /WSK-A26/ }));

    // The lot holds 8, not the product's 20.
    expect(await screen.findByText("8")).toBeInTheDocument();
  });

  /** The server's refusal names what to fix. Shown verbatim. */
  it("shows the server's refusal as written", async () => {
    const create = mockSheet();
    create.mockRejectedValue(
      new ApiError("These products cannot hold stock: RC-3KG", 400),
    );
    const user = await renderSheet();
    await fillHeader(user);

    await user.type(await screen.findByLabelText(/^Stok baru/), "18");
    await user.click(
      screen.getByRole("button", { name: /Simpan penyesuaian/ }),
    );

    expect(
      await screen.findByText(/cannot hold stock: RC-3KG/),
    ).toBeInTheDocument();
  });

  /** Every row's system quantity belongs to the warehouse it was read from. */
  it("clears the rows when the warehouse changes", async () => {
    mockSheet();
    const user = await renderSheet();
    await fillHeader(user);
    expect(await screen.findByLabelText(/^Stok baru/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Gudang"));
    await user.click(
      await screen.findByRole("option", { name: /Gudang Bazar/ }),
    );

    expect(screen.queryByLabelText(/^Stok baru/)).not.toBeInTheDocument();
  });
});

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
    await user.type(
      screen.getByLabelText(/^Catatan Royal Canin/),
      "lot dekat ED",
    );
    await user.click(screen.getByRole("button", { name: /Simpan transfer/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: "persiapan bazar",
          items: [{ productId: PRODUCT, qty: "6", notes: "lot dekat ED" }],
        }),
      ),
    );
  });

  /**
   * GOODS THAT EXPIRE MOVE AS A NAMED LOT, never as a bare quantity.
   *
   * The cartons are already in the van, so FEFO would answer a question the
   * person filing the transfer has already answered — writing off a DIFFERENT
   * carton still on the shelf and re-creating that one's expiry at the
   * destination. The API refuses such a line, so the form asks first: the batch
   * column appears, and the save stays shut until a lot is named.
   */
  it("refuses to save a lot-tracked product until its batch is named", async () => {
    mockLookups({
      detail: product({ hasExpiry: true }),
      batches: [lot()],
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await addProducts(user);

    // Asked before it is refused — and the quantity has nothing to be checked
    // against yet, so it cannot be typed into either.
    expect(await screen.findByLabelText(/^Batch/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Jumlah/)).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Simpan transfer/ }),
    ).toBeDisabled();
  });

  /**
   * THE RULE IS ABOUT THE SHELF, NOT THE FLAG.
   *
   * `hasExpiry` can be switched on long after stock arrived, and those units
   * carry no lot — nothing retro-fits one. A form that demanded a batch there
   * would offer an empty dropdown and refuse to move goods that are physically
   * on the shelf, while a sale of the same units still goes through. With no
   * lot to name, the line moves unbatched and the payload carries no `batchId`.
   */
  it("moves a lot-tracked product with no lots on the shelf unbatched", async () => {
    const { create } = mockLookups({
      detail: product({ hasExpiry: true }),
      batches: [],
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await addProducts(user);

    const qty = await screen.findByLabelText(/^Jumlah/);
    // Open the moment the lots come back empty — not before, or a row would
    // take a number and then close again when the list arrived.
    await waitFor(() => expect(qty).not.toBeDisabled());
    expect(
      await screen.findByText(/dipindahkan tanpa batch/),
    ).toBeInTheDocument();

    await user.type(qty, "6");
    await user.click(screen.getByRole("button", { name: /Simpan transfer/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ productId: PRODUCT, qty: "6" }],
        }),
      ),
    );
  });

  /**
   * THE LOT TRAVELS IN THE PAYLOAD, as an id. Its code, expiry and cost are the
   * server's to carry across — nothing here retypes them, which is what would
   * let batch A leave the shelf and batch B arrive.
   */
  it("sends the named batch with the line", async () => {
    const { create } = mockLookups({
      detail: product({ hasExpiry: true }),
      batches: [lot()],
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await addProducts(user);
    await user.click(await screen.findByLabelText(/^Batch/));
    await user.click(await screen.findByRole("option", { name: /WSK-A26/ }));
    await user.type(screen.getByLabelText(/^Jumlah/), "6");
    await user.click(screen.getByRole("button", { name: /Simpan transfer/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ productId: PRODUCT, qty: "6", batchId: "lot-a" }],
        }),
      ),
    );
  });

  /**
   * THE CEILING IS THE LOT, not the warehouse.
   *
   * The shelf holds 20 of this product and the named carton holds 8. Checking
   * against the warehouse would wave through a transfer of 12 out of a box that
   * cannot fill it — the source lot would go negative, FEFO would keep offering
   * it, and the destination would hold units that never left anywhere.
   */
  it("checks the quantity against the named lot, not the warehouse", async () => {
    mockLookups({
      detail: product({ hasExpiry: true }),
      batches: [lot()],
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await addProducts(user);
    await user.click(await screen.findByLabelText(/^Batch/));
    await user.click(await screen.findByRole("option", { name: /WSK-A26/ }));
    await user.type(screen.getByLabelText(/^Jumlah/), "12");

    expect(await screen.findByText(/Melebihi stok/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Simpan transfer/ }),
    ).toBeDisabled();
  });

  /**
   * THE TWO ENDS COME FROM DIFFERENT LISTS.
   *
   * Access to a warehouse is permission to SPEND what is on it, so it governs
   * where goods may be taken FROM. Sending them needs no standing at the far
   * end — the central warehouse, a bazaar, a shop that ran out are exactly the
   * destinations a branch has to be able to reach — and the API agrees, so a
   * narrower destination list would forbid what the server allows.
   */
  it("offers only reachable sources, but every active destination", async () => {
    mockLookups({
      warehouses: [
        warehouse(WAREHOUSE, "Gudang Pusat"),
        // Another branch's shelf: out of this account's reach entirely.
        warehouse(OTHER_WAREHOUSE, "Gudang Bazar", true, "br9"),
      ],
    });

    const confined = {
      ...FULL_REACH_USER,
      allBranches: false,
      branchAccess: [BRANCH],
      warehouseAccess: [
        { branchId: BRANCH, allWarehouses: false, warehouseIds: [WAREHOUSE] },
      ],
    } as User;

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />, { user: confined });

    await user.click(await screen.findByLabelText("Dari gudang"));
    expect(
      screen.getByRole("option", { name: "Gudang Pusat" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Gudang Bazar" }),
    ).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByLabelText("Ke gudang"));
    expect(
      screen.getByRole("option", { name: "Gudang Bazar" }),
    ).toBeInTheDocument();
  });

  /**
   * SAID, NOT REFUSED. The transfer saves — but the stock lands where this
   * account cannot look, and the return trip is not theirs to file either, so
   * the one consequence they cannot check afterwards is said before they act.
   */
  it("warns when the destination is outside the user's access", async () => {
    mockLookups({
      warehouses: [
        warehouse(WAREHOUSE, "Gudang Pusat"),
        warehouse(OTHER_WAREHOUSE, "Gudang Bazar", true, "br9"),
      ],
    });

    const confined = {
      ...FULL_REACH_USER,
      allBranches: false,
      branchAccess: [BRANCH],
      warehouseAccess: [
        { branchId: BRANCH, allWarehouses: false, warehouseIds: [WAREHOUSE] },
      ],
    } as User;

    render(<StockTransferForm />, { user: confined });

    expect(await screen.findByText(/di luar akses Anda/)).toBeInTheDocument();
  });

  /**
   * THE PICKER OFFERS WHAT THE SOURCE SHELF ACTUALLY HOLDS.
   *
   * A transfer takes goods off ONE warehouse, so a product with nothing on it
   * can only ever produce a row ending in "Melebihi stok — tersedia 0". The
   * filter is the SERVER'S — the browser holds no balance for products it has
   * not fetched — and it travels with the source warehouse, which is what makes
   * it a different list at every location.
   */
  it("offers only products the source warehouse holds", async () => {
    mockLookups();
    const list = jest.spyOn(productService, "list");

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await user.click(
      await screen.findByRole("button", { name: /Tambah produk/ }),
    );
    await waitFor(() => jest.advanceTimersByTime(400));

    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ inStockAtWarehouse: WAREHOUSE }),
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

  /**
   * The half of "it worked" a toast cannot do — and the reason this form no
   * longer clears itself in place. A transfer mints no document number and posts
   * no journal, so a cleared form and a four-second toast used to be the entire
   * receipt.
   */
  it("goes back to the list once the transfer lands", async () => {
    mockLookups();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<StockTransferForm />);

    await addProducts(user);
    await user.type(await screen.findByLabelText(/^Jumlah/), "5");
    await user.click(screen.getByRole("button", { name: /Simpan transfer/ }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/inventory/transfers"),
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

/**
 * OPENING STOCK — the screen whose whole reason for existing is the ACCOUNT it
 * posts to. Its quantities are the same ones an adjustment would write; what
 * differs is that they land on 3101 Modal / Saldo Awal instead of on 5201
 * Kerugian Persediaan, which is the difference between a shop's day-one
 * inventory and a shop that appears to have earned a profit selling nothing.
 *
 * Everything asserted here is a rule the browser owns. The one that matters
 * most — "this product has never moved" — is the SERVER's, because the answer
 * lives in the ledger; what the form owes there is to show the refusal as
 * written, since it names the rows to remove.
 */
describe("OpeningStockForm", () => {
  /**
   * Everything the sheet loads on mount, plus the picker's candidate list.
   *
   * `productService.list` serves BOTH: the lookups hook the form mounts with,
   * and the search behind ProductMultiPicker — which is the only way products
   * reach this form.
   */
  function mockSheet(products: Product[] = [product()]) {
    jest
      .spyOn(branchService, "list")
      .mockResolvedValue(page([branchFixture()]) as never);
    jest
      .spyOn(warehouseService, "list")
      .mockResolvedValue(
        page([
          warehouse(WAREHOUSE, "Gudang Pusat"),
          warehouse(OTHER_WAREHOUSE, "Gudang Bazar"),
        ]) as never,
      );
    jest
      .spyOn(productService, "list")
      .mockResolvedValue(page(products) as never);

    return jest
      .spyOn(stockEntryService, "createOpeningStock")
      .mockResolvedValue({
        _id: "se-2",
        entryNumber: "OPB-2026-0001",
      } as never);
  }

  /** Mounts the sheet and waits for its lookups to land. */
  async function renderSheet() {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<OpeningStockForm />);
    await screen.findByLabelText("Gudang");
    return user;
  }

  /**
   * LOCATION FIRST, THEN THE SHELF — the order the forms now ask in, so every
   * test that needs a warehouse has to name a branch to reach one.
   */
  async function pickWarehouse(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByLabelText("Cabang"));
    await user.click(
      await screen.findByRole("option", { name: /Cabang Pusat/ }),
    );
    await user.click(screen.getByLabelText("Gudang"));
    await user.click(
      await screen.findByRole("option", { name: /Gudang Pusat/ }),
    );
  }

  /** Warehouse, one product through the picker, then its two required figures. */
  async function fillOneLine(user: ReturnType<typeof userEvent.setup>) {
    await pickWarehouse(user);
    await addProducts(user);
    await user.type(await screen.findByLabelText(/^Jumlah/), "24");
    await user.type(screen.getByLabelText(/Harga beli per unit/), "118500");
  }

  /**
   * THE PICKER IS THE ONLY WAY ONTO THE SHEET — the same arrangement the
   * transfer form and the opname sheet use. A per-row dropdown would have been
   * a third convention for one act, and it could only ever offer one product at
   * a time out of a list the browser had to hold in memory.
   */
  it("opens with no rows and adds them through the picker", async () => {
    mockSheet();
    const user = await renderSheet();

    expect(screen.getByText("Belum ada produk")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Jumlah/)).not.toBeInTheDocument();

    await pickWarehouse(user);
    await addProducts(user);

    expect(await screen.findByLabelText(/^Jumlah/)).toBeInTheDocument();
    expect(screen.getByText("Royal Canin Adult 3kg")).toBeInTheDocument();
  });

  /**
   * THE WAREHOUSE COMES FIRST, because the picker's list is "products that have
   * never moved HERE" — without one there is no question to ask. Stated on the
   * control rather than left to be inferred from a disabled button.
   */
  it("will not open the picker before a warehouse is named", async () => {
    mockSheet();
    await renderSheet();

    expect(
      screen.getByRole("button", { name: /Tambah produk/ }),
    ).toBeDisabled();
    expect(screen.getByText(/Pilih gudangnya dulu/)).toBeInTheDocument();
  });

  /**
   * THE ELIGIBILITY RULE REACHES THE LIST, not just the save. Asking the server
   * is the only way — "has this ever moved" lives in the ledger — and filtering
   * beats refusing: otherwise somebody types twenty rows before learning which
   * four were never allowed.
   */
  it("asks the server for products that have never moved in that warehouse", async () => {
    mockSheet();
    const list = jest.spyOn(productService, "list");
    const user = await renderSheet();

    await pickWarehouse(user);
    await user.click(screen.getByRole("button", { name: /Tambah produk/ }));
    await waitFor(() => jest.advanceTimersByTime(400));

    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ neverMovedInWarehouse: WAREHOUSE }),
      ),
    );
  });

  /**
   * The rows were chosen against the OLD warehouse's eligibility, and "never
   * moved here" is a different answer per location — keeping them would leave
   * the sheet holding products the picker would not have offered for this one.
   */
  it("clears the rows when the warehouse changes", async () => {
    mockSheet();
    const user = await renderSheet();
    await pickWarehouse(user);
    await addProducts(user);
    expect(await screen.findByLabelText(/^Jumlah/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Gudang"));
    await user.click(
      await screen.findByRole("option", { name: /Gudang Bazar/ }),
    );

    expect(screen.queryByLabelText(/^Jumlah/)).not.toBeInTheDocument();
    expect(screen.getByText("Belum ada produk")).toBeInTheDocument();
  });

  it("sends the sheet as one warehouse and a line per product", async () => {
    const post = mockSheet();
    const user = await renderSheet();
    await fillOneLine(user);

    await user.click(screen.getByRole("button", { name: /Simpan stok awal/ }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    /*
      The header came with the document: a date the stock belongs to, an optional
      note, and the branch. `notes` is undefined because none was typed, and
      `branchId` is the warehouse's own default — the form pre-fills it with
      exactly what the server would have resolved, so a tenant whose branches
      each own a warehouse sends the payload that would have been written
      without the field at all.
    */
    expect(post).toHaveBeenCalledWith({
      warehouseId: WAREHOUSE,
      branchId: BRANCH,
      entryDate: expect.any(String),
      notes: undefined,
      lines: [{ productId: PRODUCT, qty: "24", costPerUnit: "118500" }],
    });
  });

  /**
   * COST IS THE RULE THE ADJUSTMENT FORM ONLY ENFORCES IN THE BROWSER. Without
   * it the ledger values the arrival at the product's running average, which
   * for something that has never moved is zero: quantity on the shelf, nothing
   * in the asset, and every later sale of it costed at nothing.
   */
  it("will not submit a line with no purchase price", async () => {
    const post = mockSheet();
    const user = await renderSheet();

    await pickWarehouse(user);
    await addProducts(user);
    await user.type(await screen.findByLabelText(/^Jumlah/), "24");

    expect(
      screen.getByRole("button", { name: /Simpan stok awal/ }),
    ).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  /**
   * ZERO IS REFUSED HERE TOO. The opening-stock document is one of the three
   * paths that ESTABLISH a product's weighted average, and a zero taken at any
   * of them BECOMES that average — every later sale of those goods is costed at
   * nothing and reads as 100% margin.
   */
  it("will not submit a purchase price of zero", async () => {
    const post = mockSheet();
    const user = await renderSheet();

    await pickWarehouse(user);
    await addProducts(user);
    await user.type(await screen.findByLabelText(/^Jumlah/), "24");
    await user.type(screen.getByLabelText(/Harga beli per unit/), "0");

    expect(
      screen.getByRole("button", { name: /Simpan stok awal/ }),
    ).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  /** Asked while the counter is at the shelf, not surfaced as a 400 later. */
  it("asks an expiring product for its batch on the row itself", async () => {
    mockSheet([product({ hasExpiry: true })]);
    const user = await renderSheet();

    await pickWarehouse(user);
    expect(screen.queryByLabelText(/Kode batch/)).not.toBeInTheDocument();

    await addProducts(user);

    expect(await screen.findByLabelText(/Kode batch/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tanggal kedaluwarsa/)).toBeInTheDocument();
  });

  /**
   * The value of the sheet, shown before the button — it is the number somebody
   * sanity-checks, and it is both halves of the entry about to be written.
   */
  it("totals what the sheet will add to inventory and to capital", async () => {
    mockSheet();
    const user = await renderSheet();
    await fillOneLine(user);

    // 24 × 118.500 = 2.844.000
    expect(await screen.findByText(/2\.844\.000/)).toBeInTheDocument();
  });

  /**
   * THE GUARD IS THE SERVER'S — the answer lives in the ledger, not in the
   * browser — and its message names the SKUs to take off the sheet. Surfaced
   * verbatim: a paraphrase would drop exactly that.
   */
  it("shows the server's refusal as written", async () => {
    const post = mockSheet();
    post.mockRejectedValue(
      new ApiError(
        "These products already have stock movements, so their opening balance can no longer be set: RC-3KG",
        400,
      ),
    );
    const user = await renderSheet();
    await fillOneLine(user);

    await user.click(screen.getByRole("button", { name: /Simpan stok awal/ }));

    // Waited for on the DISTINCTIVE half: "RC-3KG" also names the row, so
    // matching that alone would resolve before the alert exists.
    const alert = await screen.findByText(/already have stock movements/);
    expect(alert).toHaveTextContent("RC-3KG");
  });

  /**
   * Consignment is a column on the row, not a question buried under it: whether
   * goods are the supplier's until they sell changes what the arrival means,
   * and on a sheet of sixty products it has to be answerable at a glance.
   *
   * SENT ONLY WHEN TICKED — the server defaults it, and a `false` on every line
   * would be sixty fields saying nothing. The unticked half is covered by the
   * payload test above, which matches the line object exactly and would fail on
   * a stray key.
   */
  it("sends the consignment flag for a row that carries it", async () => {
    const post = mockSheet();
    const user = await renderSheet();
    await fillOneLine(user);

    await user.click(screen.getByLabelText(/^Barang titipan/));
    await user.click(screen.getByRole("button", { name: /Simpan stok awal/ }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][0].lines[0]).toMatchObject({
      isConsignment: true,
    });
  });

  /**
   * THE ORDINARY CASE IS NOUGHT CLICKS. Every branch is auto-provisioned a
   * warehouse, so for most tenants the branch is never a choice — the field
   * fills itself from the warehouse and the payload matches what the server
   * would have resolved on its own.
   */
  it("fills the branch from the warehouse", async () => {
    mockSheet();
    const user = await renderSheet();
    await pickWarehouse(user);

    expect(screen.getByLabelText("Cabang")).toHaveTextContent("Cabang Pusat");
  });

  /** Changing the location invalidates everything scoped to it. */
  it("clears the warehouse and the rows when the branch changes", async () => {
    mockSheet();
    jest
      .spyOn(branchService, "list")
      .mockResolvedValue(
        page([
          branchFixture(),
          { _id: "br2", name: "Cabang Bazar", isActive: true },
        ]) as never,
      );

    const user = await renderSheet();
    await pickWarehouse(user);
    await addProducts(user);
    expect(await screen.findByLabelText(/^Jumlah/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Cabang"));
    await user.click(
      await screen.findByRole("option", { name: /Cabang Bazar/ }),
    );

    expect(screen.queryByLabelText(/^Jumlah/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Gudang")).toHaveTextContent("Pilih gudang");
  });

  /** One product, one row — the API refuses a sheet naming it twice. */
  it("hides a product the sheet already carries from the picker", async () => {
    mockSheet();
    const user = await renderSheet();
    await pickWarehouse(user);
    await addProducts(user);

    await user.click(screen.getByRole("button", { name: /Tambah produk/ }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => jest.advanceTimersByTime(400));

    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

/* --------------------------------------------------- naming the blocked row */

/**
 * Asserted on the function rather than through the sheet, because the case that
 * matters is unreachable from it: a header rule files under a key with no dot in
 * it, so the guard against prefixing one is invisible through the UI — every
 * input the form can produce comes out right whether the guard is there or not.
 * Given a `nameOf` that answers anything, it stops being invisible.
 */
describe("blockingReason", () => {
  const nameOf = (productId: string) =>
    ({ p1: "Royal Canin Adult 3kg" })[productId];

  it("names the row a per-line rule is about", () => {
    expect(
      blockingReason({ "line.p1.batch": "Pilih batch dulu." }, nameOf),
    ).toBe("Royal Canin Adult 3kg - Pilih batch dulu.");
  });

  /**
   * There is one Gudang on the form, so prefixing it would repeat the label the
   * reader is already looking at.
   */
  it("leaves a header rule unprefixed", () => {
    expect(
      blockingReason({ warehouseId: "Pilih gudang dulu." }, () => "APAPUN"),
    ).toBe("Pilih gudang dulu.");
  });

  /** A row whose product the sheet cannot resolve still says what is wrong. */
  it("falls back to the bare message when the product is unknown", () => {
    expect(
      blockingReason({ "line.p9.batch": "Pilih batch dulu." }, nameOf),
    ).toBe("Pilih batch dulu.");
  });

  it("has nothing to say when nothing is wrong", () => {
    expect(blockingReason({}, nameOf)).toBeNull();
  });
});
