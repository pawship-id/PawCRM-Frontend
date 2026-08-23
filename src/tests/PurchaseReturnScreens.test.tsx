import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";

import {
  PurchaseReturnDetail,
  PurchaseReturnForm,
  PurchaseReturnsScreen,
} from "@/features/purchasing";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { purchaseReturnService } from "@/services/purchaseReturn.service";
import { supplierService } from "@/services/supplier.service";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import type {
  GoodsReceiptDetail,
  GoodsReceiptListRow,
  PurchaseReturnDetail as ReturnDetail,
  PurchaseReturnListRow,
  PurchaseReturnPreview,
} from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/goodsReceipt.service");
jest.mock("@/services/purchaseReturn.service");
jest.mock("@/services/supplier.service");
jest.mock("@/services/warehouse.service");

// SweetAlert2 does not survive jsdom, and a toast is not the unit under test —
// an unmocked one throws inside the very handlers these tests exercise, turning
// a successful discard into a "gagal" banner. Same stub PayablesScreens uses.
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
}));

/**
 * The purchase-return screens, against mocked services.
 *
 * WHAT THESE TESTS GUARD. These screens replaced a prototype that ran on an
 * in-memory store, simulated the weighted-average reversal in the browser, and
 * posted a return irreversibly from the create form. Every way they can regress
 * is a way of drifting back toward that:
 *
 *  1. THE CREATE FORM MAKES A DRAFT, NOT A POSTING. Nothing leaves the shelf
 *     until somebody with `purchaseReturns:submit` says so on the detail screen;
 *  2. NOTHING IS RECOMPUTED LOCALLY. The new HPP and the journal come from
 *     `/preview`, which runs the submit's own code with the commit left off — a
 *     locally derived figure would disagree silently, and the figure in question
 *     is the cost basis of everything still in stock;
 *  3. THE PAYLOAD IS THREE FIELDS PER LINE. `costPerUnit` is the server's, and a
 *     client that could send it could rewrite the cost basis;
 *  4. BOTH PURCHASE TYPES ARE RETURNABLE. The prototype filtered consignment out
 *     and was stricter than the API;
 *  5. THE `submit` PERMISSION IS SEPARATE FROM `update`, and a role holding only
 *     the latter must see a working page without a preview, not an error;
 *  6. a submitted return offers no edit and no delete, because the API has
 *     neither.
 *
 * The Radix selects are not driven — jsdom cannot do their pointer protocol — so
 * the form tests assert on payloads and rendered state rather than on picking.
 *
 * THIS FILE REPLACES PurchasingScreens.test.tsx, which was the last of the
 * purchasing suites still seeding `demoStore`. It went the same way suppliers,
 * goods receipts and payables went before it: the screens moved to the real API,
 * so their tests mock services instead of a prototype store. The prototype's own
 * behaviour — including the `beli_putus`-only rule these screens no longer have —
 * is still covered where it belongs, in purchasingStore.test.ts.
 */
/**
 * Opens the one filter panel and returns it.
 *
 * Supplier, warehouse, status, the date range and the ordering all live inside
 * it, so each of those assertions starts here — which is also the cheapest way
 * to notice if the button ever stops being reachable. The trigger's text carries
 * a count (`Filter (2)`); its accessible name does not, so it is found by the
 * stable half.
 */
async function openFilters(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Filter" }));
  return screen.findByRole("dialog");
}

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

const RETURN_ID = "pr1";
const RECEIPT_ID = "gr1";

function listRow(
  overrides: Partial<PurchaseReturnListRow> = {},
): PurchaseReturnListRow {
  return {
    _id: RETURN_ID,
    returnNumber: "PR-260807-001",
    returnDate: "2026-08-07T00:00:00.000Z",
    status: "draft",
    supplierId: "s1",
    supplierName: "PT Sumber Pangan",
    warehouseId: "wh1",
    warehouseName: "Gudang Utama",
    originalReceiptId: RECEIPT_ID,
    originalReceiptNumber: "GR-260806-001",
    totalAmount: "60000.0000",
    itemCount: 1,
    createdAt: "2026-08-07T09:14:00.000Z",
    ...overrides,
  };
}

