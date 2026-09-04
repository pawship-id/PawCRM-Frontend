import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";

import {
  ReceiptDetail,
  ReceiptForm,
  ReceiptsScreen,
} from "@/features/purchasing";
import { batchCodeHint } from "@/lib/batchCode";
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
    branchId: "br1",
    branchName: "Cabang Pusat",
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
    branchId: "br1",
    branchName: "Cabang Pusat",
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
  isConsignment: false,
  deletedAt: null,
  stockByWarehouse: [],
};

/** The shop does not own this one — it only appears on the Konsinyasi tab. */
const CONSIGNED_PRODUCT = {
  ...PRODUCT,
  _id: "p2",
  sku: "TITIP-1",
  name: "Pakan Titipan",
  isConsignment: true,
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
  // The lots already on the shelf at the destination warehouse — read by the
  // form so a delivery of goods that expire can JOIN a batch that is there
  // rather than mint a duplicate. Empty is the neutral answer; the cases about
  // the picker override it.
  asMock(productBatchService.list).mockResolvedValue(page([]) as never);
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
   * WHERE THE GOODS LANDED AND WHOSE BOOKS THEY LANDED IN are two columns, and
   * the table used to carry only the first. A branch may receive at its own
   * warehouse AND at the shared central one, so a column of warehouses cannot be
   * read as a column of branches.
   */
  it("carries a branch column, before the warehouse", async () => {
    renderWithAuth(<ReceiptsScreen />);

    await screen.findByText("GR-260806-001");

    const table = screen.getByRole("table");
    expect(within(table).getByText("Cabang Pusat")).toBeInTheDocument();
    expect(within(table).getByText("Gudang Utama")).toBeInTheDocument();

    // THE ORDER IS ASSERTED, not just the presence: widest scope first, and a
    // test that only checked both were somewhere would not notice the day they
    // swapped back.
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);

    expect(headers.indexOf("Cabang")).toBeGreaterThan(-1);
    expect(headers.indexOf("Cabang")).toBeLessThan(headers.indexOf("Gudang"));
  });

  /**
   * A LABEL MAY BE NULL. Deliveries written before `branchId` existed carry no
   * branch until the backfill has run, and the row must render rather than break.
   */
  it("renders a row that predates the branch field", async () => {
    asMock(goodsReceiptService.list).mockResolvedValue(
      page([listRow({ branchName: null })]) as never,
    );

    renderWithAuth(<ReceiptsScreen />);

    await screen.findByText("GR-260806-001");
    expect(screen.queryByText("Cabang Pusat")).toBeNull();
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
   * CABANG AND GUDANG ARE A PAIR, and they behave here exactly as they do on the
   * stock-entries filter — same helpers, same two rules. Two screens that scope
   * by the same two fields in two different ways is a thing users relearn.
   */
  describe("the branch filter", () => {
    it("sends the branch it was left on", async () => {
      const user = userEvent.setup();
      renderWithAuth(<ReceiptsScreen />);

      await screen.findByText("GR-260806-001");
      const panel = await openFilters(user);

      await user.click(within(panel).getByLabelText("Filter cabang"));
      await user.click(
        await screen.findByRole("option", { name: "Cabang Pusat" }),
      );
      await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

      await waitFor(() =>
        expect(goodsReceiptService.list).toHaveBeenLastCalledWith(
          expect.objectContaining({ branchId: BRANCH_ID }),
        ),
      );
    });

    /**
     * A warehouse pinned to one branch ANSWERS the branch question, so the field
     * above fills itself in — "deliveries at Gudang Utama" and "deliveries at
     * Gudang Utama under any branch" are the same set, and leaving Cabang on
     * "Semua cabang" would leave a reader wondering whether it was still open.
     */
    it("fills in the branch when a warehouse that names one is chosen", async () => {
      const user = userEvent.setup();
      renderWithAuth(<ReceiptsScreen />);

      await screen.findByText("GR-260806-001");
      const panel = await openFilters(user);

      await user.click(within(panel).getByLabelText("Filter gudang"));
      await user.click(
        await screen.findByRole("option", { name: "Gudang Utama" }),
      );
      await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

      await waitFor(() =>
        expect(goodsReceiptService.list).toHaveBeenLastCalledWith(
          expect.objectContaining({
            warehouseId: WAREHOUSE._id,
            branchId: BRANCH_ID,
          }),
        ),
      );
    });

    /**
     * A warehouse pinned to ANOTHER branch is not offered: that pair matches no
     * delivery, so offering it could only produce an empty list nobody could
     * explain. The shared central warehouse stays — it serves every branch.
     */
    it("offers only the warehouses the chosen branch may have received at", async () => {
      asMock(warehouseService.list).mockResolvedValue(
        page([
          WAREHOUSE,
          OTHER_WAREHOUSE,
          {
            ...OTHER_WAREHOUSE,
            _id: "wh0",
            name: "Gudang Pusat",
            defaultBranchId: null,
          },
        ]) as never,
      );

      const user = userEvent.setup();
      renderWithAuth(<ReceiptsScreen />);

      await screen.findByText("GR-260806-001");
      const panel = await openFilters(user);

      await user.click(within(panel).getByLabelText("Filter cabang"));
      await user.click(
        await screen.findByRole("option", { name: "Cabang Pusat" }),
      );

      await user.click(within(panel).getByLabelText("Filter gudang"));

      expect(
        await screen.findByRole("option", { name: "Gudang Utama" }),
      ).toBeInTheDocument();
      // The shared one belongs to no branch and serves all of them.
      expect(
        screen.getByRole("option", { name: "Gudang Pusat" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Gudang Cabang Selatan" }),
      ).toBeNull();
    });

    /** Two questions, two counts — not one range with two ends. */
    it("counts the branch and the warehouse separately", async () => {
      const user = userEvent.setup();
      renderWithAuth(<ReceiptsScreen />);

      await screen.findByText("GR-260806-001");
      const panel = await openFilters(user);

      await user.click(within(panel).getByLabelText("Filter gudang"));
      await user.click(
        await screen.findByRole("option", { name: "Gudang Utama" }),
      );
      await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

      // The warehouse names its branch, so ONE click sets both — and the badge
      // says two, because two filters are narrowing the list.
      expect(
        await screen.findByRole("button", { name: "Filter" }),
      ).toHaveTextContent("Filter (2)");
    });
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

  /**
   * WHERE THE GOODS LANDED AND WHOSE BOOKS THEY LANDED IN are two questions, and
   * the screen used to answer only the first: a branch may receive at its own
   * warehouse AND at the shared central one, so the warehouse does not imply the
   * branch. The pair sits side by side because it reads as one thought.
   */
  it("names the branch, before the warehouse", async () => {
    renderWithAuth(<ReceiptDetail receiptId={RECEIPT_ID} />);

    expect(await screen.findByText("Cabang")).toBeInTheDocument();
    expect(screen.getByText("Cabang Pusat")).toBeInTheDocument();
    expect(screen.getByText("Gudang Utama")).toBeInTheDocument();

    // Widest scope first, the same order the list table reads in — asserted by
    // document position, since both labels are plain text in one strip.
    expect(
      screen
        .getByText("Cabang")
        .compareDocumentPosition(screen.getByText("Gudang")),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  /**
   * A LABEL MAY BE NULL. Deliveries written before `branchId` existed carry no
   * branch until the backfill has run, and the screen must render them rather
   * than break on them.
   */
  it("renders a delivery that predates the branch field", async () => {
    asMock(goodsReceiptService.getById).mockResolvedValue(
      detail({ branchName: null }),
    );

    renderWithAuth(<ReceiptDetail receiptId={RECEIPT_ID} />);

    expect(await screen.findByText("GR-260806-001")).toBeInTheDocument();
    expect(screen.getByText("Cabang")).toBeInTheDocument();
    expect(screen.queryByText("Cabang Pusat")).toBeNull();
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
      screen.getByText(/[Ss]etiap baris punya lot sendiri/),
    ).toBeInTheDocument();
  });

  /**
   * CONSIGNED GOODS ARE NOT BOUGHT, so this form does not ask what they cost:
   * the column loses its `*`, the field is locked, and "0" is what is sent.
   *
   * THE PRICE IS NOT MERELY HIDDEN. `costPerUnit` is what
   * `stockMovementService` feeds to the weighted average, and a `receipt`
   * movement is not journal-exempt — so zero here averages the product's cost
   * basis DOWN tenant-wide, and later sales book COGS against the diluted
   * figure. That is the shop's decision; this test is what pins the behaviour
   * so it cannot change by accident.
   */
  it("locks the price at zero on a consignment", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceiptForm supplierId="s1" />);

    await user.click(
      await screen.findByRole("button", { name: "+ Tambah produk" }),
    );
    await user.click(await screen.findByLabelText(/Shampoo Anjing/));
    await user.click(screen.getByRole("button", { name: /Tambahkan/ }));

    // Outright, the row is seeded from the product's average and editable.
    const price = await screen.findByLabelText(/Harga Shampoo Anjing/);
    expect(price).toHaveValue("12000");
    expect(price).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Konsinyasi/ }));

    expect(screen.getByLabelText(/Harga Shampoo Anjing/)).toHaveValue("0");
    expect(screen.getByLabelText(/Harga Shampoo Anjing/)).toBeDisabled();
    // One name for the column now — "HPP manual" named an accounting concept at
    // somebody reading a delivery note.
    expect(screen.queryByText("HPP manual")).toBeNull();

    // Toggling back RESTORES what was typed: the zero overrides the draft, it
    // does not overwrite it.
    await user.click(screen.getByRole("button", { name: /Beli putus/ }));
    expect(screen.getByLabelText(/Harga Shampoo Anjing/)).toHaveValue("12000");
  });

  /**
   * The tab decides three things — the prices, the journal, and which products
   * the picker offers — so losing it on a refresh is not a cosmetic reset.
   */
  describe("the tab, and the URL that remembers it", () => {
    it("opens on the tab the query string names", async () => {
      renderWithAuth(
        <ReceiptForm supplierId="s1" initialPurchaseType="konsinyasi" />,
      );

      // Read off the hint under the tabs rather than the button's styling: the
      // selected tab is marked with colour alone, which is not a thing a test
      // (or a screen reader) should be asserting against.
      expect(
        await screen.findByText(/masih milik supplier/),
      ).toBeInTheDocument();
    });

    it("defaults to beli putus when the query string says nothing", async () => {
      renderWithAuth(<ReceiptForm supplierId="s1" />);

      expect(
        await screen.findByText(/jadi milik toko saat diterima/),
      ).toBeInTheDocument();
    });

    /**
     * THE URL SAYS WHICH TAB IS OPEN FROM THE FIRST PAINT.
     *
     * It used to say so only after a tab was clicked, so a form opened and never
     * toggled had a bare URL that MEANT *Beli putus* without stating it — and a
     * link shared from that screen reproduced the tab by coincidence rather than
     * by saying which one it was.
     */
    it("stamps the tab into the address bar on open", async () => {
      renderWithAuth(<ReceiptForm supplierId="s1" />);

      await waitFor(() =>
        expect(replace).toHaveBeenCalledWith(
          "/dashboard/purchasing/receipts/new?supplier=s1&type=beli_putus",
        ),
      );
      // `replace`, not `push`: opening a page must not cost a history entry the
      // user has to press Back through to leave.
      expect(push).not.toHaveBeenCalled();
    });

    /** The RESOLVED tab, not the raw parameter — so konsinyasi stays itself. */
    it("stamps konsinyasi when that is the tab it opened on", async () => {
      renderWithAuth(
        <ReceiptForm supplierId="s1" initialPurchaseType="konsinyasi" />,
      );

      await waitFor(() =>
        expect(replace).toHaveBeenCalledWith(
          "/dashboard/purchasing/receipts/new?supplier=s1&type=konsinyasi",
        ),
      );
    });

    /**
     * ONCE. The stamp navigates, so an effect that re-fired on every render
     * would drag the address bar back to the tab the form opened on while
     * somebody was working on the other one.
     */
    it("does not re-stamp over a tab the user has since chosen", async () => {
      const user = userEvent.setup();
      renderWithAuth(<ReceiptForm supplierId="s1" />);

      await user.click(
        await screen.findByRole("button", { name: /^Konsinyasi/ }),
      );

      expect(replace).toHaveBeenLastCalledWith(
        "/dashboard/purchasing/receipts/new?supplier=s1&type=konsinyasi",
      );
    });

    it("writes the tab to the URL, carrying the supplier with it", async () => {
      const user = userEvent.setup();
      renderWithAuth(<ReceiptForm supplierId="s1" />);

      await user.click(
        await screen.findByRole("button", { name: /^Konsinyasi/ }),
      );

      // `replace`, not `push`: the tab is a mode, and Back should leave the
      // screen rather than walk through every tab click.
      expect(replace).toHaveBeenCalledWith(
        "/dashboard/purchasing/receipts/new?supplier=s1&type=konsinyasi",
      );
      expect(push).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: /^Beli putus/ }));

      expect(replace).toHaveBeenLastCalledWith(
        "/dashboard/purchasing/receipts/new?supplier=s1&type=beli_putus",
      );
    });

    it("omits the supplier from the URL when none was given", async () => {
      const user = userEvent.setup();
      renderWithAuth(<ReceiptForm />);

      await user.click(
        await screen.findByRole("button", { name: /^Konsinyasi/ }),
      );

      expect(replace).toHaveBeenCalledWith(
        "/dashboard/purchasing/receipts/new?type=konsinyasi",
      );
    });
  });

  /**
   * The picker offers ONE kind of goods, chosen by the tab.
   *
   * Asserted against the SERVICE CALL rather than the rendered list, because
   * that is where the rule actually lives: the list comes back capped at 50, so
   * a browser-side filter would look identical here and silently drop matches
   * beyond the cap on a real catalogue.
   */
  describe("the product picker follows the tab", () => {
    it("asks for owned goods only on beli putus", async () => {
      const user = userEvent.setup();
      renderWithAuth(<ReceiptForm supplierId="s1" />);

      await user.click(
        await screen.findByRole("button", { name: "+ Tambah produk" }),
      );

      await waitFor(() =>
        expect(productService.list).toHaveBeenCalledWith(
          expect.objectContaining({ isConsignment: false }),
        ),
      );
    });

    it("asks for titipan only on konsinyasi", async () => {
      const user = userEvent.setup();
      renderWithAuth(
        <ReceiptForm supplierId="s1" initialPurchaseType="konsinyasi" />,
      );

      await user.click(
        await screen.findByRole("button", { name: "+ Tambah produk" }),
      );

      await waitFor(() =>
        expect(productService.list).toHaveBeenCalledWith(
          expect.objectContaining({ isConsignment: true }),
        ),
      );
    });

    it("names the tab inside the modal, where the tabs are not visible", async () => {
      const user = userEvent.setup();
      renderWithAuth(
        <ReceiptForm supplierId="s1" initialPurchaseType="konsinyasi" />,
      );

      await user.click(
        await screen.findByRole("button", { name: "+ Tambah produk" }),
      );

      // Without this the only cue for why half the catalogue is missing is
      // behind the overlay.
      expect(
        await screen.findByText(/hanya produk yang ditandai konsinyasi/),
      ).toBeInTheDocument();
    });
  });

  /**
   * Switching tabs AFTER picking is the one way a row can end up on the wrong
   * side. The form reports it rather than policing it — see `mismatchedLines`.
   */
  it("flags rows that no longer match the tab, without deleting them", async () => {
    const user = userEvent.setup();
    asMock(productService.list).mockResolvedValue(
      page([CONSIGNED_PRODUCT]) as never,
    );

    renderWithAuth(
      <ReceiptForm supplierId="s1" initialPurchaseType="konsinyasi" />,
    );

    await user.click(
      await screen.findByRole("button", { name: "+ Tambah produk" }),
    );
    await user.click(await screen.findByLabelText(/Pakan Titipan/));
    await user.click(screen.getByRole("button", { name: /Tambahkan/ }));

    await screen.findByLabelText(/Qty Pakan Titipan/);
    expect(screen.queryByText(/ditandai konsinyasi \(titipan\)/)).toBeNull();

    await user.click(screen.getByRole("button", { name: /^Beli putus/ }));

    expect(
      await screen.findByText(/Baris ini ditandai konsinyasi/),
    ).toBeInTheDocument();
    // The row SURVIVES: a tab click that silently deleted typed quantities is
    // worse than the receipt the warning is about.
    expect(screen.getByLabelText(/Qty Pakan Titipan/)).toBeInTheDocument();
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

/* ------------------------------------------------ the vendor's bill, at save */

/**
 * FILING THE FAKTUR IS PART OF RECEIVING, not a second trip to a second screen.
 *
 * The clerk prices the lines FROM the vendor's invoice — the page heading says
 * so — which means its number and date are already in front of them, and every
 * other field on a purchase invoice is derived from the delivery.
 *
 * A TICK BOX ASKS OUTRIGHT rather than inferring the intent from whether a box
 * is empty. Inferred, the form cannot tell a delivery whose faktur has not
 * arrived from one where somebody was interrupted mid-word: it either nags about
 * a legitimately empty box or drops a half-typed number in silence. Asked, both
 * fields are plainly required and blank means blank.
 */
describe("filing the supplier's invoice with the delivery", () => {
  /** Puts one line on the form so a save is possible. */
  async function withOneLine() {
    const user = userEvent.setup();
    renderWithAuth(<ReceiptForm supplierId="s1" />);

    await user.click(
      await screen.findByRole("button", { name: "+ Tambah produk" }),
    );
    await user.click(await screen.findByLabelText(/Shampoo Anjing/));
    await user.click(screen.getByRole("button", { name: /Tambahkan/ }));

    return user;
  }

  const tickBox = () =>
    screen.getByRole("checkbox", { name: /Sekalian buat faktur pembelian/ });

  const save = () =>
    screen.getByRole("button", { name: /Simpan & terima barang/ });

  /**
   * OFF BY DEFAULT: on, it would demand two more required fields the moment the
   * form opens, and a delivery whose faktur has not arrived is an ordinary
   * delivery rather than an unfinished one.
   */
  it("asks for nothing until the box is ticked", async () => {
    const user = await withOneLine();

    expect(tickBox()).not.toBeChecked();
    expect(screen.queryByLabelText(/No. faktur supplier/)).toBeNull();

    await user.click(save());

    await waitFor(() => expect(goodsReceiptService.create).toHaveBeenCalled());
    expect(
      asMock(goodsReceiptService.create).mock.calls[0][0].invoice,
    ).toBeUndefined();
  });

  /**
   * THE UNTICKED HALF IS THE ONE THAT HAS TO BE SPELLED OUT. An empty box reads
   * as "nothing happens", where what actually happens is a debt: a beli-putus
   * receipt credits 2101 Utang Supplier whether or not a faktur is filed. A
   * clerk who read the box as "belum ada utang" would leave a payable nobody is
   * watching.
   */
  it("says the debt is recorded either way", async () => {
    await withOneLine();

    expect(
      screen.getByText(/utang ke supplier tetap tercatat/i),
    ).toBeInTheDocument();
  });

  it("sends the number and the date once the box is ticked", async () => {
    const user = await withOneLine();

    await user.click(tickBox());
    await user.type(
      await screen.findByLabelText(/No. faktur supplier/),
      "INV/2026/014",
    );
    await user.clear(screen.getByLabelText(/Tanggal faktur/));
    await user.type(screen.getByLabelText(/Tanggal faktur/), "2026-08-06");

    await user.click(save());

    await waitFor(() => expect(goodsReceiptService.create).toHaveBeenCalled());
    const body = asMock(goodsReceiptService.create).mock.calls[0][0];
    expect(body.invoice?.invoiceNumber).toBe("INV/2026/014");
    expect(body.invoice?.invoiceDate).toBe("2026-08-06");
    // THE AMOUNTS ARE NOT SENT. They must equal the receipt's to the minor unit,
    // so the server takes them from the delivery — a client that could name them
    // could name a bill that disagrees with the payable already on the books.
    expect(body.invoice).not.toHaveProperty("subtotal");
    expect(body.invoice).not.toHaveProperty("taxAmount");
  });

  /** Ticked, both are required — and the refusal names the field, not the rule. */
  it("refuses to save a ticked bill with no number", async () => {
    const user = await withOneLine();

    await user.click(tickBox());
    await user.clear(await screen.findByLabelText(/No. faktur supplier/));

    await user.click(save());

    expect(goodsReceiptService.create).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Nomor faktur wajib diisi/),
    ).toBeInTheDocument();
  });

  it("refuses to save a ticked bill with no date", async () => {
    const user = await withOneLine();

    await user.click(tickBox());
    await user.type(
      await screen.findByLabelText(/No. faktur supplier/),
      "INV/2026/014",
    );
    await user.clear(screen.getByLabelText(/Tanggal faktur/));

    await user.click(save());

    expect(goodsReceiptService.create).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Tanggal faktur wajib diisi/),
    ).toBeInTheDocument();
  });

  /** Unticking takes the requirement away with the fields — that is the point. */
  it("stops asking, and stops sending, when the box is unticked again", async () => {
    const user = await withOneLine();

    await user.click(tickBox());
    await user.type(
      await screen.findByLabelText(/No. faktur supplier/),
      "INV/2026/014",
    );
    await user.click(tickBox());

    expect(screen.queryByLabelText(/No. faktur supplier/)).toBeNull();

    await user.click(save());

    await waitFor(() => expect(goodsReceiptService.create).toHaveBeenCalled());
    expect(
      asMock(goodsReceiptService.create).mock.calls[0][0].invoice,
    ).toBeUndefined();
  });

  /**
   * NOTHING HAS BEEN BOUGHT on a consignment intake, so there is no debt for a
   * bill to document — and the API refuses the key rather than ignoring it, so
   * sending one would break a legitimate delivery.
   */
  it("hides the whole card on konsinyasi, and never sends what was ticked", async () => {
    const user = await withOneLine();

    await user.click(tickBox());
    await user.type(
      await screen.findByLabelText(/No. faktur supplier/),
      "INV/2026/014",
    );
    await user.click(screen.getByRole("button", { name: /^Konsinyasi/ }));

    expect(
      screen.queryByRole("checkbox", { name: /faktur pembelian/i }),
    ).toBeNull();

    await user.click(save());

    await waitFor(() => expect(goodsReceiptService.create).toHaveBeenCalled());
    expect(
      asMock(goodsReceiptService.create).mock.calls[0][0].invoice,
    ).toBeUndefined();
  });

  /**
   * `dueDate` is derived server-side from the vendor's terms precisely so a
   * clerk cannot grant themselves terms nobody agreed to. This is a preview of
   * that answer, not an input.
   */
  it("previews the due date from the supplier's own terms", async () => {
    const user = await withOneLine();

    await user.click(tickBox());
    await user.clear(await screen.findByLabelText(/Tanggal faktur/));
    await user.type(screen.getByLabelText(/Tanggal faktur/), "2026-08-06");

    // SUPPLIER carries paymentTermDays: 30.
    expect(
      await screen.findByText(/Jatuh tempo 05 Sep 2026/),
    ).toBeInTheDocument();
  });

  /** The API's refusal is surfaced verbatim, naming the number on the paper. */
  it("reports a duplicate invoice number without swallowing it", async () => {
    asMock(goodsReceiptService.create).mockRejectedValue(
      new ApiError(
        "Invoice INV/2026/014 has already been filed for this supplier",
        409,
      ),
    );

    const user = await withOneLine();

    await user.click(tickBox());
    await user.type(
      await screen.findByLabelText(/No. faktur supplier/),
      "INV/2026/014",
    );
    await user.click(save());

    expect(
      await screen.findByText(/INV\/2026\/014 has already been filed/),
    ).toBeInTheDocument();
  });
});

