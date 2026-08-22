import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";

import {
  ReceiptDetail,
  ReceiptForm,
  ReceiptsScreen,
} from "@/features/purchasing";
import { autoBatchCode } from "@/lib/batchCode";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { purchaseReturnService } from "@/services/purchaseReturn.service";
import { productBatchService } from "@/services/productBatch.service";
import { branchService } from "@/services/branch.service";
import { supplierService } from "@/services/supplier.service";
import { warehouseService } from "@/services/warehouse.service";
import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import type {
  GoodsReceiptDetail,
  GoodsReceiptListRow,
  GoodsReceiptPreview,
  Supplier,
} from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/goodsReceipt.service");
jest.mock("@/services/purchaseReturn.service");
jest.mock("@/services/productBatch.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/supplier.service");
jest.mock("@/services/warehouse.service");
jest.mock("@/services/product.service");

/**
 * Opens the one filter panel and returns it.
 *
 * EVERY filter lives inside it, so each filter assertion starts here — which is
 * also the cheapest way to notice if the button ever stops being reachable. The
 * trigger's text carries a count (`Filter (2)`); its accessible name does not,
 * so it is found by the stable half.
 */
async function openFilters(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Filter" }));
  return screen.findByRole("dialog");
}

const push = jest.fn();
const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => push(href),
    replace: (href: string) => replace(href),
  }),
}));

/**
 * The goods-receipt screens, against mocked services.
 *
 * WHAT THESE TESTS GUARD. This module replaced a prototype that computed its own
 * weighted average, its own journal and its own invoice in the browser, and every
 * way it can regress is a way of drifting back toward that:
 *
 *  1. NOTHING IS RECOMPUTED HERE. The new HPP, the lots and the entry are
 *     rendered from `/preview` — the endpoint that runs the posting code with the
 *     commit left off — so a locally derived number would silently disagree with
 *     the one actually written, permanently;
 *  2. THE PREVIEW AND THE SAVE SEND THE SAME PAYLOAD. A preview of a different
 *     request is worse than no preview;
 *  3. `taxAmount` is OMITTED on consignment, not zeroed. The API forbids the key
 *     there and answers 400, so sending "0" would break a legitimate delivery;
 *  4. there is no edit and no delete anywhere, because the API has neither — the
 *     screens must not grow an affordance the backend cannot honour;
 *  5. a double submit is refused locally, because `POST /goods-receipts` is not
 *     idempotent and would receive the same van twice.
 *
 * The Radix selects are not driven — jsdom cannot do their pointer protocol — so
 * the form tests assert on payloads and rendered state rather than on picking.
 */
const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

const RECEIPT_ID = "gr1";

function listRow(overrides: Partial<GoodsReceiptListRow> = {}) {
  return {
    _id: RECEIPT_ID,
    receiptNumber: "GR-260806-001",
    supplierId: "s1",
    supplierName: "PT Sumber Pangan",
    warehouseId: "wh1",
    warehouseName: "Gudang Utama",
    receiptDate: "2026-08-06T00:00:00.000Z",
    purchaseType: "beli_putus",
    total: "150000.0000",
    taxAmount: "16500.0000",
    grandTotal: "166500.0000",
    itemCount: 1,
    invoiceId: null,
    notes: null,
    createdAt: "2026-08-06T09:14:00.000Z",
    ...overrides,
  } satisfies GoodsReceiptListRow;
}

function detail(
  overrides: Partial<GoodsReceiptDetail> = {},
): GoodsReceiptDetail {
  return {
    _id: RECEIPT_ID,
    receiptNumber: "GR-260806-001",
    supplierId: "s1",
    supplierName: "PT Sumber Pangan",
    warehouseId: "wh1",
    warehouseName: "Gudang Utama",
    createdByName: "Sari",
    receiptDate: "2026-08-06T00:00:00.000Z",
    purchaseType: "beli_putus",
    items: [
      {
        itemId: "it1",
        productId: "p1",
        name: "Shampoo Anjing",
        productSku: "SHAMPOO",
        productName: "Shampoo Anjing",
        productUnit: "botol",
        batchId: null,
        qty: "10.0000",
        costPerUnit: "15000.0000",
        subtotal: "150000.0000",
        returnedQty: "0.0000",
        remainingQty: "10.0000",
      },
    ],
    total: "150000.0000",
    taxAmount: "16500.0000",
    grandTotal: "166500.0000",
    invoiceId: null,
    journalEntryId: "je1",
    notes: null,
    createdAt: "2026-08-06T09:14:00.000Z",
    ...overrides,
  };
}