function returnDetail(overrides: Partial<ReturnDetail> = {}): ReturnDetail {
  return {
    _id: RETURN_ID,
    returnNumber: "PR-260807-001",
    returnDate: "2026-08-07T00:00:00.000Z",
    status: "draft",
    supplierId: "s1",
    supplierName: "PT Sumber Pangan",
    warehouseId: "wh1",
    warehouseName: "Gudang Utama",
    originalReceiptId: RECEIPT_ID,
    originalReceiptNumber: "GR-260806-001",
    totalAmount: "60000.0000",
    journalEntryId: null,
    createdByName: "Sari",
    createdAt: "2026-08-07T09:14:00.000Z",
    updatedAt: "2026-08-07T09:14:00.000Z",
    items: [
      {
        originalReceiptItemId: "it1",
        productId: "p1",
        productSku: "SHAMPOO",
        productName: "Shampoo Anjing",
        productUnit: "botol",
        batchId: null,
        batchCode: null,
        batchExpiryDate: null,
        qty: "4.0000",
        costPerUnit: "15000.0000",
        subtotal: "60000.0000",
        reason: "Rusak",
      },
    ],
    ...overrides,
  };
}

function receiptDetail(
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
    taxAmount: "0.0000",
    grandTotal: "150000.0000",
    invoiceId: null,
    journalEntryId: "je1",
    notes: null,
    createdAt: "2026-08-06T09:14:00.000Z",
    ...overrides,
  };
}

function receiptRow(
  overrides: Partial<GoodsReceiptListRow> = {},
): GoodsReceiptListRow {
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
    taxAmount: "0.0000",
    grandTotal: "150000.0000",
    itemCount: 1,
    invoiceId: null,
    notes: null,
    createdAt: "2026-08-06T09:14:00.000Z",
    ...overrides,
  };
}

function preview(
  overrides: Partial<PurchaseReturnPreview> = {},
): PurchaseReturnPreview {
  return {
    returnId: RETURN_ID,
    returnNumber: "PR-260807-001",
    originalReceiptId: RECEIPT_ID,
    originalReceiptNumber: "GR-260806-001",
    purchaseType: "beli_putus",
    items: [
      {
        originalReceiptItemId: "it1",
        productId: "p1",
        batchId: null,
        qty: "4.0000",
        costPerUnit: "15000.0000",
        subtotal: "60000.0000",
        reason: "Rusak",
      },
    ],
    totalAmount: "60000.0000",
    movements: [],
    hppAvg: [
      {
        productId: "p1",
        before: "15000.0000",
        after: "15000.0000",
        qtyBefore: "10.0000",
        qtyIn: "-4.0000",
        unitCost: "15000.0000",
      },
    ],
    journal: [
      {
        accountId: "acc-payable",
        accountCode: "2101",
        accountName: "Utang Supplier",
        debit: "60000.0000",
        credit: "0",
      },
      {
        accountId: "acc-inventory",
        accountCode: "1201",
        accountName: "Persediaan Barang Dagangan",
        debit: "0",
        credit: "60000.0000",
      },
    ],
    ...overrides,
  };
}

function page(items: PurchaseReturnListRow[]) {
  return {
    items,
    pagination: {
      page: 1,
      limit: 20,
      total: items.length,
      totalPages: 1,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  asMock(supplierService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  } as never);
  asMock(warehouseService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  } as never);
});

/* ------------------------------------------------------------------- list */