/* ----------------------------------------- the header comes before the lines */

/**
 * SUPPLIER, CABANG, GUDANG — ANSWERED BEFORE A SINGLE PRODUCT IS PICKED.
 *
 * Not an ordering preference. A row for goods that expire has to say WHICH LOT
 * it lands in, and the lots on offer are the ones held at the destination
 * warehouse. Picked before a warehouse is named, that column can only offer
 * "+ Batch baru" — so a second delivery of a batch already on the shelf mints a
 * duplicate lot, with nothing on screen suggesting anything was missed.
 */
describe("what has to be answered before products can be added", () => {
  /** The greyed button explains itself: one with no reason reads as a bug. */
  it("will not open the picker before a supplier is named", async () => {
    renderWithAuth(<ReceiptForm />);

    expect(
      await screen.findByRole("button", { name: "+ Tambah produk" }),
    ).toBeDisabled();
    expect(screen.getByText(/Pilih supplier dulu/)).toBeInTheDocument();
  });

  it("names the branch as the next unanswered question", async () => {
    asMock(branchService.list).mockResolvedValue(
      page([
        { _id: BRANCH_ID, name: "Cabang Pusat", isActive: true },
        { _id: "br2", name: "Cabang Selatan", isActive: true },
      ]) as never,
    );

    renderWithAuth(<ReceiptForm supplierId="s1" />);

    expect(
      await screen.findByRole("button", { name: "+ Tambah produk" }),
    ).toBeDisabled();
    // The warehouse picker's own placeholder says the same words, so match on
    // the half only this message carries.
    expect(
      screen.getByText(/Pilih cabang dulu — gudang tujuan/),
    ).toBeInTheDocument();
  });

  /**
   * The one that matters most, and the reason the gate exists: the warehouse is
   * what the batch picker reads its options from.
   */
  it("names the warehouse, and says why it decides the batches", async () => {
    asMock(warehouseService.list).mockResolvedValue(
      page([
        WAREHOUSE,
        // The shared central warehouse: belongs to no branch, offered under all,
        // so this branch has two and neither may be guessed.
        { ...OTHER_WAREHOUSE, _id: "wh0", defaultBranchId: null },
      ]) as never,
    );

    renderWithAuth(<ReceiptForm supplierId="s1" />);

    expect(
      await screen.findByRole("button", { name: "+ Tambah produk" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Pilih gudang tujuan dulu.*batch/i),
    ).toBeInTheDocument();
    // No warehouse, no question to ask about its lots.
    expect(productBatchService.list).not.toHaveBeenCalled();
  });

  /** All three answered — a single-branch tenant reaches this on first paint. */
  it("opens the picker once the destination is settled", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceiptForm supplierId="s1" />);

    const add = await screen.findByRole("button", { name: "+ Tambah produk" });
    await waitFor(() => expect(add).not.toBeDisabled());

    await user.click(add);
    expect(await screen.findByLabelText(/Shampoo Anjing/)).toBeInTheDocument();
  });
});