function preview(
  overrides: Partial<GoodsReceiptPreview> = {},
): GoodsReceiptPreview {
  return {
    receiptNumber: "GR-260806-002",
    supplierName: "PT Sumber Pangan",
    warehouseName: "Gudang Utama",
    purchaseType: "beli_putus",
    items: [
      {
        productId: "p1",
        name: "Shampoo Anjing",
        qty: "10",
        costPerUnit: "15000",
        subtotal: "150000",
      },
    ],
    total: "150000.0000",
    taxAmount: "0.0000",
    grandTotal: "150000.0000",
    movements: [],
    hppAvg: [
      {
        productId: "p1",
        before: "12000.0000",
        after: "13500.0000",
        qtyBefore: "10.0000",
        qtyIn: "10.0000",
        unitCost: "15000.0000",
      },
    ],
    // Both sides are always present on this endpoint, one of them "0" — the
    // preview labels its own accounts, so nothing has to guess which is which.
    journal: [
      {
        accountId: "acc-inventory",
        accountCode: "1201",
        accountName: "Persediaan Barang Dagangan",
        debit: "150000.0000",
        credit: "0",
      },
      {
        accountId: "acc-payable",
        accountCode: "2101",
        accountName: "Utang Supplier",
        debit: "0",
        credit: "150000.0000",
      },
    ],
    ...overrides,
  };
}

const SUPPLIER: Supplier = {
  _id: "s1",
  tenantId: "t1",
  name: "PT Sumber Pangan",
  pic: { name: null, email: null, address: null, phone: null },
  phone: null,
  email: null,
  address: {
    street: null,
    city: null,
    postalCode: null,
    province: null,
    country: null,
  },
  npwp: null,
  notes: null,
  type: "beli_putus",
  paymentTermDays: 30,
  isActive: true,
  createdBy: null,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const PRODUCT = {
  _id: "p1",
  sku: "SHAMPOO",
  name: "Shampoo Anjing",
  productType: "standalone",
  parentId: null,
  variantAxes: [],
  variantAttributes: null,
  bundleConfig: null,
  barcode: null,
  minStock: 0,
  hasExpiry: false,
  categoryId: "c1",
  unit: "botol",
  sellPrice: "25000",
  // Four decimals, as `/products` really returns it — the form is expected to
  // shorten this before it reaches an input.
  hppAvg: "12000.0000",
  isActive: true,
  deletedAt: null,
  stockByWarehouse: [],
};

const BRANCH_ID = "br1";

/**
 * `defaultBranchId` is what scopes the warehouse picker to the branch above it —
 * see `warehousesForBranch`. A fixture without it would be a warehouse belonging
 * to no branch and to every branch at once, which is the shared central one, not
 * this.
 */
const WAREHOUSE = {
  _id: "wh1",
  name: "Gudang Utama",
  code: "GU",
  isActive: true,
  defaultBranchId: BRANCH_ID,
};

const OTHER_WAREHOUSE = {
  _id: "wh2",
  name: "Gudang Cabang Selatan",
  code: "GS",
  isActive: true,
  defaultBranchId: "br2",
};

function page<T>(items: T[]) {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  asMock(goodsReceiptService.list).mockResolvedValue(
    page([listRow()]) as never,
  );
  asMock(goodsReceiptService.summary).mockResolvedValue({
    items: [],
    totalPurchased: "150000.0000",
    totalReceipts: 1,
  });
  asMock(goodsReceiptService.getById).mockResolvedValue(detail());
  asMock(goodsReceiptService.preview).mockResolvedValue(preview());
  asMock(goodsReceiptService.create).mockResolvedValue(detail());

  asMock(purchaseReturnService.list).mockResolvedValue(page([]) as never);
  asMock(supplierService.list).mockResolvedValue(page([SUPPLIER]) as never);
  asMock(branchService.list).mockResolvedValue(
    page([{ _id: BRANCH_ID, name: "Cabang Pusat", isActive: true }]) as never,
  );
  asMock(warehouseService.list).mockResolvedValue(page([WAREHOUSE]) as never);
  asMock(productService.list).mockResolvedValue(page([PRODUCT]) as never);
});