describe("PurchaseReturnsScreen", () => {
  it("renders a return with its delivery, value and status", async () => {
    asMock(purchaseReturnService.list).mockResolvedValue(
      page([listRow()]) as never,
    );

    renderWithAuth(<PurchaseReturnsScreen />);

    expect(await screen.findByText("PR-260807-001")).toBeInTheDocument();
    expect(screen.getByText("GR-260806-001")).toBeInTheDocument();
    expect(screen.getByText("PT Sumber Pangan")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  /**
   * A draft can be continued or discarded; a final one can only be read. The
   * verbs differ because the invitation does — "Lanjutkan" says there is work
   * left, "Lihat" does not.
   */
  it("offers Lanjutkan on a draft and Lihat on a final return", async () => {
    asMock(purchaseReturnService.list).mockResolvedValue(
      page([
        listRow(),
        listRow({
          _id: "pr2",
          returnNumber: "PR-260807-002",
          status: "submitted",
        }),
      ]) as never,
    );

    renderWithAuth(<PurchaseReturnsScreen />);

    expect(await screen.findByRole("link", { name: "Lanjutkan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lihat" })).toBeInTheDocument();
  });

  /**
   * The API refuses to discard a submitted return — it is the supporting
   * document for movements and a journal entry that are both immutable — so the
   * control must not be offered for one.
   */
  it("offers Buang only on a draft", async () => {
    asMock(purchaseReturnService.list).mockResolvedValue(
      page([
        listRow({ _id: "pr2", returnNumber: "PR-2", status: "submitted" }),
      ]) as never,
    );

    renderWithAuth(<PurchaseReturnsScreen />);

    await screen.findByText("PR-2");
    expect(screen.queryByRole("button", { name: "Buang" })).toBeNull();
  });

  it("orders by the number sequence when the panel asks for it", async () => {
    const user = userEvent.setup();
    asMock(purchaseReturnService.list).mockResolvedValue(
      page([listRow()]) as never,
    );

    renderWithAuth(<PurchaseReturnsScreen />);
    await screen.findByText("PR-260807-001");

    const panel = await openFilters(user);
    await user.click(within(panel).getByLabelText("Urutkan"));
    await user.click(await screen.findByRole("option", { name: "Nomor A–Z" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => {
      const calls = asMock(purchaseReturnService.list).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({ sort: "numberAsc" });
    });
  });

  /**
   * The ordering is not counted in the trigger's badge — every list has one, so
   * it is never "on", and a badge reading `Filter (1)` over an unnarrowed list
   * would train people to ignore the number. A real filter beside it must still
   * count, which is the other half of the assertion.
   */
  it("counts the status filter but not the ordering", async () => {
    const user = userEvent.setup();
    asMock(purchaseReturnService.list).mockResolvedValue(
      page([listRow()]) as never,
    );

    renderWithAuth(<PurchaseReturnsScreen />);
    await screen.findByText("PR-260807-001");

    const panel = await openFilters(user);
    await user.click(within(panel).getByLabelText("Urutkan"));
    await user.click(await screen.findByRole("option", { name: "Terlama" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => {
      const calls = asMock(purchaseReturnService.list).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({ sort: "oldest" });
    });
    expect(
      screen.getByRole("button", { name: "Filter" }),
    ).not.toHaveTextContent("(");

    const reopened = await openFilters(user);
    await user.click(within(reopened).getByLabelText("Filter status"));
    await user.click(await screen.findByRole("option", { name: "Draft" }));
    await user.click(within(reopened).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Filter" }),
      ).toHaveTextContent("Filter (1)"),
    );
  });

  it("discards a draft only after confirmation, then reloads the list", async () => {
    const user = userEvent.setup();
    asMock(purchaseReturnService.list).mockResolvedValue(
      page([listRow()]) as never,
    );
    asMock(purchaseReturnService.remove).mockResolvedValue(
      returnDetail() as never,
    );

    renderWithAuth(<PurchaseReturnsScreen />);

    await user.click(await screen.findByRole("button", { name: "Buang" }));
    expect(purchaseReturnService.remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Buang draft" }));

    await waitFor(() =>
      expect(purchaseReturnService.remove).toHaveBeenCalledWith(RETURN_ID),
    );
    // The row has to leave the list; a refetch is how.
    await waitFor(() =>
      expect(asMock(purchaseReturnService.list).mock.calls.length).toBeGreaterThan(1),
    );
  });

  it("surfaces the API's refusal when a discard loses a race with a submit", async () => {
    const user = userEvent.setup();
    asMock(purchaseReturnService.list).mockResolvedValue(
      page([listRow()]) as never,
    );
    asMock(purchaseReturnService.remove).mockRejectedValue(
      new ApiError("This purchase return is no longer a draft", 409, {
        reason: "It was submitted while you were deleting it",
      }),
    );

    renderWithAuth(<PurchaseReturnsScreen />);

    await user.click(await screen.findByRole("button", { name: "Buang" }));
    await user.click(screen.getByRole("button", { name: "Buang draft" }));

    expect(
      await screen.findByText(/no longer a draft/i),
    ).toBeInTheDocument();
  });

  it("hides the row actions from a role that may only read", async () => {
    asMock(purchaseReturnService.list).mockResolvedValue(
      page([listRow()]) as never,
    );

    renderWithAuth(<PurchaseReturnsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "purchaseReturns", actions: ["read"] }],
    });

    await screen.findByText("PR-260807-001");
    expect(screen.queryByRole("button", { name: "Buang" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Buat retur" })).toBeNull();
  });
});

/* ------------------------------------------------------------------- form */

describe("PurchaseReturnForm", () => {
  beforeEach(() => {
    asMock(goodsReceiptService.list).mockResolvedValue({
      items: [receiptRow()],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    } as never);
    asMock(goodsReceiptService.getById).mockResolvedValue(
      receiptDetail() as never,
    );
  });

  /**
   * BOTH PURCHASE TYPES. The prototype filtered to `beli_putus` and was stricter
   * than the API: consignment goods CAN be sent back — the stock leaves and the
   * average is reversed identically, and only the journal entry is skipped.
   */
  it("does not narrow the receipt list to beli_putus", async () => {
    renderWithAuth(<PurchaseReturnForm />);

    await waitFor(() => expect(goodsReceiptService.list).toHaveBeenCalled());

    const [query] = asMock(goodsReceiptService.list).mock.calls[0];
    expect(query).not.toHaveProperty("purchaseType");
  });

  it("shows the delivered, already-returned and remaining quantities per line", async () => {
    asMock(goodsReceiptService.getById).mockResolvedValue(
      receiptDetail({
        items: [
          {
            ...receiptDetail().items[0],
            returnedQty: "4.0000",
            remainingQty: "6.0000",
          },
        ],
      }) as never,
    );

    renderWithAuth(<PurchaseReturnForm receiptId={RECEIPT_ID} />);

    const row = (await screen.findByText("Shampoo Anjing")).closest("tr")!;
    expect(within(row).getByText("10")).toBeInTheDocument();
    expect(within(row).getByText("4")).toBeInTheDocument();
    expect(within(row).getByText("6")).toBeInTheDocument();
  });

  /**
   * THE PAYLOAD IS THREE FIELDS PER LINE. Everything else is copied server-side
   * from the traced receipt line — a client able to send `costPerUnit` could
   * restate the cost basis every later sale is costed at.
   */
  /**
   * `reason` IS REQUIRED PER LINE and the API refuses a return without one — it
   * is the field the SUPPLIER reads on the document sent to settle the
   * disagreement. The form must not offer to send a payload that will bounce.
   */
  it("will not save a line whose reason has not been given", async () => {
    const user = userEvent.setup();
    asMock(purchaseReturnService.create).mockResolvedValue(
      returnDetail() as never,
    );

    renderWithAuth(<PurchaseReturnForm receiptId={RECEIPT_ID} />);

    await user.type(
      await screen.findByLabelText("Qty retur Shampoo Anjing"),
      "4",
    );

    expect(await screen.findByText("alasan wajib diisi")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Simpan draft retur/ }),
    ).toBeDisabled();
    expect(purchaseReturnService.create).not.toHaveBeenCalled();
  });

  it("refuses a quantity larger than what is still returnable", async () => {
    const user = userEvent.setup();

    renderWithAuth(<PurchaseReturnForm receiptId={RECEIPT_ID} />);

    await user.type(
      await screen.findByLabelText("Qty retur Shampoo Anjing"),
      "99",
    );

    expect(await screen.findByText("maks 10")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Simpan draft retur/ }),
    ).toBeDisabled();
  });

  /** Consignment posts no entry, and the form says so before anything is keyed. */
  it("warns that a consignment return reduces no debt", async () => {
    asMock(goodsReceiptService.getById).mockResolvedValue(
      receiptDetail({ purchaseType: "konsinyasi" }) as never,
    );

    renderWithAuth(<PurchaseReturnForm receiptId={RECEIPT_ID} />);

    expect(
      await screen.findByText(/tidak ada utang yang berkurang/i),
    ).toBeInTheDocument();
  });

  /** Creating a draft moves nothing — the copy must not imply otherwise. */
  it("says plainly that saving does not move stock", async () => {
    renderWithAuth(<PurchaseReturnForm receiptId={RECEIPT_ID} />);

    // The sentence is broken across a <b>, so match on the paragraph's own text.
    await screen.findByText("Penerimaan asal");
    expect(
      document.body.textContent,
    ).toMatch(/Menyimpan draft\s*belum\s*mengeluarkan stok/i);
  });
});

/* ----------------------------------------------------------------- detail */

describe("PurchaseReturnDetail", () => {
  beforeEach(() => {
    asMock(goodsReceiptService.getById).mockResolvedValue(
      receiptDetail() as never,
    );
  });

  it("renders the stored lines with the original purchase price", async () => {
    asMock(purchaseReturnService.getById).mockResolvedValue(
      returnDetail() as never,
    );

    renderWithAuth(<PurchaseReturnDetail returnId={RETURN_ID} />);

    expect(await screen.findByText("PR-260807-001")).toBeInTheDocument();
    expect(screen.getByText("Rp 15.000")).toBeInTheDocument();
    expect(screen.getByText("Rusak")).toBeInTheDocument();
  });

  /**
   * PREVIEW BEFORE CONFIRM. The preview refuses exactly what the submit refuses,
   * so asking first turns a post-commit failure into a pre-commit one.
   */
  it("previews before opening the submit confirmation", async () => {
    const user = userEvent.setup();
    asMock(purchaseReturnService.getById).mockResolvedValue(
      returnDetail() as never,
    );
    asMock(purchaseReturnService.preview).mockResolvedValue(preview() as never);

    renderWithAuth(<PurchaseReturnDetail returnId={RETURN_ID} />);

    await user.click(await screen.findByRole("button", { name: "Submit retur" }));

    await waitFor(() =>
      expect(purchaseReturnService.preview).toHaveBeenCalledWith(RETURN_ID),
    );
    expect(
      await screen.findByRole("button", { name: "Submit retur" }),
    ).toBeInTheDocument();
    expect(purchaseReturnService.submit).not.toHaveBeenCalled();
  });

  /** The HPP working comes from the server, never from a local simulation. */
  it("renders the server's HPP working rather than computing one", async () => {
    const user = userEvent.setup();
    asMock(purchaseReturnService.getById).mockResolvedValue(
      returnDetail() as never,
    );
    asMock(purchaseReturnService.preview).mockResolvedValue(preview() as never);

    renderWithAuth(<PurchaseReturnDetail returnId={RETURN_ID} />);

    await user.click(await screen.findByRole("button", { name: "Submit retur" }));

    expect(
      await screen.findByText(/HPP dihitung ulang dengan HARGA BELI ASLI/i),
    ).toBeInTheDocument();
    // Labelled from the payload — no client-side account guessing.
    expect(screen.getByText("Utang Supplier")).toBeInTheDocument();
    expect(screen.getByText("2101")).toBeInTheDocument();
  });

  it("submits only after the confirmation is accepted", async () => {
    const user = userEvent.setup();
    asMock(purchaseReturnService.getById).mockResolvedValue(
      returnDetail() as never,
    );
    asMock(purchaseReturnService.preview).mockResolvedValue(preview() as never);
    asMock(purchaseReturnService.submit).mockResolvedValue(
      returnDetail({ status: "submitted", journalEntryId: "je9" }) as never,
    );

    renderWithAuth(<PurchaseReturnDetail returnId={RETURN_ID} />);

    await user.click(await screen.findByRole("button", { name: "Submit retur" }));
    await screen.findByText(/tidak bisa dibatalkan/i);

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Submit retur" }));

    await waitFor(() =>
      expect(purchaseReturnService.submit).toHaveBeenCalledWith(RETURN_ID),
    );
  });

  /**
   * A submitted return is read-only, permanently — there is no un-submit, and
   * offering an edit here would be offering to unwind a posting that cannot be
   * unwound.
   */
  it("offers no edit, submit or discard on a submitted return", async () => {
    asMock(purchaseReturnService.getById).mockResolvedValue(
      returnDetail({ status: "submitted", journalEntryId: "je9" }) as never,
    );

    renderWithAuth(<PurchaseReturnDetail returnId={RETURN_ID} />);

    await screen.findByText("PR-260807-001");
    expect(screen.queryByRole("button", { name: "Ubah baris" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit retur" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Buang draft" })).toBeNull();
    expect(screen.getByText(/sudah final/i)).toBeInTheDocument();
  });

  it("links to the journal entry a submitted return posted", async () => {
    asMock(purchaseReturnService.getById).mockResolvedValue(
      returnDetail({ status: "submitted", journalEntryId: "je9" }) as never,
    );

    renderWithAuth(<PurchaseReturnDetail returnId={RETURN_ID} />);

    const link = await screen.findByRole("link", { name: /lihat entri jurnal/i });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/keuangan/journal-entries/je9",
    );
  });

  /**
   * A null `journalEntryId` on a SUBMITTED return means consignment or a
   * zero-value return, not "nothing posted" — the stock still left and the
   * average was still reversed. A screen that collapsed the two would mislead.
   */
  it("explains a submitted return that posted no journal", async () => {
    asMock(purchaseReturnService.getById).mockResolvedValue(
      returnDetail({ status: "submitted", journalEntryId: null }) as never,
    );

    renderWithAuth(<PurchaseReturnDetail returnId={RETURN_ID} />);

    expect(
      await screen.findByText(/Stok tetap keluar dan HPP tetap dibalik/i),
    ).toBeInTheDocument();
  });

  /**
   * `preview` is gated on `purchaseReturns:submit`, not `read`. A storekeeper
   * holding create/read/update gets a 403 there while the rest of the page works
   * — which is a panel they do not get, never an error banner.
   */
  it("shows a clerk the draft without a preview or a submit button", async () => {
    asMock(purchaseReturnService.getById).mockResolvedValue(
      returnDetail() as never,
    );

    renderWithAuth(<PurchaseReturnDetail returnId={RETURN_ID} />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "purchaseReturns", actions: ["read", "update"] },
      ],
    });

    await screen.findByText("PR-260807-001");
    expect(screen.getByRole("button", { name: "Ubah baris" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit retur" })).toBeNull();
    expect(purchaseReturnService.preview).not.toHaveBeenCalled();
  });

  it("sends the whole line list on save, because items replace wholesale", async () => {
    const user = userEvent.setup();
    asMock(purchaseReturnService.getById).mockResolvedValue(
      returnDetail() as never,
    );
    asMock(purchaseReturnService.update).mockResolvedValue(
      returnDetail({ updatedAt: "2026-08-07T10:00:00.000Z" }) as never,
    );

    renderWithAuth(<PurchaseReturnDetail returnId={RETURN_ID} />);

    await user.click(await screen.findByRole("button", { name: "Ubah baris" }));

    const qty = await screen.findByLabelText("Qty retur Shampoo Anjing");
    await user.clear(qty);
    await user.type(qty, "6");

    await user.click(screen.getByRole("button", { name: "Simpan perubahan" }));

    await waitFor(() => expect(purchaseReturnService.update).toHaveBeenCalled());

    const [id, body] = asMock(purchaseReturnService.update).mock.calls[0];
    expect(id).toBe(RETURN_ID);
    expect(body.items).toEqual([
      { originalReceiptItemId: "it1", qty: "6", reason: "Rusak" },
    ]);
    // The date rides along so a mistyped one can be corrected on a draft.
    expect(body.returnDate).toBe("2026-08-07");
  });
});