/* ------------------------------------------------- the lot a delivery lands in */

/**
 * A DELIVERY EITHER JOINS A LOT OR OPENS ONE, and until this picker existed it
 * could only ever open one — so the second van carrying the batch the first one
 * brought minted a duplicate row: one physical batch, two expiry dates to keep in
 * step, two answers to "how much of RC-B26 is left".
 *
 * Drivable in jsdom, unlike the Radix selects in the header: the picker is
 * `FilterSelect`, the same control the adjustment sheet uses, and it is the
 * reference this behaviour was built from.
 */
describe("choosing which batch the goods land in", () => {
  const EXPIRING_PRODUCT = {
    ...PRODUCT,
    _id: "p3",
    sku: "VAKSIN",
    name: "Vaksin Rabies",
    hasExpiry: true,
  };

  const LOT = {
    _id: "b1",
    tenantId: "t1",
    warehouseId: WAREHOUSE._id,
    productId: EXPIRING_PRODUCT._id,
    receiptId: null,
    batchCode: "VAKSIN-270301",
    supplierBatchCode: "VAK-A26",
    expiryDate: "2027-03-01T00:00:00.000Z",
    initialQty: "20.0000",
    qtyRemaining: "8.0000",
    costPerUnit: "50000.0000",
    isConsignment: false,
    createdBy: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    productName: EXPIRING_PRODUCT.name,
    productSku: EXPIRING_PRODUCT.sku,
    productUnit: "botol",
    warehouseName: WAREHOUSE.name,
  };

  /** Renders the form with one expiring product already on it. */
  async function withExpiringLine(lots = [LOT]) {
    asMock(productService.list).mockResolvedValue(
      page([EXPIRING_PRODUCT]) as never,
    );
    asMock(productBatchService.list).mockResolvedValue(page(lots) as never);

    const user = userEvent.setup();
    renderWithAuth(<ReceiptForm supplierId="s1" />);

    await user.click(
      await screen.findByRole("button", { name: "+ Tambah produk" }),
    );
    await user.click(await screen.findByLabelText(/Vaksin Rabies/));
    await user.click(screen.getByRole("button", { name: /Tambahkan/ }));

    return user;
  }

  it("reads the lots of the destination warehouse, and only the ones with stock", async () => {
    await withExpiringLine();

    await waitFor(() =>
      expect(asMock(productBatchService.list)).toHaveBeenCalledWith(
        expect.objectContaining({
          warehouseId: WAREHOUSE._id,
          hasRemaining: true,
        }),
      ),
    );
  });

  /**
   * The supplier's code and the date DESCRIBE a lot, which mints it. Sending
   * them beside a lot that already exists is two answers to one question, and
   * the API refuses the pair rather than preferring one — so the payload must
   * carry neither.
   */
  it("sends batchId, and no description, when an existing lot is chosen", async () => {
    const user = await withExpiringLine();

    await user.click(await screen.findByLabelText(/^Batch Vaksin Rabies/));
    await user.click(await screen.findByRole("option", { name: /VAKSIN-270301/ }));

    await user.click(
      screen.getByRole("button", { name: /Simpan & terima barang/ }),
    );

    await waitFor(() => expect(goodsReceiptService.create).toHaveBeenCalled());
    const [item] = asMock(goodsReceiptService.create).mock.calls[0][0].items;
    expect(item.batchId).toBe("b1");
    expect(item.supplierBatchCode).toBeUndefined();
    expect(item.expiryDate).toBeUndefined();
  });

  /**
   * THE PICKER NAMES BOTH CODES, and that is what makes it usable: choosing a
   * lot is the act of matching a row on screen to a carton in somebody's hands,
   * and the number printed on the carton is the SUPPLIER's. Ours identifies the
   * row; theirs is what can be read off the box.
   */
  it("offers each lot under both of its codes", async () => {
    const user = await withExpiringLine();

    await user.click(await screen.findByLabelText(/^Batch Vaksin Rabies/));

    expect(
      await screen.findByRole("option", {
        name: /VAKSIN-270301 · supplier VAK-A26 · sisa/,
      }),
    ).toBeInTheDocument();
  });

  /**
   * Read-only, and in the same boxes the row above would type into — the grey is
   * what says the lot on the shelf is not this form's to rewrite.
   */
  it("shows the chosen lot's own code and date, locked", async () => {
    const user = await withExpiringLine();

    await user.click(await screen.findByLabelText(/^Batch Vaksin Rabies/));
    await user.click(await screen.findByRole("option", { name: /VAKSIN-270301/ }));

    const code = screen.getByLabelText(/^Kode batch internal Vaksin Rabies/);
    expect(code).toHaveTextContent("VAKSIN-270301");
    expect(code.tagName).toBe("OUTPUT");

    // Theirs is locked too: the lot recorded a supplier batch when it was
    // opened, and a later delivery retagging it would rewrite the first one's
    // recall trail.
    const supplier = screen.getByLabelText(
      /^Kode batch supplier Vaksin Rabies/,
    );
    expect(supplier).toHaveValue("VAK-A26");
    expect(supplier).toBeDisabled();

    const expiry = screen.getByLabelText(/^Expired Vaksin Rabies/);
    expect(expiry).toHaveValue("2027-03-01");
    expect(expiry).toBeDisabled();
  });

  /**
   * The other branch: a genuinely new lot is still described — but only by its
   * date and, optionally, the number on the carton. OUR code is shown and
   * disabled, because the server mints it.
   */
  it("asks for a date and the supplier's code when the lot is new", async () => {
    const user = await withExpiringLine();

    await user.click(await screen.findByLabelText(/^Batch Vaksin Rabies/));
    await user.click(await screen.findByRole("option", { name: /Batch baru/ }));

    const expiry = await screen.findByLabelText(/^Expired Vaksin Rabies/);
    expect(expiry).not.toBeDisabled();
    await user.type(expiry, "2028-01-01");

    // OURS is on the row but is not a field at all — the server mints it, so
    // there is nothing to type into.
    expect(
      screen.getByLabelText(/^Kode batch internal Vaksin Rabies/).tagName,
    ).toBe("OUTPUT");

    await user.click(
      screen.getByRole("button", { name: /Simpan & terima barang/ }),
    );

    await waitFor(() => expect(goodsReceiptService.create).toHaveBeenCalled());
    const [item] = asMock(goodsReceiptService.create).mock.calls[0][0].items;
    expect(item.batchId).toBeUndefined();
    // Never sent: ours is the server's to mint, and the API refuses a
    // client-supplied one outright.
    expect(item).not.toHaveProperty("batchCode");
    // Left blank, so it is omitted rather than sent as an empty string.
    expect(item.supplierBatchCode).toBeUndefined();
    expect(item.expiryDate).toBe("2028-01-01");
  });

  /**
   * THE ONE CODE A PERSON SUPPLIES. Optional — most cartons carry no number —
   * but when one does, it is what a recall notice will name, so it has to reach
   * the lot rather than being dropped on the way.
   */
  it("sends the supplier's batch number when the carton carries one", async () => {
    const user = await withExpiringLine();

    await user.click(await screen.findByLabelText(/^Batch Vaksin Rabies/));
    await user.click(await screen.findByRole("option", { name: /Batch baru/ }));

    await user.type(
      await screen.findByLabelText(/^Expired Vaksin Rabies/),
      "2028-01-01",
    );
    await user.type(
      screen.getByLabelText(/^Kode batch supplier Vaksin Rabies/),
      "VAK-B28",
    );

    await user.click(
      screen.getByRole("button", { name: /Simpan & terima barang/ }),
    );

    await waitFor(() => expect(goodsReceiptService.create).toHaveBeenCalled());
    const [item] = asMock(goodsReceiptService.create).mock.calls[0][0].items;
    expect(item.supplierBatchCode).toBe("VAK-B28");
    expect(item).not.toHaveProperty("batchCode");
  });

  /**
   * WHICH LOT IS THE FIRST QUESTION, so an unanswered one blocks the save — and
   * the refusal names the product, because "pilih batch dulu" on a forty-line
   * delivery states a rule the reader already agrees with.
   */
  it("refuses to save while a row has not said which lot", async () => {
    const user = await withExpiringLine();

    await user.click(
      screen.getByRole("button", { name: /Simpan & terima barang/ }),
    );

    expect(goodsReceiptService.create).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Vaksin Rabies: pilih batch dulu/),
    ).toBeInTheDocument();
  });

  /**
   * A CONSIGNMENT LOT HOLDS THE SUPPLIER'S GOODS and carries its own hand-entered
   * cost. Pouring an outright purchase into one would leave a single lot half
   * titipan and half milik toko, with one flag to describe both.
   */
  it("hides a consignment lot from an outright delivery", async () => {
    const user = await withExpiringLine([{ ...LOT, isConsignment: true }]);

    await user.click(await screen.findByLabelText(/^Batch Vaksin Rabies/));

    expect(screen.queryByRole("option", { name: /VAK-A26/ })).toBeNull();
    expect(
      await screen.findByRole("option", { name: /Batch baru/ }),
    ).toBeInTheDocument();
  });
});

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
describe("batchCodeHint", () => {
  it("keys on the expiry date, because that is what distinguishes a lot", () => {
    expect(batchCodeHint("SHAMPOO", "2027-03-01", "2026-08-06")).toBe(
      "SHAMPOO-270301",
    );
  });

  /**
   * Consigned goods that never expire still get their own lot — its cost was
   * typed in by hand — and the receipt date is the only thing separating one
   * consignment of them from the next.
   */
  it("falls back to the receipt date when the goods do not expire", () => {
    expect(batchCodeHint("PASIR", "", "2026-08-06")).toBe("PASIR-260806");
  });

  /**
   * The code is printed as a barcode and travels in the lookup URL, so the
   * shape is a promise to hardware: upper case, digits and `-`, nothing else.
   * An SKU's own punctuation is dropped rather than kept, because `-` is the
   * separator and two of them would be unreadable.
   */
  it("emits nothing a barcode or a URL has to escape", () => {
    expect(batchCodeHint("RC/ADULT:1KG", "2027-03-01", "")).toBe(
      "RCADULT1KG-270301",
    );
  });

  /**
   * A HINT, NOT THE CODE. The saved one is unique across the tenant, so a
   * second lot of the same goods is `…-2` — which nothing in the browser can
   * know. The preview endpoints answer with the real one; this is the fallback
   * for the moment before one has come back.
   */
  it("stays inside the API's 60-character limit", () => {
    const code = batchCodeHint("X".repeat(80), "2027-03-01", "2026-08-06");

    expect(code.length).toBeLessThanOrEqual(60);
    expect(code.endsWith("-270301")).toBe(true);
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
    // Not "never navigated" — opening the form stamps its own tab into the
    // address bar, which is a `replace` to THIS page. What must not happen is
    // leaving for a receipt that was never created.
    await waitFor(() =>
      expect(replace).not.toHaveBeenCalledWith(
        expect.stringContaining(`/receipts/${RECEIPT_ID}`),
      ),
    );
  });
});