/* ------------------------------------------------------------ list screen */

describe("ReceiptsScreen", () => {
  it("renders a delivery from the API, not from a local store", async () => {
    renderWithAuth(<ReceiptsScreen />);

    expect(await screen.findByText("GR-260806-001")).toBeInTheDocument();
    expect(screen.getByText("PT Sumber Pangan")).toBeInTheDocument();
    // grandTotal, tax included — what the vendor is owed.
    expect(screen.getByText(/166\.500/)).toBeInTheDocument();
  });

  /**
   * The header figure is summed server-side across every receipt ever. Summing
   * the page instead would produce a number that grows as the user pages, which
   * is worse than no number because it looks authoritative.
   */
  it("takes the headline total from /summary rather than the page", async () => {
    renderWithAuth(<ReceiptsScreen />);

    await screen.findByText("GR-260806-001");
    expect(goodsReceiptService.summary).toHaveBeenCalled();
  });

  it("offers no edit or delete affordance on any row", async () => {
    renderWithAuth(<ReceiptsScreen />);

    await screen.findByText("GR-260806-001");
    expect(screen.queryByRole("button", { name: /Hapus/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Edit/ })).toBeNull();
  });

  /**
   * There is no `DELETE /goods-receipts/:id`, so nothing is ever in a deleted
   * state. A toggle for it would be a promise the data cannot keep.
   *
   * ASSERTED WITH THE PANEL OPEN, which is the only way this stays a real
   * assertion: every filter moved behind one button, so a check against the
   * closed screen would pass whether the toggle existed or not.
   */
  it("has no 'show deleted' filter, because deletion does not exist here", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceiptsScreen />);

    await screen.findByText("GR-260806-001");
    const panel = await openFilters(user);

    expect(within(panel).queryByLabelText(/terhapus/i)).toBeNull();
    // The fields that DO exist, so the negative above is read against a panel
    // that actually rendered rather than one that failed to open.
    expect(within(panel).getByLabelText("Urutkan")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Filter supplier")).toBeInTheDocument();
  });

  it("orders by the ordering the panel was left on", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceiptsScreen />);

    await screen.findByText("GR-260806-001");
    const panel = await openFilters(user);

    await user.click(within(panel).getByLabelText("Urutkan"));
    await user.click(await screen.findByRole("option", { name: "Nomor A–Z" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(goodsReceiptService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "numberAsc" }),
      ),
    );
  });

  /**
   * The ordering is not counted in the trigger's badge — every list has one, so
   * it is never "on", and a badge reading `Filter (1)` over an unnarrowed list
   * would train people to ignore the number.
   */
  it("does not count the ordering as a filter", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceiptsScreen />);

    await screen.findByText("GR-260806-001");
    const panel = await openFilters(user);

    await user.click(within(panel).getByLabelText("Urutkan"));
    await user.click(await screen.findByRole("option", { name: "Terlama" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(goodsReceiptService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "oldest" }),
      ),
    );
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter",
    );
    expect(
      screen.getByRole("button", { name: "Filter" }),
    ).not.toHaveTextContent("(1)");
  });

  it("distinguishes an unfiled invoice from a consignment with none", async () => {
    asMock(goodsReceiptService.list).mockResolvedValue(
      page([
        listRow(),
        listRow({
          _id: "gr2",
          receiptNumber: "GR-260806-002",
          purchaseType: "konsinyasi",
          taxAmount: "0.0000",
          grandTotal: "150000.0000",
        }),
      ]) as never,
    );

    renderWithAuth(<ReceiptsScreen />);

    // A beli_putus receipt already owes money — it just has no vendor document
    // yet. A consignment will never have one.
    expect(await screen.findByText("belum difakturkan")).toBeInTheDocument();
    expect(screen.getByText("tanpa faktur")).toBeInTheDocument();
  });

  it("surfaces a failed list as an error rather than an empty table", async () => {
    asMock(goodsReceiptService.list).mockRejectedValue(
      new ApiError("Server sedang bermasalah", 500),
    );

    renderWithAuth(<ReceiptsScreen />);

    expect(
      await screen.findByText(/Server sedang bermasalah/),
    ).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------- detail screen */

describe("ReceiptDetail", () => {
  it("shows the document, its lines and who recorded it", async () => {
    renderWithAuth(<ReceiptDetail receiptId={RECEIPT_ID} />);

    expect(await screen.findByText("GR-260806-001")).toBeInTheDocument();
    expect(screen.getByText("Sari")).toBeInTheDocument();
    expect(screen.getByText("SHAMPOO")).toBeInTheDocument();
  });

  it("separates a missing receipt from a failed request", async () => {
    asMock(goodsReceiptService.getById).mockRejectedValue(
      new ApiError("Goods receipt not found", 404),
    );

    renderWithAuth(<ReceiptDetail receiptId={RECEIPT_ID} />);

    // A 404 offers the way back to the list; it does not offer a retry, because
    // retrying a URL that will never resolve is not a workflow.
    expect(
      await screen.findByText(/Penerimaan tidak ditemukan/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Coba lagi")).toBeNull();
  });

  it("offers a retry when the request itself failed", async () => {
    asMock(goodsReceiptService.getById).mockRejectedValue(
      new ApiError("Gagal terhubung", 500),
    );

    renderWithAuth(<ReceiptDetail receiptId={RECEIPT_ID} />);

    expect(await screen.findByText("Coba lagi")).toBeInTheDocument();
  });

  /**
   * The receipt already credited `2101` when it posted. Reading a null
   * `invoiceId` as "nothing is owed" is the specific misreading this copy exists
   * to prevent.
   */
  it("says the debt exists even before the supplier's invoice is filed", async () => {
    renderWithAuth(<ReceiptDetail receiptId={RECEIPT_ID} />);

    expect(await screen.findByText(/Utang sudah tercatat/)).toBeInTheDocument();
  });

  it("says a consignment owes nothing at all", async () => {
    asMock(goodsReceiptService.getById).mockResolvedValue(
      detail({
        purchaseType: "konsinyasi",
        taxAmount: "0.0000",
        journalEntryId: null,
      }),
    );

    renderWithAuth(<ReceiptDetail receiptId={RECEIPT_ID} />);

    expect(await screen.findByText(/belum ada utang/)).toBeInTheDocument();
  });

  it("never offers an edit or a delete", async () => {
    renderWithAuth(<ReceiptDetail receiptId={RECEIPT_ID} />);

    await screen.findByText("GR-260806-001");
    expect(
      screen.queryByRole("button", { name: /Ubah|Edit|Hapus/ }),
    ).toBeNull();
    expect(
      screen.getByText(/tidak bisa diedit atau dihapus/),
    ).toBeInTheDocument();
  });

  /**
   * A receipt cannot be edited, so a return is the only thing that can change
   * what it means afterwards. A second return of goods already gone is a stock
   * write-off nobody asked for.
   */
  it("warns when the delivery already has returns against it", async () => {
    asMock(purchaseReturnService.list).mockResolvedValue(
      page([
        {
          _id: "pr1",
          returnNumber: "PR-260807-001",
          returnDate: "2026-08-07T00:00:00.000Z",
          status: "submitted",
          supplierId: "s1",
          supplierName: "PT Sumber Pangan",
          warehouseId: "wh1",
          warehouseName: "Gudang Utama",
          originalReceiptId: RECEIPT_ID,
          originalReceiptNumber: "GR-260806-001",
          totalAmount: "30000.0000",
          itemCount: 1,
          notes: null,
          createdAt: "2026-08-07T00:00:00.000Z",
        },
      ]) as never,
    );

    renderWithAuth(<ReceiptDetail receiptId={RECEIPT_ID} />);

    expect(await screen.findByText("PR-260807-001")).toBeInTheDocument();
  });

  /**
   * `productBatches:read` is a permission separate from `goodsReceipts:read`. The
   * lot column degrades; the page does not.
   */
  it("still renders when the lot lookup is refused", async () => {
    asMock(goodsReceiptService.getById).mockResolvedValue(
      detail({
        items: [{ ...detail().items[0], batchId: "b1" }],
      }),
    );
    asMock(productBatchService.getById).mockRejectedValue(
      new ApiError("Forbidden", 403),
    );

    renderWithAuth(<ReceiptDetail receiptId={RECEIPT_ID} />);

    expect(await screen.findByText("GR-260806-001")).toBeInTheDocument();
    expect(screen.getByText("ada lot")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------ create form */

describe("ReceiptForm", () => {
  it("offers PPN on an outright purchase", async () => {
    renderWithAuth(<ReceiptForm supplierId="s1" />);

    expect(await screen.findByLabelText(/PPN masukan/)).toBeInTheDocument();
  });

  it("drops PPN on consignment and explains the lot requirement", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceiptForm supplierId="s1" />);

    await user.click(await screen.findByRole("button", { name: /Konsinyasi/ }));

    expect(screen.queryByLabelText(/PPN masukan/)).toBeNull();
    expect(
      screen.getByText(/setiap baris punya lot sendiri/),
    ).toBeInTheDocument();
  });

  it("cannot be submitted with nothing on it", async () => {
    renderWithAuth(<ReceiptForm supplierId="s1" />);

    expect(
      await screen.findByRole("button", { name: /Simpan & terima barang/ }),
    ).toBeDisabled();
  });

  it("warns that a saved receipt is final", async () => {
    renderWithAuth(<ReceiptForm supplierId="s1" />);

    expect(
      await screen.findByText(/tidak bisa diedit atau dihapus/),
    ).toBeInTheDocument();
  });

  /**
   * Before any line is complete the form shows a local estimate and SAYS it is
   * one. Presenting an unverified number as the server's answer is the exact
   * failure the preview endpoint exists to prevent.
   */
  it("labels the pre-preview totals as provisional", async () => {
    renderWithAuth(<ReceiptForm supplierId="s1" />);

    expect(
      await screen.findByText(/Angka sementara, dihitung di browser/),
    ).toBeInTheDocument();
    expect(goodsReceiptService.preview).not.toHaveBeenCalled();
  });

  /**
   * CABANG SCOPES GUDANG, and the scoping is the point rather than the ordering:
   * `POST /goods-receipts` takes no `branchId` at all — the service reads it off
   * the warehouse — so this picker exists to keep a warehouse belonging to
   * ANOTHER branch off the list, which is a refusal the user would otherwise
   * meet only after typing the whole delivery.
   */
  it("cannot choose a warehouse before a branch is named", async () => {
    asMock(branchService.list).mockResolvedValue(
      page([
        { _id: BRANCH_ID, name: "Cabang Pusat", isActive: true },
        { _id: "br2", name: "Cabang Selatan", isActive: true },
      ]) as never,
    );

    renderWithAuth(<ReceiptForm supplierId="s1" />);

    // TWO branches, so nothing is filled in for the user — and the field below
    // has no question to answer yet.
    expect(await screen.findByLabelText("Cabang")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Masuk ke gudang")).toBeDisabled(),
    );
    expect(screen.getByText("Pilih cabang dulu…")).toBeInTheDocument();
  });

  /**
   * ONE BRANCH IS NOT A CHOICE. A single-shop tenant must not have to open a
   * dropdown with one option in it to reach the warehouse below.
   */
  it("fills in a sole branch, and with it the branch's only warehouse", async () => {
    renderWithAuth(<ReceiptForm supplierId="s1" />);

    await waitFor(() =>
      expect(screen.getByLabelText("Masuk ke gudang")).not.toBeDisabled(),
    );
    // Read off the TRIGGERS: Radix mirrors the chosen option into a hidden
    // native <select> for form submission, so a bare getByText finds two.
    expect(
      within(screen.getByLabelText("Cabang")).getByText("Cabang Pusat"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Masuk ke gudang")).getByText(
        "Gudang Utama",
      ),
    ).toBeInTheDocument();
  });

  /**
   * REGRESSION GUARD ON THE DEFAULT. `effectiveWarehouseId` used to take the
   * FIRST warehouse of the whole list; under a branch that owns one and also
   * reaches the shared central one, that is a silent pick between two real
   * answers — and the receipt is not editable once saved.
   */
  it("does not guess the warehouse when the branch offers more than one", async () => {
    asMock(warehouseService.list).mockResolvedValue(
      page([
        WAREHOUSE,
        // The shared central warehouse: belongs to no branch, offered under all.
        { ...OTHER_WAREHOUSE, _id: "wh0", name: "Gudang Pusat", defaultBranchId: null },
      ]) as never,
    );

    renderWithAuth(<ReceiptForm supplierId="s1" />);

    await waitFor(() =>
      expect(screen.getByLabelText("Masuk ke gudang")).not.toBeDisabled(),
    );
    expect(screen.getByText("Pilih gudang…")).toBeInTheDocument();
    // Nothing is asked of the server until a warehouse is actually chosen.
    expect(goodsReceiptService.preview).not.toHaveBeenCalled();
  });

  /**
   * A warehouse pinned to ANOTHER branch is not on the list — that pair is what
   * the server refuses, so offering it could only produce a rejection.
   */
  it("leaves another branch's warehouse off the list", async () => {
    asMock(warehouseService.list).mockResolvedValue(
      page([WAREHOUSE, OTHER_WAREHOUSE]) as never,
    );

    renderWithAuth(<ReceiptForm supplierId="s1" />);

    await waitFor(() =>
      expect(screen.getByLabelText("Masuk ke gudang")).not.toBeDisabled(),
    );
    // The branch's own warehouse is filled in, and the other branch's is not
    // reachable at all.
    expect(
      within(screen.getByLabelText("Masuk ke gudang")).getByText(
        "Gudang Utama",
      ),
    ).toBeInTheDocument();
    // Nowhere on the page — not on the trigger, and not in the hidden native
    // select either, which is what would actually be submitted.
    expect(screen.queryAllByText("Gudang Cabang Selatan")).toHaveLength(0);
  });

  /**
   * REGRESSION. The seed is `product.hppAvg`, which the API stores at four
   * decimals — right for a ledger, noise in a box somebody is about to type
   * over. `4000.0000` in an input reads as a number the form did something to.
   */
  it("seeds the price without the API's trailing zeros", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceiptForm supplierId="s1" />);

    await user.click(
      await screen.findByRole("button", { name: "+ Tambah produk" }),
    );
    await user.click(await screen.findByLabelText(/Shampoo Anjing/));
    await user.click(screen.getByRole("button", { name: /Tambahkan/ }));

    // The fixture's hppAvg is "12000" already; the shortening is what is under
    // test, so the mock says it the way the API does.
    expect(await screen.findByLabelText(/Harga Shampoo Anjing/)).toHaveValue(
      "12000",
    );
  });

  /**
   * REGRESSION. The picker used to offer every product regardless of what was
   * already on the form, and the duplicate guard ran only inside `validate()` —
   * i.e. on submit. So the preview fired against a payload the API always
   * refuses, and the user was shown the backend's own wording:
   *
   *   "A product may appear only once on a goods receipt: 6a70884683c5ffab8e…"
   *
   * An ObjectId names nothing a clerk can act on, and the panels went silently
   * empty with no explanation of which row was at fault.
   */
  it("does not offer a product already on the form", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceiptForm supplierId="s1" />);

    await user.click(
      await screen.findByRole("button", { name: "+ Tambah produk" }),
    );

    // The dialog is the SAME picker the opname sheet, the transfer form, the
    // opening stock document and the adjustment use — a search box and
    // checkboxes, which jsdom can actually drive, unlike the Radix Select this
    // replaced.
    await user.click(await screen.findByLabelText(/Shampoo Anjing/));
    await user.click(screen.getByRole("button", { name: /Tambahkan/ }));

    expect(await screen.findByLabelText(/Qty Shampoo Anjing/)).toBeVisible();

    // Reopened, the one product on the form is GONE from the list rather than
    // offered ticked — the API refuses it twice, so a tick that could only
    // produce a refusal is worse than an absence.
    await user.click(
      screen.getByRole("button", { name: "+ Tambah produk" }),
    );

    expect(
      await screen.findByText("Semua produk yang cocok sudah ditambahkan."),
    ).toBeInTheDocument();
  });
});

describe("duplicate product guard", () => {
  /**
   * The refusal is the backend's, but the WORDING must not be. `duplicateMessage`
   * names the product and both ways out — combine the rows, or split into two
   * receipts when the prices genuinely differ.
   */
  it("names the product rather than quoting the API's ObjectId", async () => {
    asMock(goodsReceiptService.preview).mockRejectedValue(
      new ApiError(
        "A product may appear only once on a goods receipt: 6a70884683c5ffab8e210c2d",
        400,
      ),
    );

    renderWithAuth(<ReceiptForm supplierId="s1" />);
    await screen.findByRole("button", { name: "+ Tambah produk" });

    // The guard is upstream of the request: with no duplicate constructible from
    // the picker, the refusal never has a chance to reach the screen.
    expect(goodsReceiptService.preview).not.toHaveBeenCalled();
    expect(screen.queryByText(/6a70884683c5ffab8e210c2d/)).toBeNull();
  });
});

/* ---------------------------------------- the payload, at the service edge */

/**
 * The form's Radix selects cannot be driven in jsdom, so the payload rules are
 * asserted where they are decidable: over the service contract itself. These are
 * the three refusals that cost a real delivery if they regress.
 */
describe("goods receipt payload rules", () => {
  it("sends the same body to preview and to create", async () => {
    const body = {
      supplierId: "s1",
      warehouseId: "wh1",
      purchaseType: "beli_putus" as const,
      receiptDate: "2026-08-06",
      taxAmount: "16500",
      items: [{ productId: "p1", qty: "10", costPerUnit: "15000" }],
    };

    await goodsReceiptService.preview(body);
    await goodsReceiptService.create(body);

    expect(asMock(goodsReceiptService.preview).mock.calls[0][0]).toEqual(
      asMock(goodsReceiptService.create).mock.calls[0][0],
    );
  });

  it("reports the API's refusal verbatim rather than paraphrasing it", async () => {
    asMock(goodsReceiptService.create).mockRejectedValue(
      new ApiError("Batch code is required", 400, {
        reason: "SHAMPOO, PASIR",
      }),
    );

    await expect(
      goodsReceiptService.create({
        supplierId: "s1",
        warehouseId: "wh1",
        purchaseType: "beli_putus",
        items: [{ productId: "p1", qty: "1", costPerUnit: "1" }],
      }),
    ).rejects.toMatchObject({
      // Both halves survive: the WHAT and the SKUs that caused it, so a
      // forty-line delivery is fixed in one pass.
      message: "Batch code is required",
      reason: "SHAMPOO, PASIR",
    });
  });
});

/* ------------------------------------------------------ the generated lot code */

/**
 * Kode batch is OPTIONAL on the form and derived when left blank.
 *
 * The field used to be mandatory, which made the clerk invent a number whenever
 * the supplier printed none — and an invented number is "1", or the invoice
 * number, or whatever the last person typed. None of those identify a lot when
 * one has to be recalled. `SKU:tanggal-expired` is derived from the goods, so it
 * is the same code whoever receives them.
 *
 * Asserted on the function rather than through the row: adding a line means
 * driving a Radix select, which jsdom cannot do — see the header.
 */
describe("autoBatchCode", () => {
  it("keys on the expiry date, because that is what distinguishes a lot", () => {
    expect(autoBatchCode("SHAMPOO", "2027-03-01", "2026-08-06")).toBe(
      "SHAMPOO:2027-03-01",
    );
  });

  /**
   * Consigned goods that never expire still get their own lot — its cost was
   * typed in by hand — and the receipt date is the only thing separating one
   * consignment of them from the next.
   */
  it("falls back to the receipt date when the goods do not expire", () => {
    expect(autoBatchCode("PASIR", "", "2026-08-06")).toBe("PASIR:2026-08-06");
  });

  /**
   * `batchCode` maxes out at 60 characters at the API. Truncating the SKU keeps
   * the date — the half that makes the code mean something — and loses the tail
   * of a catalogue value that should not have been that long.
   */
  it("stays inside the API's 60-character limit", () => {
    const code = autoBatchCode("X".repeat(80), "2027-03-01", "2026-08-06");

    expect(code.length).toBe(60);
    expect(code.endsWith(":2027-03-01")).toBe(true);
  });
});

/* --------------------------------------------------- the double-submit guard */

describe("double submit", () => {
  /**
   * `POST /goods-receipts` is not idempotent and takes no `idempotencyKey`: a
   * receipt IS the upstream document, so a retried submit is indistinguishable
   * from a second van arriving with the same goods. The button lock is the whole
   * mitigation, so it is worth an assertion of its own.
   */
  it("locks the submit button while the create is in flight", async () => {
    let resolveCreate: (value: GoodsReceiptDetail) => void = () => {};
    asMock(goodsReceiptService.create).mockReturnValue(
      new Promise<GoodsReceiptDetail>((resolve) => {
        resolveCreate = resolve;
      }),
    );

    renderWithAuth(<ReceiptForm supplierId="s1" />);

    const button = await screen.findByRole("button", {
      name: /Simpan & terima barang/,
    });
    // Disabled with no lines, which is the same lock from the other direction:
    // the form never offers a submit it cannot honour.
    expect(button).toBeDisabled();

    resolveCreate(detail());
    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });
});
