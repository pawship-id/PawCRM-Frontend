import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";

import {
  EditInvoiceScreen,
  InvoiceDetail,
  PayablesScreen,
  PurchaseInvoiceForm,
  PurchasePaymentDetail,
  PurchasingHub,
} from "@/features/purchasing";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { consignmentSettlementService } from "@/services/consignmentSettlement.service";
import { swalToast } from "@/lib/swal";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { supplierService } from "@/services/supplier.service";
import { branchService } from "@/services/branch.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { warehouseService } from "@/services/warehouse.service";
import { productService } from "@/services/product.service";
import { productBatchService } from "@/services/productBatch.service";
import type { ProductBatch } from "@/types/inventory";
import { ApiError } from "@/services/api-error";
import type {
  ManualPurchaseInvoiceInput,
  GoodsReceiptDetail,
  GoodsReceiptListRow,
  PurchaseInvoiceDetail,
  PurchaseInvoiceItem,
  PayablesSummary,
  PurchaseInvoiceListRow,
  SupplierOutstandingSummary,
} from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/purchaseInvoice.service");
jest.mock("@/services/consignmentSettlement.service");
jest.mock("@/services/goodsReceipt.service");
jest.mock("@/services/supplier.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/paymentChannel.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/services/warehouse.service");
jest.mock("@/services/productBatch.service");
jest.mock("@/services/product.service");
jest.mock("@/services/cashTransaction.service");

/**
 * "Riwayat aktivitas" has its own request and its own rendering; these screens
 * only have to mount it. An empty, settled history keeps it out of the way.
 */
jest.mock("@/features/purchasing/hooks/usePurchaseActivity", () => ({
  usePurchaseActivity: jest.fn(() => ({
    items: [],
    loading: false,
    error: null,
  })),
}));

const push = jest.fn();
const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => push(href),
    replace: (href: string) => replace(href),
  }),
}));

/**
 * The module header — the title and the six-tab row — is reduced to the one
 * thing this screen puts INTO it: its headline figure, where it has one. The
 * tab row needs a router this suite has no reason to stand up, and the header's
 * own behaviour has its own suite (PurchasingModuleHeader.test.tsx).
 */
jest.mock("@/features/purchasing/components/PurchasingModuleHeader", () => ({
  PurchasingModuleHeader: ({ action }: { action?: React.ReactNode }) =>
    action ?? null,
}));

jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

/**
 * The Faktur Pembelian screens, against mocked services.
 *
 * WHAT THESE TESTS GUARD. These screens replaced a prototype that computed the
 * outstanding balance, the overdue flag and the running total in the browser, and
 * every way they can regress is a way of drifting back toward that:
 *
 *  1. `outstandingAmount` AND `isOverdue` COME FROM THE SERVER. A row rendered
 *     from locally recomputed arithmetic would disagree with the banner above it
 *     the first time a due date fell mid-render;
 *  2. THE VIEW FILTERS GO OVER THE WIRE as `outstanding` / `overdue` booleans. A
 *     client-side filter shows four rows above a pager claiming twenty;
 *  3. THE HEADLINE TOTALS ARE THE WHOLE BOOK, from `/outstanding` — never summed
 *     from the page, which would grow as the user pages;
 *  4. a payment cannot be double-submitted, because `POST /:id/payments` is not
 *     idempotent and would move the cash twice on two irreversible entries;
 *  5. `pay` is gated separately from `read`, which is the separation of duties
 *     the backend enforces;
 *  6. the amounts on a filed invoice are NOT editable — they must reconcile with
 *     the receipt to the minor unit or the API refuses the whole request.
 *
 * The Radix selects are not driven — jsdom cannot do their pointer protocol — so
 * the form tests preselect through props and assert on payloads.
 */
const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * Opens the one filter panel and returns it.
 *
 * Supplier, the date range and the ordering all live inside it, so each of those
 * assertions starts here — which is also the cheapest way to notice if the
 * button ever stops being reachable. The trigger's text carries a count
 * (`Filter (2)`); its accessible name does not, so it is found by the stable
 * half. The VIEW pills are deliberately not in here — they sit outside the bar.
 */
async function openFilters(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Filter" }));
  return screen.findByRole("dialog");
}

const INVOICE_ID = "inv1";
const RECEIPT_ID = "gr1";

function listRow(
  overrides: Partial<PurchaseInvoiceListRow> = {},
): PurchaseInvoiceListRow {
  return {
    _id: INVOICE_ID,
    invoiceNumber: "INV/2026/VIII/0142",
    supplierInvoiceNumber: "INV/2026/VIII/0142",
    supplierId: "s1",
    supplierName: "PT Sumber Pangan",
    branchId: "b1",
    branchName: "Cabang Pusat",
    goodsReceiptId: RECEIPT_ID,
    // Linked to a fully received delivery: locked, and payable in full.
    locked: true,
    receivedAmount: "166500.0000",
    payableAmount: "166500.0000",
    // Read back through the delivery, not stored on the invoice — see the type.
    warehouseId: "wh1",
    warehouseName: "Gudang Utama",
    invoiceDate: "2026-08-06T00:00:00.000Z",
    dueDate: "2026-09-05T00:00:00.000Z",
    subtotal: "150000.0000",
    taxAmount: "16500.0000",
    total: "166500.0000",
    paidAmount: "0.0000",
    outstandingAmount: "166500.0000",
    isOverdue: false,
    status: "unpaid",
    paymentCount: 0,
    notes: null,
    createdAt: "2026-08-06T09:14:00.000Z",
    ...overrides,
  };
}

function invoiceItem(
  overrides: Partial<PurchaseInvoiceItem> = {},
): PurchaseInvoiceItem {
  return {
    invoiceItemId: "ii1",
    productId: "p1",
    name: "Shampoo Anjing",
    productSku: "SHAMPOO",
    productName: "Shampoo Anjing",
    productUnit: "botol",
    qty: "10.0000",
    costPerUnit: "15000.0000",
    subtotal: "150000.0000",
    cancelledQty: "0.0000",
    receivedQty: "10.0000",
    ...overrides,
  };
}

/**
 * A MANUAL bill — typed in before the goods arrived. No receipt, not locked,
 * nothing received, nothing payable.
 */
function manualDetail(
  overrides: Partial<PurchaseInvoiceDetail> = {},
): PurchaseInvoiceDetail {
  return detail({
    goodsReceiptId: null,
    goodsReceiptNumber: null,
    goodsReceiptStatus: null,
    locked: false,
    receivedAmount: "0.0000",
    payableAmount: "0.0000",
    items: [invoiceItem({ receivedQty: null })],
    ...overrides,
  });
}

function detail(
  overrides: Partial<PurchaseInvoiceDetail> = {},
): PurchaseInvoiceDetail {
  // The detail shape is the list row WITHOUT `paymentCount` — it carries the
  // payments themselves instead, so the count would be a second source of truth.
  const row: Omit<PurchaseInvoiceListRow, "paymentCount"> & {
    paymentCount?: number;
  } = { ...listRow() };
  delete row.paymentCount;

  return {
    ...row,
    goodsReceiptNumber: "GR-260806-001",
    goodsReceiptStatus: "received",
    items: [invoiceItem()],
    createdByName: "Sari",
    payments: [],
    journalEntryId: null,
    ...overrides,
  };
}

function summary(
  overrides: Partial<SupplierOutstandingSummary> = {},
): SupplierOutstandingSummary {
  return {
    items: [],
    totalOutstanding: "166500.0000",
    totalInvoices: 1,
    totalOverdueOutstanding: "0.0000",
    totalOverdueInvoices: 0,
    totalDueSoonOutstanding: "0.0000",
    totalDueSoonInvoices: 0,
    horizonDays: 7,
    ...overrides,
  };
}

/**
 * `GET /purchase-invoices/summary` — the Ringkasan tab's three cards.
 *
 * A DIFFERENT SHAPE FROM `summary()` ABOVE, which is `/outstanding`: this one is
 * scoped by cabang, carries what was PAID inside a period beside the balances,
 * and counts the suppliers still owed anything.
 */
function payablesSummary(
  overrides: Partial<PayablesSummary> = {},
): PayablesSummary {
  return {
    asOf: "2026-09-15T03:00:00.000Z",
    period: {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-15T16:59:59.999Z",
      fromDate: "2026-09-01",
      toDate: "2026-09-15",
    },
    outstanding: {
      amount: "9500000.0000",
      invoiceCount: 12,
      supplierCount: 5,
    },
    overdue: { amount: "0.0000", invoiceCount: 0 },
    dueSoon: { amount: "0.0000", invoiceCount: 0, horizonDays: 7 },
    paid: { amount: "18700000.0000", paymentCount: 6, invoiceCount: 4 },
    invoiced: { amount: "26400000.0000", invoiceCount: 9 },
    ...overrides,
  };
}

function receiptDetail(): GoodsReceiptDetail {
  return {
    _id: RECEIPT_ID,
    receiptNumber: "GR-260806-001",
    status: "received",
    receivedAt: null,
    supplierId: "s1",
    supplierName: "PT Sumber Pangan",
    warehouseId: "wh1",
    warehouseName: "Gudang Utama",
    branchId: "b1",
    branchName: "Cabang Pusat",
    createdByName: "Sari",
    receiptDate: "2026-08-06T00:00:00.000Z",
    purchaseType: "beli_putus",
    origin: "manual",
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
        receivedQty: "10.0000",
        receivedSubtotal: "150000.0000",
        cancelledQty: "0.0000",
        outstandingQty: "0.0000",
        receiveStatus: "received",
        returnedQty: "0.0000",
        remainingQty: "10.0000",
      },
    ],
    total: "150000.0000",
    taxAmount: "16500.0000",
    grandTotal: "166500.0000",
    receivedTotal: "150000.0000",
    receivedTax: "16500.0000",
    events: [],
    closedAt: null,
    closedByName: null,
    invoiceId: INVOICE_ID,
    journalEntryId: "je1",
    notes: null,
    createdAt: "2026-08-06T09:14:00.000Z",
  };
}

function receiptRow(): GoodsReceiptListRow {
  return {
    _id: RECEIPT_ID,
    receiptNumber: "GR-260806-001",
    status: "received",
    supplierId: "s1",
    supplierName: "PT Sumber Pangan",
    warehouseId: "wh1",
    warehouseName: "Gudang Utama",
    branchId: "b1",
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
  };
}

const page = (items: PurchaseInvoiceListRow[], total = items.length) => ({
  items,
  pagination: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
});

/**
 * The three locations the cabang/gudang pair is exercised against: one pinned to
 * the branch under test, one pinned elsewhere, and the shared central warehouse
 * that belongs to no branch and serves them all. `never` because the option
 * lookups take the full service shapes and only these fields are read.
 */
const BRANCH_ID = "b1";
const WAREHOUSE = {
  _id: "wh1",
  name: "Gudang Utama",
  isActive: true,
  defaultBranchId: BRANCH_ID,
};
const OTHER_WAREHOUSE = {
  _id: "wh2",
  name: "Gudang Cabang Selatan",
  isActive: true,
  defaultBranchId: "b2",
};
const SHARED_WAREHOUSE = {
  _id: "wh0",
  name: "Gudang Pusat",
  isActive: true,
  defaultBranchId: null,
};

const optionPage = <T,>(items: T[]) =>
  ({
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  }) as never;

beforeEach(() => {
  /*
    The consignment "Setor" dialog still reads the tenant's pay-out channels —
    which account the money leaves from. One BCA account, which it pre-selects.
  */
  asMock(paymentChannelService.list).mockResolvedValue({
    items: [
      {
        _id: "chan-bca",
        type: "transfer",
        name: "BCA Operasional",
        accountId: "acc-bca",
        usableFor: ["in", "out"],
        isActive: true,
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  jest.clearAllMocks();

  /*
    The invoice's payment dialog is the shared Kas & Bank form (the same one a
    sales invoice uses): it lists the chart's KAS & BANK ACCOUNTS — where the
    money leaves from. One bank account, which the form pre-selects.
  */
  asMock(chartOfAccountsService.list).mockResolvedValue(
    optionPage([
      {
        _id: "acc-bca",
        code: "1102",
        name: "Bank BCA",
        accountType: "asset",
        accountCategory: "cash_bank",
        isActive: true,
      },
    ]),
  );

  asMock(consignmentSettlementService.outstanding).mockResolvedValue({
    items: [],
    totals: { sold: "0.0000", settled: "0.0000", outstanding: "0.0000" },
  });
  asMock(purchaseInvoiceService.list).mockResolvedValue(page([]));
  asMock(purchaseInvoiceService.outstandingSummary).mockResolvedValue(
    summary({ totalOutstanding: "0.0000", totalInvoices: 0 }),
  );
  asMock(purchaseInvoiceService.summary).mockResolvedValue(
    payablesSummary({
      outstanding: { amount: "0.0000", invoiceCount: 0, supplierCount: 0 },
      paid: { amount: "0.0000", paymentCount: 0, invoiceCount: 0 },
    }),
  );
  asMock(purchaseInvoiceService.getById).mockResolvedValue(detail());
  asMock(goodsReceiptService.getById).mockResolvedValue(receiptDetail());
  asMock(goodsReceiptService.pendingCount).mockResolvedValue({ count: 3 });
  asMock(goodsReceiptService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  });
  asMock(supplierService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  });
  asMock(branchService.list).mockResolvedValue(
    optionPage([{ _id: BRANCH_ID, name: "Cabang Pusat", isActive: true }]),
  );
  asMock(warehouseService.list).mockResolvedValue(
    optionPage([WAREHOUSE, OTHER_WAREHOUSE, SHARED_WAREHOUSE]),
  );
});

/* ------------------------------------------------------------------- list */

describe("PayablesScreen", () => {
  it("opens on the outstanding view, asked of the server", async () => {
    // NOT "all". A payables screen is opened to answer "what do we owe" —
    // settled bills are history, and leading with them buries the rows that
    // need money.
    renderWithAuth(<PayablesScreen />);

    await waitFor(() => expect(purchaseInvoiceService.list).toHaveBeenCalled());

    const [query] = asMock(purchaseInvoiceService.list).mock.calls[0];
    expect(query).toMatchObject({ outstanding: true });
    expect(query).not.toHaveProperty("status");
  });

  it("renders the server's outstanding amount, not its own subtraction", async () => {
    asMock(purchaseInvoiceService.list).mockResolvedValue(
      page([
        listRow({
          total: "166500.0000",
          paidAmount: "66500.0000",
          // Deliberately NOT total - paid. If the screen recomputed, this is the
          // number that would not appear.
          outstandingAmount: "12345.0000",
          status: "partial",
        }),
      ]),
    );

    renderWithAuth(<PayablesScreen />);

    expect(await screen.findByText("Rp 12.345")).toBeInTheDocument();
  });

  /**
   * The whole book, from `/outstanding` — not a sum of the page. A total that
   * grew as the user paged would be worse than none, because it looks
   * authoritative. Lands on the "Utang belum lunas" card now (1 October 2026),
   * not a headline figure in the header.
   */
  it("takes the Utang belum lunas card from the summary endpoint", async () => {
    asMock(purchaseInvoiceService.outstandingSummary).mockResolvedValue(
      summary({ totalOutstanding: "9500000.0000", totalInvoices: 12 }),
    );
    asMock(purchaseInvoiceService.list).mockResolvedValue(page([listRow()]));

    renderWithAuth(<PayablesScreen />);

    expect(await screen.findByText("Rp 9.500.000")).toBeInTheDocument();
    expect(screen.getByText("12 faktur")).toBeInTheDocument();
  });

  /**
   * THE GAP THIS FEATURE CLOSED. The count was always available through
   * `pagination.total`; the rupiah figure was not, and could only have been had
   * by paging the entire overdue book. Both now come from one aggregation.
   */
  it("states both halves of the overdue banner", async () => {
    asMock(purchaseInvoiceService.outstandingSummary).mockResolvedValue(
      summary({
        totalOutstanding: "9500000.0000",
        totalInvoices: 12,
        totalOverdueInvoices: 3,
        totalOverdueOutstanding: "2750000.0000",
      }),
    );

    renderWithAuth(<PayablesScreen />);

    expect(
      await screen.findByText("3 faktur sudah lewat jatuh tempo"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Rp 2\.750\.000/)).toBeInTheDocument();
  });

  it("hides the overdue banner when nothing is late", async () => {
    renderWithAuth(<PayablesScreen />);

    await waitFor(() => expect(purchaseInvoiceService.list).toHaveBeenCalled());

    expect(
      screen.queryByText(/sudah lewat jatuh tempo/),
    ).not.toBeInTheDocument();
  });

  /**
   * Triage and planning are different questions, and the answer to the first
   * changes who gets called this morning. Both go over the wire — see the file
   * header.
   */
  it("sends overdue as a filter rather than filtering the page", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PayablesScreen />);

    await waitFor(() => expect(purchaseInvoiceService.list).toHaveBeenCalled());

    const panel = await openFilters(user);
    await user.click(within(panel).getByLabelText("Filter status"));
    await user.click(await screen.findByRole("option", { name: "Jatuh tempo" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => {
      const calls = asMock(purchaseInvoiceService.list).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({ overdue: true });
    });
  });

  /**
   * The lens narrows; the ordering arranges. "Overdue, latest deadline first"
   * is an ordinary question, so the two controls must compose rather than one
   * reaching into the other.
   */
  it("orders by deadline without disturbing the view", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PayablesScreen />);

    await waitFor(() => expect(purchaseInvoiceService.list).toHaveBeenCalled());

    const panel = await openFilters(user);
    await user.click(within(panel).getByLabelText("Filter status"));
    await user.click(await screen.findByRole("option", { name: "Jatuh tempo" }));
    await user.click(within(panel).getByLabelText("Urutkan"));
    await user.click(
      await screen.findByRole("option", { name: "Jatuh tempo terdekat" }),
    );
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => {
      const calls = asMock(purchaseInvoiceService.list).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({
        overdue: true,
        sort: "dueSoonest",
      });
    });
  });

  /**
   * THE LENS IS IN THE PANEL NOW (2 October 2026, on request), so Reset reaches
   * it exactly as it reaches every other field — back to "Belum lunas", the
   * screen's own default, not left wherever it was set.
   */
  it("resets the view along with everything else", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PayablesScreen />);

    await waitFor(() => expect(purchaseInvoiceService.list).toHaveBeenCalled());

    const panel = await openFilters(user);
    await user.click(within(panel).getByLabelText("Filter status"));
    await user.click(await screen.findByRole("option", { name: "Lunas" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => {
      const calls = asMock(purchaseInvoiceService.list).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({ status: "paid" });
    });

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("button", { name: "Reset" }));

    await waitFor(() => {
      const calls = asMock(purchaseInvoiceService.list).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({ outstanding: true });
    });
  });

  /**
   * THE ORDERING IS NEVER COUNTED — every list has one, so it is never "on".
   * THE VIEW IS COUNTED NOW (2 October 2026), unlike when it stood outside the
   * panel as a pill row: it is one more field the button conceals, same as
   * Supplier or Cabang.
   */
  it("counts the view but not the ordering in the filter badge", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PayablesScreen />);

    await waitFor(() => expect(purchaseInvoiceService.list).toHaveBeenCalled());

    const panel = await openFilters(user);
    await user.click(within(panel).getByLabelText("Urutkan"));
    await user.click(await screen.findByRole("option", { name: "Terlama" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => {
      const calls = asMock(purchaseInvoiceService.list).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({ sort: "oldest" });
    });
    expect(screen.getByRole("button", { name: "Filter" })).not.toHaveTextContent(
      "(",
    );

    const second = await openFilters(user);
    await user.click(within(second).getByLabelText("Filter status"));
    await user.click(await screen.findByRole("option", { name: "Jatuh tempo" }));
    await user.click(within(second).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => {
      const calls = asMock(purchaseInvoiceService.list).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({ overdue: true });
    });
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
  });

  /**
   * The payment run — and the one view a client could not have assembled for
   * itself. Its window has a NEAR end as well as a far one ("due this week and
   * not already late"), which no filter on this screen expresses: `Tanggal
   * faktur` bounds when the vendor issued the bill, never when it comes due.
   */
  it("sends dueSoon as a filter, with no window of its own", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PayablesScreen />);

    await waitFor(() => expect(purchaseInvoiceService.list).toHaveBeenCalled());

    const panel = await openFilters(user);
    await user.click(within(panel).getByLabelText("Filter status"));
    await user.click(await screen.findByRole("option", { name: "Minggu ini" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => {
      const calls = asMock(purchaseInvoiceService.list).mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last).toMatchObject({ dueSoon: true });
      // The horizon lives on the server; a client stating one here could state
      // it differently from the summary whose figures sit above this list.
      expect(last).not.toHaveProperty("dueBefore");
      expect(last).not.toHaveProperty("overdue");
    });
  });

  it("states the due-soon card with the server's own window", async () => {
    asMock(purchaseInvoiceService.outstandingSummary).mockResolvedValue(
      summary({
        totalDueSoonInvoices: 4,
        totalDueSoonOutstanding: "1250000.0000",
        horizonDays: 14,
      }),
    );

    renderWithAuth(<PayablesScreen />);

    expect(
      await screen.findByText("Jatuh tempo ≤ 14 hari"),
    ).toBeInTheDocument();
    expect(screen.getByText("4 faktur")).toBeInTheDocument();
    expect(screen.getByText(/Rp 1\.250\.000/)).toBeInTheDocument();
  });

  // The due-soon card is the one stat tile here with a way to act on it — it is
  // a view of the list underneath, asked of the server with the same
  // definition.
  it("switches the list to the due-soon bucket from the card", async () => {
    const user = userEvent.setup();
    asMock(purchaseInvoiceService.outstandingSummary).mockResolvedValue(
      summary({
        totalDueSoonInvoices: 4,
        totalDueSoonOutstanding: "1250000.0000",
      }),
    );

    renderWithAuth(<PayablesScreen />);

    // The card's own label carries "≤", which the toolbar's plain "Jatuh
    // tempo" pill does not — disambiguating the two without depending on
    // DOM order.
    await user.click(
      await screen.findByRole("button", { name: /Jatuh tempo ≤/ }),
    );

    await waitFor(() => {
      const calls = asMock(purchaseInvoiceService.list).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({ dueSoon: true });
    });
    // No longer a button once the list already shows it — a control that leads
    // nowhere new is noise.
    expect(
      screen.queryByRole("button", { name: /Jatuh tempo ≤/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a plain due-soon card when nothing falls due", async () => {
    renderWithAuth(<PayablesScreen />);

    await waitFor(() => expect(purchaseInvoiceService.list).toHaveBeenCalled());

    // Still on the page — this is a card now, not a conditional banner — but
    // not a button, since there is nothing behind it to switch the list to.
    expect(
      screen.queryByRole("button", { name: /Jatuh tempo ≤/ }),
    ).not.toBeInTheDocument();
  });

  it("sends an exact status for the status views", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PayablesScreen />);

    await waitFor(() => expect(purchaseInvoiceService.list).toHaveBeenCalled());

    const panel = await openFilters(user);
    await user.click(within(panel).getByLabelText("Filter status"));
    await user.click(await screen.findByRole("option", { name: "Lunas" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => {
      const calls = asMock(purchaseInvoiceService.list).mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last).toMatchObject({ status: "paid" });
      // The shorthands must not ride along: the server takes the explicit
      // status and silently drops them, so sending both hides the disagreement.
      expect(last).not.toHaveProperty("outstanding");
      expect(last).not.toHaveProperty("overdue");
      expect(last).not.toHaveProperty("dueSoon");
    });
  });

  it("marks a late row and says how late", async () => {
    const dueDate = new Date(Date.now() - 10 * 86_400_000).toISOString();
    asMock(purchaseInvoiceService.list).mockResolvedValue(
      page([listRow({ dueDate, isOverdue: true })]),
    );

    renderWithAuth(<PayablesScreen />);

    expect(await screen.findByText(/telat 10 hari/)).toBeInTheDocument();
  });

  /**
   * WHOSE BOOKS the bill posts to, and WHERE the goods landed. Two columns
   * rather than one: a branch may receive at its own warehouse AND at the shared
   * central one, so neither answer stands in for the other.
   */
  it("names the branch and the warehouse on every row", async () => {
    asMock(purchaseInvoiceService.list).mockResolvedValue(
      page([
        listRow({ branchName: "Cabang Timur", warehouseName: "Gudang Timur" }),
      ]),
    );

    renderWithAuth(<PayablesScreen />);

    expect(await screen.findByText("Cabang Timur")).toBeInTheDocument();
    expect(screen.getByText("Gudang Timur")).toBeInTheDocument();
  });

  // A label may be null — a branch hard-deleted since, or a delivery that can no
  // longer be read. The row still renders; only the label is gone.
  it("dashes an unnameable branch or warehouse rather than blanking", async () => {
    asMock(purchaseInvoiceService.list).mockResolvedValue(
      page([
        listRow({
          branchName: null,
          warehouseId: null,
          warehouseName: null,
        }),
      ]),
    );

    renderWithAuth(<PayablesScreen />);

    // Waited for the row itself: the headline total also renders "—" until the
    // summary lands, so counting dashes before the table exists counts that one.
    await screen.findByRole("link", { name: "INV/2026/VIII/0142" });

    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  /**
   * CABANG AND GUDANG ARE A PAIR, and they behave here exactly as they do on the
   * receipts filter — same helpers, same two rules. A bill and the delivery it
   * bills are read one after the other by the same person, so two screens that
   * scope by the same two fields in two different ways is a thing users relearn.
   */
  describe("the branch and warehouse filters", () => {
    it("sends the branch it was left on", async () => {
      const user = userEvent.setup();
      renderWithAuth(<PayablesScreen />);

      const panel = await openFilters(user);

      await user.click(within(panel).getByLabelText("Filter cabang"));
      await user.click(
        await screen.findByRole("option", { name: "Cabang Pusat" }),
      );
      await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

      await waitFor(() =>
        expect(purchaseInvoiceService.list).toHaveBeenLastCalledWith(
          expect.objectContaining({ branchId: BRANCH_ID }),
        ),
      );
    });

    /**
     * A warehouse pinned to one branch ANSWERS the branch question, so the field
     * above fills itself in — "bills for goods into Gudang Utama" and "…under
     * any branch" are the same set.
     */
    it("fills in the branch when a warehouse that names one is chosen", async () => {
      const user = userEvent.setup();
      renderWithAuth(<PayablesScreen />);

      const panel = await openFilters(user);

      await user.click(within(panel).getByLabelText("Filter gudang"));
      await user.click(
        await screen.findByRole("option", { name: "Gudang Utama" }),
      );
      await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

      await waitFor(() =>
        expect(purchaseInvoiceService.list).toHaveBeenLastCalledWith(
          expect.objectContaining({
            warehouseId: WAREHOUSE._id,
            branchId: BRANCH_ID,
          }),
        ),
      );
    });

    /**
     * A warehouse pinned to ANOTHER branch is not offered: that pair matches no
     * bill, so offering it could only produce an empty list nobody could
     * explain. The shared central warehouse stays — it serves every branch.
     */
    it("offers only the warehouses the chosen branch could have been billed for", async () => {
      const user = userEvent.setup();
      renderWithAuth(<PayablesScreen />);

      const panel = await openFilters(user);

      await user.click(within(panel).getByLabelText("Filter cabang"));
      await user.click(
        await screen.findByRole("option", { name: "Cabang Pusat" }),
      );

      await user.click(within(panel).getByLabelText("Filter gudang"));

      expect(
        await screen.findByRole("option", { name: "Gudang Utama" }),
      ).toBeInTheDocument();
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
      renderWithAuth(<PayablesScreen />);

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

    // Reset clears what the PANEL holds and re-queries at once; the view lens
    // outside it is not the button's business.
    it("clears both on Reset without disturbing the view", async () => {
      const user = userEvent.setup();
      renderWithAuth(<PayablesScreen />);

      let panel = await openFilters(user);
      await user.click(within(panel).getByLabelText("Filter gudang"));
      await user.click(
        await screen.findByRole("option", { name: "Gudang Utama" }),
      );
      await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

      panel = await openFilters(user);
      await user.click(within(panel).getByRole("button", { name: "Reset" }));

      await waitFor(() =>
        expect(purchaseInvoiceService.list).toHaveBeenLastCalledWith(
          expect.objectContaining({
            branchId: undefined,
            warehouseId: undefined,
            outstanding: true,
          }),
        ),
      );
    });
  });

  it("surfaces a load failure without blanking the screen", async () => {
    asMock(purchaseInvoiceService.list).mockRejectedValue(
      new ApiError("Server error", 500),
    );

    renderWithAuth(<PayablesScreen />);

    expect(await screen.findByText("Server error")).toBeInTheDocument();
  });

  it("offers filing a bill only to a role that may create one", async () => {
    renderWithAuth(<PayablesScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "purchaseInvoices", actions: ["read"] }],
    });

    await waitFor(() => expect(purchaseInvoiceService.list).toHaveBeenCalled());

    expect(screen.queryByText("Catat faktur supplier")).not.toBeInTheDocument();
  });
});

/* ----------------------------------------------------------------- detail */

/**
 * "Catat pembayaran" is a button now — the same dialog a sales invoice opens
 * (15 October 2026) — so every payment test starts by opening it.
 */
async function openPaymentDialog(user: UserEvent) {
  await user.click(
    await screen.findByRole("button", { name: /Catat pembayaran/ }),
  );
  return within(await screen.findByRole("dialog"));
}

const toast = swalToast as jest.MockedFunction<typeof swalToast>;

describe("InvoiceDetail", () => {
  // "Biaya lain" split by where it went (16 October 2026, BO).
  it("puts goods charges before PPN and expense charges after it", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({
        grossSubtotal: "150000.0000",
        itemDiscount: "0.0000",
        subtotal: "160000.0000",
        taxAmount: "16500.0000",
        expenseCharges: "20000.0000",
        total: "196500.0000",
        otherCharges: [
          { label: "Kemasan", amount: "10000.0000", allocation: "goods" },
          {
            label: "Ongkir",
            amount: "20000.0000",
            allocation: "expense",
            accountId: "acc-ongkir",
            accountCode: "6107",
            accountName: "Beban Ongkos Kirim",
          },
        ],
      }),
    );
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    const expense = await screen.findByText(
      "Ongkir · beban 6107 Beban Ongkos Kirim",
    );
    const goods = screen.getByText("Kemasan");
    const beforeTax = screen.getByText("Total sebelum PPN");
    const tax = screen.getByText("PPN masukan");
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(goods, beforeTax)).toBe(true);
    expect(follows(tax, expense)).toBe(true);
    expect(beforeTax.nextSibling).toHaveTextContent("Rp 160.000");
    expect(expense.nextSibling).toHaveTextContent("Rp 20.000");
    expect(
      screen.getByText("Total tagihan", { selector: "dt" }).nextSibling,
    ).toHaveTextContent("Rp 196.500");
  });

  // Progress is followed on the invoice, per line (16 October 2026, BO).
  it("shows each line's received qty, what is left, and where it stands", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({
        goodsReceiptId: "gr1",
        items: [
          invoiceItem({
            receivedQty: "6.0000",
            remainingQty: "4.0000",
            receiveStatus: "partial",
          }),
        ],
      }),
    );
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByRole("columnheader", { name: "Sisa qty" }),
    ).toBeInTheDocument();
    const row = screen.getByText("diterima sebagian").closest("tr") as HTMLElement;
    expect(within(row).getByText("6")).toBeInTheDocument();
    expect(within(row).getByText("4")).toBeInTheDocument();
  });

  // ONE INVOICE, MANY RECEIPTS: each delivery day listed, and the next one
  // offered while something is still to come.
  it("lists every receipt of the invoice and offers another while goods are still to come", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({
        goodsReceiptId: "gr1",
        goodsReceipts: [
          { _id: "gr1", receiptNumber: "GR-260806-001", receiptDate: "2026-08-06T00:00:00.000Z", status: "received" },
          { _id: "gr2", receiptNumber: "GR-260810-003", receiptDate: "2026-08-10T00:00:00.000Z", status: "received" },
        ],
        items: [invoiceItem({ receivedQty: "6.0000", remainingQty: "4.0000" })],
      }),
    );
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText(/Sebagian barang belum diterima/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GR-260806-001/ })).toHaveAttribute(
      "href",
      "/dashboard/purchasing/receipts/gr1",
    );
    expect(screen.getByRole("link", { name: /GR-260810-003/ })).toHaveAttribute(
      "href",
      "/dashboard/purchasing/receipts/gr2",
    );
    expect(
      screen.getByRole("button", { name: "Buat penerimaan barang" }),
    ).toBeInTheDocument();
  });

  it("shows the balance and the payment form for an unpaid bill", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    // The number is the page's title, as on a sales invoice.
    expect(
      await screen.findByRole("heading", { name: "INV/2026/VIII/0142" }),
    ).toBeInTheDocument();
    // Closed until asked for — the page shows the button, not the form.
    expect(screen.queryByLabelText("Jumlah dibayar")).not.toBeInTheDocument();

    const dialog = await openPaymentDialog(user);

    expect(dialog.getByText("Bisa dibayar sekarang")).toBeInTheDocument();
    expect(
      dialog.getByText(
        "INV/2026/VIII/0142 · PT Sumber Pangan · sisa tagihan Rp 166.500",
      ),
    ).toBeInTheDocument();
    // Money going OUT: the labels say so.
    expect(dialog.getByLabelText("Jumlah dibayar")).toBeInTheDocument();
    expect(dialog.getByLabelText("Tanggal bayar")).toBeInTheDocument();
    expect(dialog.getByLabelText("No. referensi")).toBeInTheDocument();
    expect(dialog.queryByLabelText("Metode")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(chartOfAccountsService.list).toHaveBeenCalledWith({
        accountCategory: "cash_bank",
        isActive: true,
        limit: 100,
      }),
    );
    expect(paymentChannelService.list).not.toHaveBeenCalled();
  });

  it("closes the dialog on Batal without sending anything", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    const dialog = await openPaymentDialog(user);

    await user.click(dialog.getByRole("button", { name: "Batal" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(purchaseInvoiceService.recordPayment).not.toHaveBeenCalled();
  });

  it("sends the payment and renders the invoice the write returned", async () => {
    asMock(purchaseInvoiceService.recordPayment).mockResolvedValue(
      detail({
        paidAmount: "66500.0000",
        outstandingAmount: "100000.0000",
        status: "partial",
        payments: [
          {
            paymentId: "pay1",
            at: "2026-08-20T00:00:00.000Z",
            amount: "66500.0000",
            method: null,
            cashAccountName: "Bank BCA",
            ref: "TRF/998877",
            byUserId: "u1",
            byUserName: "Sari",
            journalEntryId: "je9",
          },
        ],
      }),
    );

    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    const dialog = await openPaymentDialog(user);

    await user.type(dialog.getByLabelText("Jumlah dibayar"), "66500");
    await user.type(dialog.getByLabelText("No. referensi"), " TRF/998877 ");
    await user.click(dialog.getByRole("button", { name: "Simpan pembayaran" }));

    // UT-1, the shared-form way: the Kas & Bank ACCOUNT the money left from,
    // not a method or a channel — neither is sent any more.
    await waitFor(() =>
      expect(purchaseInvoiceService.recordPayment).toHaveBeenCalledWith(
        INVOICE_ID,
        {
          amount: "66500",
          accountId: "acc-bca",
          at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          ref: "TRF/998877",
        },
      ),
    );

    expect(toast).toHaveBeenCalledWith("Pembayaran Rp 66.500 tercatat.");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // The response IS the new state — no refetch, and the balance updates from
    // the document the write produced.
    expect(await screen.findByText("Rp 100.000")).toBeInTheDocument();
    expect(purchaseInvoiceService.getById).toHaveBeenCalledTimes(1);
  });

  /**
   * The client bound is a courtesy, not the authority — but it must exist, or a
   * fat-fingered extra zero costs a round trip to discover.
   */
  it("refuses locally to pay more than is outstanding", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    const dialog = await openPaymentDialog(user);

    await user.type(dialog.getByLabelText("Jumlah dibayar"), "999999999");
    await user.click(dialog.getByRole("button", { name: "Simpan pembayaran" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        "Jumlah melebihi sisa tagihan Rp 166.500.",
        "error",
      ),
    );
    expect(purchaseInvoiceService.recordPayment).not.toHaveBeenCalled();
    // A refusal keeps the dialog — and what was typed — open for a fix.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("fills the payable amount when Lunasi is pressed", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    const dialog = await openPaymentDialog(user);

    await user.click(dialog.getByRole("button", { name: "Lunasi" }));
    expect(dialog.getByLabelText("Jumlah dibayar")).toHaveValue("166500");

    await user.click(dialog.getByRole("button", { name: "50%" }));
    expect(dialog.getByLabelText("Jumlah dibayar")).toHaveValue("83250");
  });

  /**
   * `POST /:id/payments` IS NOT IDEMPOTENT — there is no key to send — so a
   * double-click records the cash leaving twice on two irreversible entries.
   */
  it("locks the submit for the whole flight", async () => {
    let release: (value: PurchaseInvoiceDetail) => void = () => {};
    asMock(purchaseInvoiceService.recordPayment).mockReturnValue(
      new Promise<PurchaseInvoiceDetail>((resolve) => {
        release = resolve;
      }),
    );

    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    const dialog = await openPaymentDialog(user);

    await user.type(dialog.getByLabelText("Jumlah dibayar"), "1000");

    const submit = dialog.getByRole("button", { name: "Simpan pembayaran" });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    expect(dialog.getByRole("button", { name: "Batal" })).toBeDisabled();
    expect(dialog.getByLabelText("Jumlah dibayar")).toBeDisabled();

    await user.click(submit);
    expect(purchaseInvoiceService.recordPayment).toHaveBeenCalledTimes(1);

    release(detail());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the backend's refusal verbatim", async () => {
    asMock(purchaseInvoiceService.recordPayment).mockRejectedValue(
      new ApiError("Invoice INV/2026/VIII/0142 is already settled", 409, {
        reason: "There is nothing left outstanding to pay",
      }),
    );

    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    const dialog = await openPaymentDialog(user);

    await user.type(dialog.getByLabelText("Jumlah dibayar"), "1000");
    await user.click(dialog.getByRole("button", { name: "Simpan pembayaran" }));

    // `fullMessage` — the message plus the reason, which is the half that says
    // what to do next — held for 8 seconds so it can be read to the end.
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringMatching(/nothing left outstanding to pay/),
        "error",
        8000,
      ),
    );
    // Still open, and released for another try.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      dialog.getByRole("button", { name: "Simpan pembayaran" }),
    ).toBeEnabled();
  });

  it("replaces the form with a settled note once the bill is paid", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({
        paidAmount: "166500.0000",
        outstandingAmount: "0.0000",
        status: "paid",
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("Faktur ini sudah lunas.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Catat pembayaran/ }),
    ).not.toBeInTheDocument();
  });

  /**
   * The separation of duties the backend enforces, made visible rather than
   * discovered through a 403: filing a bill is data entry, paying one moves cash.
   */
  it("withholds the payment form from a role without pay", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "purchaseInvoices", actions: ["create", "read"] },
      ],
    });

    expect(
      await screen.findByRole("heading", { name: "INV/2026/VIII/0142" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Catat pembayaran/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/tidak punya izin mencatat pembayaran/)).
      toBeInTheDocument();
  });

  it("offers a way back rather than a retry for an unknown id", async () => {
    asMock(purchaseInvoiceService.getById).mockRejectedValue(
      new ApiError("Purchase invoice not found", 404),
    );

    renderWithAuth(<InvoiceDetail invoiceId="missing" />);

    expect(
      await screen.findByText("Faktur tidak ditemukan."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Coba lagi" })).
      not.toBeInTheDocument();
  });

  /**
   * THE LINES ARE THE INVOICE'S OWN now — copied onto it when it was filed —
   * so the screen no longer reads the delivery to draw them, and a delivery
   * that cannot be read cannot blank them.
   */
  it("draws its own lines without reading the delivery", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("Shampoo Anjing")).toBeInTheDocument();
    expect(screen.getByText("SHAMPOO")).toBeInTheDocument();
    // The sales invoice's "Rincian faktur" card: header fields, the lines,
    // then the recap.
    expect(screen.getByText("Rincian faktur")).toBeInTheDocument();
    expect(screen.getByText("Tanggal faktur")).toBeInTheDocument();
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getAllByText("Total tagihan").length).toBeGreaterThan(0);
    expect(goodsReceiptService.getById).not.toHaveBeenCalled();
  });

  it("shows how much has arrived beside how much is paid", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({
        goodsReceiptStatus: "partial",
        receivedAmount: "66600.0000",
        payableAmount: "66600.0000",
        items: [invoiceItem({ receivedQty: "4.0000" })],
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    // The shared "Status pembayaran" card — the sales invoice's — with the
    // one line a supplier bill adds: how far its goods have arrived.
    expect(await screen.findByText("Status pembayaran")).toBeInTheDocument();
    // In the status card and in the Rincian recap alike.
    expect(screen.getAllByText("Total tagihan")).toHaveLength(2);
    expect(screen.getByText("Terbayar")).toBeInTheDocument();
    expect(screen.getByText("Sisa")).toBeInTheDocument();
    expect(screen.getByText(/0% terbayar · jatuh tempo/)).toBeInTheDocument();
    const arrived = screen.getByText(/Barang diterima/);
    expect(arrived).toHaveTextContent("Rp 66.600 dari Rp 166.500");
    expect(arrived).toHaveTextContent("bisa dibayar sekarang Rp 66.600");
    expect(screen.getByText("diterima sebagian")).toBeInTheDocument();
  });

  it("caps the payment at what has arrived, not at the whole bill", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({
        goodsReceiptStatus: "partial",
        receivedAmount: "66600.0000",
        payableAmount: "66600.0000",
      }),
    );
    const user = userEvent.setup();

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    const dialog = await openPaymentDialog(user);

    // The panel and the ceiling are what has ARRIVED, not the whole bill.
    expect(dialog.getByText("Maksimal Rp 66.600")).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Lunasi" }));
    expect(dialog.getByLabelText("Jumlah dibayar")).toHaveValue("66600");

    await user.clear(dialog.getByLabelText("Jumlah dibayar"));
    await user.type(dialog.getByLabelText("Jumlah dibayar"), "100000");
    await user.click(dialog.getByRole("button", { name: "Simpan pembayaran" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringMatching(/melebihi nilai barang yang sudah diterima/),
        "error",
      ),
    );
    expect(purchaseInvoiceService.recordPayment).not.toHaveBeenCalled();
  });

  it("hides the payment form while nothing is payable", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({
        goodsReceiptStatus: "partial",
        paidAmount: "66600.0000",
        outstandingAmount: "99900.0000",
        status: "partial",
        receivedAmount: "66600.0000",
        payableAmount: "0.0000",
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByText(/Belum ada yang bisa dibayar/),
    ).toHaveTextContent(/sudah dibayar semua/);
    expect(
      screen.queryByRole("button", { name: /Catat pembayaran/ }),
    ).not.toBeInTheDocument();
  });

  it("names the branch and the warehouse the bill belongs to", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({ branchName: "Cabang Timur", warehouseName: "Gudang Timur" }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("Cabang")).toBeInTheDocument();
    expect(screen.getByText("Cabang Timur")).toBeInTheDocument();
    expect(screen.getByText("Gudang")).toBeInTheDocument();
    expect(screen.getByText("Gudang Timur")).toBeInTheDocument();
  });

  it("lists each payment in the Riwayat pembayaran card", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({
        paidAmount: "66500.0000",
        outstandingAmount: "100000.0000",
        status: "partial",
        payments: [
          {
            paymentId: "pay1",
            at: "2026-08-20T00:00:00.000Z",
            amount: "66500.0000",
            method: "transfer",
            ref: "TRF/998877",
            byUserId: "u1",
            byUserName: "Sari",
            journalEntryId: "je9",
          },
        ],
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    // The shared timeline, the sales invoice's: amount, date and how it moved.
    // The journal entry is on the payment's own Transaksi Keuangan page.
    expect(await screen.findByText("Riwayat pembayaran")).toBeInTheDocument();
    expect(screen.getByText(/20 Agu 2026/).closest("li")).toHaveTextContent(
      "Transfer",
    );
  });
});

describe("Riwayat pembayaran — each payment is a cash transaction", () => {
  const payment = {
    paymentId: "pay1",
    paymentNumber: "BBK/CBS/2608/0007",
    at: "2026-08-20T00:00:00.000Z",
    amount: "66500.0000",
    method: "transfer" as const,
    ref: "TRF/998877",
    byUserId: "u1",
    byUserName: "Sari",
    journalEntryId: "je9",
    isVoided: false,
    voidedAt: null,
  };

  it("shows its number and opens it in Transaksi Keuangan", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({
        paidAmount: "66500.0000",
        outstandingAmount: "100000.0000",
        status: "partial",
        payments: [payment],
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("BBK/CBS/2608/0007")).toBeInTheDocument();
    // The whole row opens the payment's own page, as on a sales invoice.
    expect(
      screen.getByRole("link", { name: /BBK\/CBS\/2608\/0007/ }),
    ).toHaveAttribute(
      "href",
      `/dashboard/purchasing/payables/${INVOICE_ID}/payments/pay1`,
    );
  });

  it("marks a cancelled payment and strikes its amount through", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({
        payments: [
          { ...payment, isVoided: true, voidedAt: "2026-08-21T00:00:00.000Z" },
        ],
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("dibatalkan")).toBeInTheDocument();
    expect(
      screen
        .getAllByText("Rp 66.500")
        .some((node) => node.classList.contains("line-through")),
    ).toBe(true);
  });

  /*
    Recorded through the shared Kas & Bank form there is NO method — the
    payment names the account the money left from, and that is what the badge
    says, so a reconciler can tell which rekening paid.
  */
  it("names the Kas & Bank account when the payment has no method", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({
        payments: [
          { ...payment, method: null, cashAccountName: "Bank BCA" },
          {
            ...payment,
            paymentId: "pay2",
            paymentNumber: "BBK/CBS/2608/0008",
            method: null,
            cashAccountName: null,
          },
        ],
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText(/· Bank BCA/)).toBeInTheDocument();
    // An account that cannot be named still says where it came from in general.
    expect(screen.getByText(/· Kas & Bank/)).toBeInTheDocument();
    expect(screen.queryByText(/· Transfer/)).not.toBeInTheDocument();
  });

  it("keeps the method label on an older channel payment", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({ payments: [{ ...payment, cashAccountName: "Bank BCA" }] }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText(/· Transfer/)).toBeInTheDocument();
    expect(screen.queryByText(/· Bank BCA/)).not.toBeInTheDocument();
  });

  it("links the payment page for a role that cannot read cash transactions", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({ payments: [payment] }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "purchaseInvoices", actions: ["read", "pay"] }],
    });

    expect(await screen.findByText("BBK/CBS/2608/0007")).toBeInTheDocument();
    // The payment page needs only purchaseInvoices:read; what it offers is
    // gated there.
    expect(
      screen.getByRole("link", { name: /BBK\/CBS\/2608\/0007/ }),
    ).toBeInTheDocument();
  });
});

/* ----------------------------------------------- one payment, its own page */

describe("PurchasePaymentDetail — the sales payment page, for a supplier", () => {
  const payment = {
    paymentId: "pay1",
    paymentNumber: "BBK/CBS/2608/0007",
    at: "2026-08-20T00:00:00.000Z",
    amount: "66500.0000",
    method: null,
    cashAccountName: "Bank BCA",
    ref: "TRF/998877",
    byUserId: "u1",
    byUserName: "Sari",
    journalEntryId: "je9",
    journalEntryNumber: "JU/2608/0012",
    isVoided: false,
    voidedAt: null,
  };

  it("lays out the payment and where the bill stands now", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({
        paidAmount: "66500.0000",
        outstandingAmount: "100000.0000",
        status: "partial",
        payments: [payment],
      }),
    );

    renderWithAuth(
      <PurchasePaymentDetail invoiceId={INVOICE_ID} paymentId="pay1" />,
    );

    expect(
      await screen.findByRole("heading", { name: "BBK/CBS/2608/0007" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Rincian pembayaran")).toBeInTheDocument();
    expect(screen.getByText("Keluar dari").nextSibling).toHaveTextContent(
      "Bank BCA",
    );
    expect(screen.getByText("JU/2608/0012")).toBeInTheDocument();
    expect(screen.getByText("TRF/998877")).toBeInTheDocument();
    expect(screen.getByText("Faktur ini sekarang")).toBeInTheDocument();
    expect(screen.getByText("aktif")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ubah pembayaran/ }),
    ).toBeInTheDocument();
    // A supplier issues the receipt, not the shop.
    expect(
      screen.queryByRole("button", { name: /Kwitansi/ }),
    ).not.toBeInTheDocument();
  });

  it("reads the cash transaction when Batalkan is pressed", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({ payments: [payment] }),
    );
    asMock(cashTransactionService.getById).mockResolvedValue({
      _id: "pay1",
      number: "BBK/CBS/2608/0007",
      amount: "66500.0000",
      status: "posted",
    } as never);
    const user = userEvent.setup();

    renderWithAuth(
      <PurchasePaymentDetail invoiceId={INVOICE_ID} paymentId="pay1" />,
    );

    await user.click(
      await screen.findByRole("button", { name: /Batalkan pembayaran/ }),
    );

    await waitFor(() =>
      expect(cashTransactionService.getById).toHaveBeenCalledWith("pay1"),
    );
  });

  it("shows a cancelled payment with its reason and no actions", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({
        payments: [
          {
            ...payment,
            isVoided: true,
            voidedAt: "2026-08-21T00:00:00.000Z",
            voidReason: "salah nominal",
          },
        ],
      }),
    );

    renderWithAuth(
      <PurchasePaymentDetail invoiceId={INVOICE_ID} paymentId="pay1" />,
    );

    expect(await screen.findByText("Alasan: salah nominal")).toBeInTheDocument();
    expect(screen.getByText("dibatalkan")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Batalkan pembayaran/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Ubah pembayaran/ }),
    ).not.toBeInTheDocument();
  });

  it("says so when the payment is not on this invoice", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(
      detail({ payments: [] }),
    );

    renderWithAuth(
      <PurchasePaymentDetail invoiceId={INVOICE_ID} paymentId="nope" />,
    );

    expect(
      await screen.findByText(/Pembayaran ini tidak ada di faktur/),
    ).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------ file a bill */

/**
 * CATAT FAKTUR SUPPLIER — ONE FORM (16 October 2026, BO). Picking the supplier
 * looks up its deliveries still waiting for a bill; when there are any, a modal
 * offers them, and the ones ticked (one cabang, one gudang) are billed on one
 * invoice with their lines merged per product.
 */
describe("PurchaseInvoiceForm — from receipts", () => {
  const SUPPLIER = {
    _id: "s1",
    name: "PT Sumber Pangan",
    type: "beli_putus",
    isActive: true,
  };
  const SECOND_ID = "gr2";
  const ELSEWHERE_ID = "gr3";

  const unbilled = (overrides: Partial<GoodsReceiptDetail> = {}) => ({
    ...receiptDetail(),
    invoiceId: null,
    ...overrides,
  });
  // A second delivery of the same product, same cabang and gudang, later.
  const second = unbilled({
    _id: SECOND_ID,
    receiptNumber: "GR-260810-002",
    receiptDate: "2026-08-10T00:00:00.000Z",
    taxAmount: "8800.0000",
    items: [
      {
        ...receiptDetail().items[0],
        itemId: "it2",
        qty: "5.0000",
        costPerUnit: "16000.0000",
        subtotal: "80000.0000",
      },
    ],
  });
  const rows = (): GoodsReceiptListRow[] => [
    receiptRow(),
    {
      ...receiptRow(),
      _id: SECOND_ID,
      receiptNumber: "GR-260810-002",
      receiptDate: "2026-08-10T00:00:00.000Z",
    },
    {
      ...receiptRow(),
      _id: ELSEWHERE_ID,
      receiptNumber: "GR-260811-003",
      branchId: "b2",
      branchName: "Cabang Selatan",
      warehouseId: "wh2",
      warehouseName: "Gudang Cabang Selatan",
    },
  ];

  beforeEach(() => {
    asMock(supplierService.list).mockResolvedValue(optionPage([SUPPLIER]));
    asMock(warehouseService.list).mockResolvedValue(optionPage([WAREHOUSE]));
    asMock(productService.list).mockResolvedValue(optionPage([]));
    asMock(goodsReceiptService.list).mockResolvedValue({
      items: rows(),
      pagination: { page: 1, limit: 100, total: 3, totalPages: 1 },
    });
    asMock(goodsReceiptService.getById).mockImplementation(async (id) =>
      id === SECOND_ID ? second : unbilled({ _id: id }),
    );
    asMock(purchaseInvoiceService.create).mockResolvedValue(detail());
    // The expense accounts a "biaya lain" may go to — by category.
    asMock(chartOfAccountsService.list).mockImplementation(async (query) =>
      optionPage(
        query?.accountCategory === "biaya"
          ? [
              {
                _id: "acc-ongkir",
                code: "6107",
                name: "Beban Ongkos Kirim",
                accountType: "expense",
                accountCategory: "biaya",
                isActive: true,
              },
            ]
          : [],
      ),
    );
  });

  async function pickSupplier(user: UserEvent) {
    await user.click(await screen.findByLabelText("Supplier"));
    await user.click(
      await screen.findByRole("option", { name: /PT Sumber Pangan/ }),
    );
  }

  it("offers the supplier's uninvoiced receipts as soon as it is picked", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchaseInvoiceForm />);

    await pickSupplier(user);

    const dialog = await screen.findByRole("dialog", {
      name: "Penerimaan yang belum ada fakturnya",
    });
    expect(within(dialog).getByText("GR-260806-001")).toBeInTheDocument();
    // Asked of the server, for THIS supplier, unbilled outright deliveries only.
    expect(goodsReceiptService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: "s1",
        invoiced: false,
        purchaseType: "beli_putus",
      }),
    );
    expect(
      within(dialog).getByRole("button", { name: "Buat dari penerimaan (0)" }),
    ).toBeDisabled();
  });

  it("goes straight on as a manual invoice when the supplier has none", async () => {
    asMock(goodsReceiptService.list).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
    const user = userEvent.setup();
    renderWithAuth(<PurchaseInvoiceForm />);

    await pickSupplier(user);

    await waitFor(() => expect(goodsReceiptService.list).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Tambah produk/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/belum ada fakturnya/)).not.toBeInTheDocument();
  });

  it("disables receipts from another cabang or gudang after the first tick", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchaseInvoiceForm />);
    await pickSupplier(user);
    const dialog = await screen.findByRole("dialog");

    const elsewhere = within(dialog).getByRole("checkbox", {
      name: "Pilih GR-260811-003",
    });
    expect(elsewhere).not.toBeDisabled();

    await user.click(
      within(dialog).getByRole("checkbox", { name: "Pilih GR-260806-001" }),
    );

    expect(elsewhere).toBeDisabled();
    expect(
      within(dialog).getByText("Beda cabang dan gudang"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("checkbox", { name: "Pilih GR-260810-002" }),
    ).not.toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Buat dari penerimaan (1)" }),
    ).toBeEnabled();
  });

  it("bills the ticked receipts on one invoice, their lines merged per product", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchaseInvoiceForm />);
    await pickSupplier(user);
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Pilih GR-260806-001" }),
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Pilih GR-260810-002" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Buat dari penerimaan (2)" }),
    );

    // ONE line for the product: 10 + 5, Rp 150.000 + Rp 80.000.
    const table = await screen.findByRole("table");
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(1);
    expect(bodyRows[0]).toHaveTextContent("Shampoo Anjing");
    expect(bodyRows[0]).toHaveTextContent("15");
    expect(bodyRows[0]).toHaveTextContent("Rp 230.000");
    // Read-only: nothing to type into, and no invoice discount.
    expect(within(table).queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Diskon faktur")).not.toBeInTheDocument();
    // The receipts are named, cabang and gudang read off them.
    expect(screen.getByRole("link", { name: "GR-260810-002" })).toHaveAttribute(
      "href",
      `/dashboard/purchasing/receipts/${SECOND_ID}`,
    );
    expect(screen.getByLabelText("Gudang")).toHaveValue("Gudang Utama");
    // PPN Σ 16.500 + 8.800; Total tagihan 230.000 + 25.300.
    expect(screen.getByText("Total tagihan").nextSibling).toHaveTextContent(
      "Rp 255.300",
    );

    await user.click(screen.getByRole("button", { name: /Simpan faktur/ }));

    await waitFor(() =>
      expect(purchaseInvoiceService.create).toHaveBeenCalledTimes(1),
    );
    expect(asMock(purchaseInvoiceService.create).mock.calls[0][0]).toEqual({
      supplierId: "s1",
      goodsReceiptIds: [RECEIPT_ID, SECOND_ID],
      invoiceDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(replace).toHaveBeenCalledWith(
      `/dashboard/purchasing/payables/${INVOICE_ID}`,
    );
  });

  // The same product in two batches stays two lines (16 October 2026).
  it("keeps the same product in two batches as two lines", async () => {
    asMock(productBatchService.getById).mockImplementation(
      async (id) =>
        ({
          _id: id,
          batchCode: id === "lot-a" ? "SHAMPOO-271208" : "SHAMPOO-280115",
          expiryDate: null,
        }) as unknown as ProductBatch,
    );
    asMock(goodsReceiptService.getById).mockImplementation(async (id) =>
      id === SECOND_ID
        ? {
            ...second,
            items: second.items.map((item) => ({ ...item, batchId: "lot-b" })),
          }
        : unbilled({
            _id: id,
            items: receiptDetail().items.map((item) => ({
              ...item,
              batchId: "lot-a",
            })),
          }),
    );
    const user = userEvent.setup();
    renderWithAuth(<PurchaseInvoiceForm />);
    await pickSupplier(user);
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Pilih GR-260806-001" }),
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Pilih GR-260810-002" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Buat dari penerimaan (2)" }),
    );

    const table = await screen.findByRole("table");
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[0]).toHaveTextContent("Rp 150.000");
    expect(bodyRows[1]).toHaveTextContent("Rp 80.000");
    // Each named by its lot.
    expect(
      await within(bodyRows[0]).findByText(/batch SHAMPOO-271208/),
    ).toBeInTheDocument();
    expect(
      await within(bodyRows[1]).findByText(/batch SHAMPOO-280115/),
    ).toBeInTheDocument();
  });

  it("goes on as a manual invoice from the modal, and can reopen it", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchaseInvoiceForm />);
    await pickSupplier(user);
    const dialog = await screen.findByRole("dialog");

    await user.click(
      within(dialog).getByRole("button", { name: "Buat faktur manual" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /Tambah produk/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/belum ada fakturnya/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pilih penerimaan" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("opens on the receipt it came from, with its supplier, the modal shut", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchaseInvoiceForm receiptId={RECEIPT_ID} />);

    expect(
      await screen.findByRole("link", { name: "GR-260806-001" }),
    ).toBeInTheDocument();
    expect(goodsReceiptService.getById).toHaveBeenCalledWith(RECEIPT_ID);
    await waitFor(() =>
      expect(goodsReceiptService.list).toHaveBeenCalledWith(
        expect.objectContaining({ supplierId: "s1" }),
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // More of the same cabang and gudang can be added from the modal.
    await user.click(screen.getByRole("button", { name: "Pilih penerimaan" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("checkbox", { name: "Pilih GR-260806-001" }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole("checkbox", { name: "Pilih GR-260811-003" }),
    ).toBeDisabled();
    await user.click(
      within(dialog).getByRole("button", { name: "Buat dari penerimaan (1)" }),
    );

    await user.click(
      await screen.findByRole("button", { name: /Simpan faktur/ }),
    );
    await waitFor(() =>
      expect(purchaseInvoiceService.create).toHaveBeenCalledWith(
        expect.objectContaining({ goodsReceiptIds: [RECEIPT_ID] }),
      ),
    );
  });

  it("says so when the receipt it was opened from already has an invoice", async () => {
    asMock(goodsReceiptService.getById).mockResolvedValue(receiptDetail());

    renderWithAuth(<PurchaseInvoiceForm receiptId={RECEIPT_ID} />);

    expect(
      await screen.findByText(/GR-260806-001 sudah punya faktur/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lihat faktur" })).toHaveAttribute(
      "href",
      `/dashboard/purchasing/payables/${INVOICE_ID}`,
    );
  });

  it("sends a biaya lain only to an expense account, added after PPN", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchaseInvoiceForm receiptId={RECEIPT_ID} />);

    await user.click(
      await screen.findByRole("button", { name: "+ Tambah biaya lain" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Nama biaya/), "Ongkir");
    await user.type(within(dialog).getByLabelText(/Nominal/), "20000");
    // No switch on this path — the goods are already valued.
    expect(
      within(dialog).queryByRole("switch", { name: "Masuk akun beban" }),
    ).toBeNull();
    await user.click(within(dialog).getByLabelText(/Akun beban/));
    await user.click(
      await screen.findByRole("option", { name: /6107 Beban Ongkos Kirim/ }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Simpan biaya" }));

    expect(
      screen.getByText("Ongkir · beban 6107 Beban Ongkos Kirim"),
    ).toBeInTheDocument();
    // 150.000 + PPN 16.500 + ongkir 20.000.
    expect(screen.getByText("Total tagihan").nextSibling).toHaveTextContent(
      "Rp 186.500",
    );

    await user.click(screen.getByRole("button", { name: /Simpan faktur/ }));
    await waitFor(() =>
      expect(purchaseInvoiceService.create).toHaveBeenCalledTimes(1),
    );
    expect(
      asMock(purchaseInvoiceService.create).mock.calls[0][0].otherCharges,
    ).toEqual([
      {
        label: "Ongkir",
        amount: "20000",
        allocation: "expense",
        accountId: "acc-ongkir",
      },
    ]);
  });
});

/* -------------------------------------------------------------------- hub */

describe("PurchasingHub — the Ringkasan tab", () => {
  function panel(title: string): HTMLElement {
    return screen.getByText(title).closest("section")!;
  }

  /*
    THE CARD ROW IS PayablesStatCards NOW (2 October 2026) — the same
    four-card strip Faktur carries, fed from THIS tab's own cabang/period-
    scoped summary rather than the whole book `/outstanding` answers. "Hutang
    terbayar periode ini" is gone from the page in the swap — see the hub's
    own doc for why — so there is nothing here asserting `summary.paid`
    reached a card; the period's own scoping is covered below instead.
  */
  it("draws the balance and the due-soon bucket from its own scoped summary", async () => {
    asMock(purchaseInvoiceService.summary).mockResolvedValue(payablesSummary());

    renderWithAuth(<PurchasingHub />);

    expect(await screen.findByText("Rp 9.500.000")).toBeInTheDocument();
    expect(screen.getByText("12 faktur")).toBeInTheDocument();
    expect(screen.getByText("Jatuh tempo ≤ 7 hari")).toBeInTheDocument();
    expect(screen.getByText("Pembelian periode")).toBeInTheDocument();
    // The period's own billed value, off `summary.invoiced` — a real figure now.
    expect(screen.getByText("Rp 26.400.000")).toBeInTheDocument();
    expect(screen.getByText("9 faktur")).toBeInTheDocument();
    expect(screen.getByText("Barang belum diterima")).toBeInTheDocument();
    // Deliveries filed but not yet confirmed on the shelf, off pending-count.
    expect(await screen.findByText("3 penerimaan")).toBeInTheDocument();
  });

  it("opens the receipts list narrowed to the ones still expected from the card", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchasingHub />);

    await user.click(await screen.findByText("3 penerimaan"));

    // `open` = pending AND partial — a half-delivered order is still waited on.
    expect(push).toHaveBeenCalledWith(
      "/dashboard/purchasing/receipts?status=open",
    );
  });

  it("scopes the pending-delivery count by the chosen cabang", async () => {
    renderWithAuth(<PurchasingHub />);

    await waitFor(() =>
      expect(goodsReceiptService.pendingCount).toHaveBeenCalledWith({
        branchIds: undefined,
      }),
    );
  });

  it("opens on this month and scopes every request by the cabang", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchasingHub />);

    await waitFor(() => expect(purchaseInvoiceService.summary).toHaveBeenCalled());

    /*
      THE MONTH GOES OVER THE WIRE AS ITS NAME, never as two dates this screen
      worked out: "Bulan ini" is the TENANT's month, and a browser in another
      timezone would bound it a few hours off.
    */
    expect(asMock(purchaseInvoiceService.summary).mock.calls[0][0]).toEqual({
      branchIds: undefined,
      period: "month",
    });

    // Several cabang may be ticked (12 October 2026), so a pick waits for
    // Terapkan.
    await user.click(screen.getByRole("button", { name: "Cabang" }));
    const popover = await screen.findByRole("dialog");
    await user.click(within(popover).getByRole("option", { name: /Cabang Pusat/ }));
    await user.click(within(popover).getByRole("button", { name: "Terapkan" }));

    // The cabang says whose books — so it narrows the cards AND the two
    // worklists, which would otherwise list another branch's bills under it.
    await waitFor(() =>
      expect(purchaseInvoiceService.summary).toHaveBeenLastCalledWith(
        expect.objectContaining({ branchIds: [BRANCH_ID] }),
      ),
    );
    expect(purchaseInvoiceService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        branchIds: [BRANCH_ID],
        overdue: true,
        limit: 5,
      }),
    );
    expect(goodsReceiptService.pendingCount).toHaveBeenLastCalledWith({
      branchIds: [BRANCH_ID],
    });
    expect(consignmentSettlementService.outstanding).toHaveBeenLastCalledWith({
      branchIds: [BRANCH_ID],
    });

    // "Reset filter" — the Penjualan tabs' button — counts the cabang and puts
    // it back, with the period on its default, Bulan ini.
    await user.click(screen.getByRole("button", { name: "Minggu ini" }));
    await user.click(
      await screen.findByRole("button", { name: "Reset filter (2)" }),
    );
    await waitFor(() =>
      expect(purchaseInvoiceService.summary).toHaveBeenLastCalledWith({
        branchIds: undefined,
        period: "month",
      }),
    );
    expect(screen.queryByRole("button", { name: /Reset filter/ })).toBeNull();
  });

  /*
    THE PERIOD CHIPS APPLY ON CLICK — no Filter button, no Terapkan (29 September
    2026, on request). Two controls that fit on one line do not earn a modal.
  */
  it("switches period on a chip, and sends no dates for Semua", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchasingHub />);

    await waitFor(() => expect(purchaseInvoiceService.summary).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Minggu ini" }));
    await waitFor(() =>
      expect(purchaseInvoiceService.summary).toHaveBeenLastCalledWith({
        branchIds: undefined,
        period: "week",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Semua" }));
    // "Semua" is the absence of a period, not a period named "all" — the API
    // has no such value, and sending one would 400.
    await waitFor(() =>
      expect(purchaseInvoiceService.summary).toHaveBeenLastCalledWith({
        branchIds: undefined,
      }),
    );
  });

  it("reveals the two dates in the card under Custom, applied on Terapkan", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchasingHub />);

    await waitFor(() => expect(purchaseInvoiceService.summary).toHaveBeenCalled());
    expect(screen.queryByText("Rentang khusus")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Custom" }));

    // Open in the card — no trigger to press first, because the chip already
    // said a range is being typed.
    expect(await screen.findByText("Rentang khusus")).toBeInTheDocument();

    const from = screen.getByLabelText("Tanggal bayar dari");
    const to = screen.getByLabelText("Tanggal bayar sampai");
    await user.type(from, "2026-09-01");
    await user.type(to, "2026-09-30");

    /*
      NOTHING WENT OVER THE WIRE WHILE TYPING — only the two reads the chips
      themselves caused (opening on Bulan ini, then switching to Custom). A date
      input reports a half-typed year as a real value, so applying on every
      keystroke would query "0002-09-01" and answer with an empty month before
      anybody had finished.
    */
    expect(purchaseInvoiceService.summary).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(purchaseInvoiceService.summary).toHaveBeenLastCalledWith({
        branchIds: undefined,
        dateFrom: "2026-09-01",
        dateTo: "2026-09-30",
      }),
    );
  });

  it("empties the range on Reset without leaving Custom", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchasingHub />);

    await waitFor(() => expect(purchaseInvoiceService.summary).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Custom" }));

    await user.type(
      await screen.findByLabelText("Tanggal bayar dari"),
      "2026-09-01",
    );
    await user.click(screen.getByRole("button", { name: "Terapkan" }));
    await waitFor(() =>
      expect(purchaseInvoiceService.summary).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateFrom: "2026-09-01" }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Reset" }));

    // Reset empties the range; it does not undo the choice to type one, so the
    // inputs stay on screen and the query is still the Custom one — with both
    // ends unbounded, which the server reads as every date.
    await waitFor(() =>
      expect(purchaseInvoiceService.summary).toHaveBeenLastCalledWith({
        branchIds: undefined,
        dateFrom: "",
        dateTo: "",
      }),
    );
    expect(screen.getByText("Rentang khusus")).toBeInTheDocument();
  });

  it("takes the overdue count and total from the summary endpoint", async () => {
    asMock(purchaseInvoiceService.summary).mockResolvedValue(
      payablesSummary({
        overdue: { amount: "2750000.0000", invoiceCount: 7 },
      }),
    );
    asMock(purchaseInvoiceService.list).mockResolvedValue(
      page([listRow({ isOverdue: true })], 7),
    );

    renderWithAuth(<PurchasingHub />);

    // The whole bucket, not the rows shown — "1" beside one of seven rows would
    // say the job was nearly done.
    await waitFor(() =>
      expect(
        within(panel("Hutang lewat jatuh tempo")).getByText("7"),
      ).toBeInTheDocument(),
    );
    expect(
      within(panel("Hutang lewat jatuh tempo")).getByText("Rp 2.750.000"),
    ).toBeInTheDocument();
  });

  /**
   * THE ALREADY-LATE INVOICES ARE THE SERVER'S TO EXCLUDE, and this asks it to.
   *
   * `dueBefore` bounds only the far end of the window, so a due-soon read
   * expressed with it comes back with everything overdue mixed in — and the two
   * panels are read side by side, where a bill in both is counted twice by
   * whoever adds up the week.
   */
  it("asks the server for the due-soon bucket rather than filtering here", async () => {
    renderWithAuth(<PurchasingHub />);

    await screen.findByText("Hutang jatuh tempo minggu ini");

    await waitFor(() =>
      expect(purchaseInvoiceService.list).toHaveBeenCalledWith({
        dueSoon: true,
        limit: 5,
      }),
    );
    // The overdue read is its exact complement, and neither carries a window:
    // the horizon lives on the server.
    expect(purchaseInvoiceService.list).toHaveBeenCalledWith({
      overdue: true,
      limit: 5,
    });
  });

  it("takes the due-soon count and total from the summary endpoint", async () => {
    asMock(purchaseInvoiceService.summary).mockResolvedValue(
      payablesSummary({
        dueSoon: { amount: "1250000.0000", invoiceCount: 4, horizonDays: 7 },
      }),
    );
    asMock(purchaseInvoiceService.list).mockImplementation(async (query) =>
      query?.dueSoon
        ? page(
            [
              listRow({
                _id: "soon",
                invoiceNumber: "INV/2026/VIII/0200",
                supplierName: "CV Mitra Ternak",
                outstandingAmount: "80000.0000",
              }),
            ],
            4,
          )
        : page([], 0),
    );

    renderWithAuth(<PurchasingHub />);

    await waitFor(() =>
      expect(
        within(panel("Hutang jatuh tempo minggu ini")).getByText(
          /CV Mitra Ternak/,
        ),
      ).toBeInTheDocument(),
    );

    const soon = panel("Hutang jatuh tempo minggu ini");
    // The whole bucket beside one row of it, and a total nothing here summed.
    expect(within(soon).getByText("4")).toBeInTheDocument();
    expect(within(soon).getByText("Rp 1.250.000")).toBeInTheDocument();
  });

  /**
   * The caption states the window the figures were COMPUTED with, not a constant
   * this screen keeps — which would go on saying "7 hari" the day the server's
   * default changes.
   */
  it("captions the panel with the horizon the server reported", async () => {
    asMock(purchaseInvoiceService.summary).mockResolvedValue(
      payablesSummary({
        dueSoon: { amount: "0.0000", invoiceCount: 0, horizonDays: 14 },
      }),
    );

    renderWithAuth(<PurchasingHub />);

    expect(
      await screen.findByText(/jatuh tempo dalam 14 hari/),
    ).toBeInTheDocument();
  });

  it("issues no payables requests for a role that may not read them", async () => {
    renderWithAuth(<PurchasingHub />, {
      isSuperAdmin: false,
      permissions: [{ feature: "suppliers", actions: ["read"] }],
    });

    expect(
      await screen.findByText(/hanya untuk peran yang boleh membaca faktur/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Hutang lewat jatuh tempo")).not.toBeInTheDocument();
    expect(purchaseInvoiceService.list).not.toHaveBeenCalled();
    expect(purchaseInvoiceService.summary).not.toHaveBeenCalled();
  });

  it("says so plainly when nothing is due", async () => {
    renderWithAuth(<PurchasingHub />);

    expect(
      await screen.findByText("Tidak ada hutang yang lewat jatuh tempo."),
    ).toBeInTheDocument();
    // Awaited, not read synchronously: the sentence names the server's horizon,
    // so it cannot be written until the figures arrive — until then the panel
    // says nothing about a window rather than naming one it is guessing at.
    expect(
      await screen.findByText(/Tidak ada hutang yang jatuh tempo dalam 7 hari/),
    ).toBeInTheDocument();
  });

  /*
    THE SCOPE CARD IS READ-ONLY, and it is the one place the two filters are
    VISIBLE. A panel hides what it holds, and a hidden filter is one people forget
    is on and then read the wrong numbers from — which is why the card spells both
    out and carries the only Reset.
  */
  it("shows both controls outright rather than behind a Filter button", async () => {
    renderWithAuth(<PurchasingHub />);

    const scope = screen.getByLabelText("Lingkup data");
    // Nothing is concealed, so there is no badge to remind anybody of it and
    // nothing for a Reset to put back.
    expect(screen.queryByRole("button", { name: /^Filter/ })).not.toBeInTheDocument();
    expect(within(scope).getByRole("button", { name: "Cabang" })).toHaveTextContent(
      "Semua cabang",
    );
    // Opened on Bulan Ini, and the pressed chip says which.
    expect(within(scope).getByRole("button", { name: "Bulan ini" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(scope).getByText("Periode")).toBeInTheDocument();
  });

  it("shows the consignment empty state with its one explanatory line", async () => {
    renderWithAuth(<PurchasingHub />);

    expect(await screen.findByText("Utang konsinyasi")).toBeInTheDocument();
    expect(
      await screen.findByText("Belum ada barang konsinyasi yang terjual."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/baru muncul saat barang terjual, sebesar harga setor/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Belum termasuk konsinyasi")).toBeNull();
  });
});

/**
 * Utang konsinyasi — what the shop owes consignors for goods that SOLD, and the
 * "Setor" that pays it. Radix selects are not driven: the lone pay-out channel is
 * pre-selected by the shared payment fields, and the tests assert on payloads.
 */
describe("PurchasingHub — Utang konsinyasi", () => {
  const OUTSTANDING = {
    items: [
      {
        supplierId: "sup-1",
        supplierName: "CV Titip Jaya",
        sold: "500000.0000",
        settled: "200000.0000",
        outstanding: "300000.0000",
      },
      {
        supplierId: "sup-2",
        supplierName: "UD Lunas",
        sold: "100000.0000",
        settled: "100000.0000",
        outstanding: "0.0000",
      },
    ],
    totals: {
      sold: "600000.0000",
      settled: "300000.0000",
      outstanding: "300000.0000",
    },
  };

  beforeEach(() => {
    asMock(consignmentSettlementService.outstanding).mockResolvedValue(
      OUTSTANDING,
    );
  });

  async function openDialog() {
    const user = userEvent.setup();
    renderWithAuth(<PurchasingHub />);
    await user.click(await screen.findByRole("button", { name: "Setor" }));
    const dialog = await screen.findByRole("dialog");
    // The channel list has to have landed so a channel is selected.
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Keluar dari")).toBeInTheDocument(),
    );
    return { user, dialog };
  }

  it("renders one row per supplier, scoped by the tab's cabang", async () => {
    renderWithAuth(<PurchasingHub />);

    expect(await screen.findByText("CV Titip Jaya")).toBeInTheDocument();
    expect(screen.getByText("Rp 500.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 200.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 300.000")).toBeInTheDocument();
    expect(screen.getByText("UD Lunas")).toBeInTheDocument();
    expect(consignmentSettlementService.outstanding).toHaveBeenCalledWith({
      branchIds: undefined,
    });
  });

  it("offers Setor only on rows that still owe something", async () => {
    renderWithAuth(<PurchasingHub />);

    await screen.findByText("UD Lunas");
    expect(screen.getAllByRole("button", { name: "Setor" })).toHaveLength(1);
  });

  it("is hidden, and requests nothing, without purchaseInvoices:read", async () => {
    renderWithAuth(<PurchasingHub />, {
      isSuperAdmin: false,
      permissions: [{ feature: "suppliers", actions: ["read"] }],
    });

    await screen.findByText(/hanya untuk peran yang boleh membaca faktur/);
    expect(screen.queryByText("Utang konsinyasi")).toBeNull();
    expect(consignmentSettlementService.outstanding).not.toHaveBeenCalled();
  });

  it("hides Setor without purchaseInvoices:pay but still lists the debt", async () => {
    renderWithAuth(<PurchasingHub />, {
      isSuperAdmin: false,
      permissions: [{ feature: "purchaseInvoices", actions: ["read"] }],
    });

    expect(await screen.findByText("CV Titip Jaya")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Setor" })).toBeNull();
  });

  it("keeps the rest of the tab when the consignment read fails", async () => {
    asMock(consignmentSettlementService.outstanding).mockRejectedValue(
      new Error("boom"),
    );
    renderWithAuth(<PurchasingHub />);

    expect(
      await screen.findByText(/Utang konsinyasi gagal dimuat/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Hutang lewat jatuh tempo"),
    ).toBeInTheDocument();
  });

  it("defaults the amount to the sisa utang and refuses more than it", async () => {
    const { user, dialog } = await openDialog();

    const amount = within(dialog).getByLabelText("Nominal setor");
    expect(amount).toHaveValue("300000.0000");

    await user.clear(amount);
    await user.type(amount, "300001");

    expect(
      within(dialog).getByText(/Melebihi sisa utang Rp 300.000/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Simpan setoran" }),
    ).toBeDisabled();
    expect(consignmentSettlementService.create).not.toHaveBeenCalled();
  });

  it("sends the payment-account pair and refetches on success", async () => {
    asMock(consignmentSettlementService.create).mockResolvedValue({
      _id: "cs-1",
      number: "SET-001",
      supplierId: "sup-1",
      supplierName: "CV Titip Jaya",
      amount: "100000.0000",
      at: "2026-10-04",
    });
    const { user, dialog } = await openDialog();

    const amount = within(dialog).getByLabelText("Nominal setor");
    await user.clear(amount);
    await user.type(amount, "100000");
    await user.type(within(dialog).getByLabelText("Nomor referensi"), " TRX-9 ");
    await user.type(within(dialog).getByLabelText("Catatan"), "Setor Oktober");
    await user.click(
      within(dialog).getByRole("button", { name: "Simpan setoran" }),
    );

    await waitFor(() =>
      expect(consignmentSettlementService.create).toHaveBeenCalledWith({
        supplierId: "sup-1",
        amount: "100000",
        at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        method: "transfer",
        channelId: "chan-bca",
        ref: "TRX-9",
        notes: "Setor Oktober",
      }),
    );
    expect(swalToast).toHaveBeenCalledWith(expect.stringMatching(/Setor/));
    await waitFor(() =>
      expect(consignmentSettlementService.outstanding).toHaveBeenCalledTimes(2),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the API's refusal inside the dialog and keeps it open", async () => {
    asMock(consignmentSettlementService.create).mockRejectedValue(
      new ApiError("Jumlah melebihi sisa utang konsinyasi.", 400),
    );
    const { user, dialog } = await openDialog();

    await user.click(
      within(dialog).getByRole("button", { name: "Simpan setoran" }),
    );

    expect(
      await within(dialog).findByText(/melebihi sisa utang konsinyasi/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

/* ----------------------------------------------- the manual invoice's life */

/**
 * A MANUAL INVOICE is typed in before the goods arrive. Nothing is owed until a
 * goods receipt is made from it and something is received, so it cannot be
 * paid; until that receipt exists it can still be edited or deleted.
 */
describe("InvoiceDetail — a manual invoice with no receipt yet", () => {
  beforeEach(() => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(manualDetail());
  });

  it("says the goods have not arrived and offers no payment", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByText(/Barang dari faktur ini belum diterima/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Belum ada yang bisa dibayar/)).toHaveTextContent(
      /barangnya belum diterima/,
    );
    expect(
      screen.queryByRole("button", { name: /Catat pembayaran/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Belum ada penerimaan barang."),
    ).toBeInTheDocument();
  });

  /**
   * THE BUTTON OPENS THE RECEIPT FORM ON THIS INVOICE; it writes nothing. The
   * receipt is made only when that form is saved, with its lots and what
   * arrived (15 October 2026, BO) — so no request, and no toast, from here.
   */
  it("opens the receipt form on this invoice without writing anything", async () => {
    const user = userEvent.setup();

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await user.click(
      await screen.findByRole("button", { name: "Buat penerimaan barang" }),
    );

    expect(push).toHaveBeenCalledWith(
      `/dashboard/purchasing/receipts/new?invoice=${INVOICE_ID}`,
    );
    expect(goodsReceiptService.createFromInvoice).not.toHaveBeenCalled();
    expect(swalToast).not.toHaveBeenCalled();
  });

  it("links to the edit page", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByRole("link", { name: "Ubah faktur" }),
    ).toHaveAttribute("href", `/dashboard/purchasing/payables/${INVOICE_ID}/edit`);
  });

  it("deletes only after a confirmation, then leaves for the list", async () => {
    asMock(purchaseInvoiceService.remove).mockResolvedValue({
      _id: INVOICE_ID,
      deleted: true,
    });
    const user = userEvent.setup();

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await user.click(await screen.findByRole("button", { name: "Hapus" }));
    const dialog = await screen.findByRole("dialog");
    expect(purchaseInvoiceService.remove).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Hapus faktur" }),
    );

    await waitFor(() =>
      expect(purchaseInvoiceService.remove).toHaveBeenCalledWith(INVOICE_ID),
    );
    expect(replace).toHaveBeenCalledWith("/dashboard/purchasing/payables");
  });

  it("offers none of it on a linked invoice", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(detail());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await screen.findByRole("button", { name: /Catat pembayaran/ });
    expect(
      screen.queryByRole("button", { name: "Buat penerimaan barang" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Ubah faktur" }),
    ).not.toBeInTheDocument();
  });

  it("withholds the receipt button from a role that may not receive goods", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "purchaseInvoices", actions: ["create", "read", "pay"] },
      ],
    });

    expect(
      await screen.findByRole("link", { name: "Ubah faktur" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Buat penerimaan barang" }),
    ).not.toBeInTheDocument();
  });
});

describe("PurchaseInvoiceForm — manual", () => {
  const SUPPLIER = {
    _id: "s1",
    name: "PT Sumber Pangan",
    type: "beli_putus",
    isActive: true,
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
    hppAvg: "12000.0000",
    isActive: true,
    isConsignment: false,
    deletedAt: null,
    stockByWarehouse: [],
  };

  beforeEach(() => {
    asMock(supplierService.list).mockResolvedValue(optionPage([SUPPLIER]));
    // One warehouse for the sole branch, so the form answers both itself.
    asMock(warehouseService.list).mockResolvedValue(optionPage([WAREHOUSE]));
    asMock(productService.list).mockResolvedValue(optionPage([PRODUCT]));
    asMock(purchaseInvoiceService.create).mockResolvedValue(manualDetail());
    asMock(purchaseInvoiceService.update).mockResolvedValue(manualDetail());
    // The supplier has no delivery waiting for a bill: straight on, manual.
    asMock(goodsReceiptService.list).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
  });

  it("says which answer is still missing before it can be saved", async () => {
    renderWithAuth(<PurchaseInvoiceForm />);

    expect(
      await screen.findByRole("button", { name: /Simpan faktur/ }),
    ).toBeDisabled();
    expect(screen.getByText(/supplier belum dipilih/)).toBeInTheDocument();
  });

  // Discounts and "biaya lain", as on the till (16 October 2026, BO).
  it("sends a line discount, the bill's discount and other charges, with live totals", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchaseInvoiceForm />);

    await user.click(await screen.findByLabelText("Supplier"));
    await user.click(
      await screen.findByRole("option", { name: /PT Sumber Pangan/ }),
    );
    await user.click(screen.getByRole("button", { name: /Tambah produk/ }));
    await user.click(await screen.findByLabelText(/Shampoo Anjing/));
    await user.click(screen.getByRole("button", { name: /Tambahkan/ }));

    const qty = await screen.findByLabelText("Qty Shampoo Anjing");
    await user.clear(qty);
    await user.type(qty, "10");
    const price = screen.getByLabelText("Harga beli Shampoo Anjing");
    await user.clear(price);
    await user.type(price, "15000");
    // 10% off 150.000 = 135.000
    await user.type(screen.getByLabelText("Diskon Shampoo Anjing"), "10");
    // Rp 5.000 off the bill = 130.000
    await user.selectOptions(screen.getByLabelText("Jenis diskon faktur"), "amount");
    await user.type(screen.getByLabelText("Diskon faktur"), "5000");
    // + ongkir 20.000 = 150.000
    await user.click(screen.getByRole("button", { name: "+ Tambah biaya lain" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Nama biaya/), "Ongkir");
    await user.type(within(dialog).getByLabelText(/Nominal/), "20.000");
    await user.click(within(dialog).getByRole("button", { name: "Simpan biaya" }));

    expect(screen.getByText("Total sebelum PPN").nextSibling).toHaveTextContent(
      "Rp 150.000",
    );

    await user.click(screen.getByRole("button", { name: /Simpan faktur/ }));

    await waitFor(() =>
      expect(purchaseInvoiceService.create).toHaveBeenCalledTimes(1),
    );
    const body = asMock(purchaseInvoiceService.create).mock
      .calls[0][0] as ManualPurchaseInvoiceInput;
    expect(body.items[0].discount).toEqual({ mode: "percent", value: "10" });
    expect(body.invoiceDiscount).toEqual({ mode: "amount", value: "5000" });
    expect(body.otherCharges).toEqual([
      { label: "Ongkir", amount: "20000", allocation: "goods" },
    ]);
  });

  // "Masuk akun beban" switch per biaya lain: off = ke barang, on = an account.
  it("posts a biaya lain to an expense account after PPN when the switch is on", async () => {
    asMock(chartOfAccountsService.list).mockImplementation(async (query) =>
      optionPage(
        query?.accountCategory === "biaya"
          ? [
              {
                _id: "acc-ongkir",
                code: "6107",
                name: "Beban Ongkos Kirim",
                accountType: "expense",
                accountCategory: "biaya",
                isActive: true,
              },
            ]
          : [],
      ),
    );
    const user = userEvent.setup();
    renderWithAuth(
      <PurchaseInvoiceForm invoice={manualDetail({ items: [invoiceItem()] })} />,
    );

    await user.click(
      await screen.findByRole("button", { name: "+ Tambah biaya lain" }),
    );
    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Nama biaya/), "Ongkir");
    await user.type(within(dialog).getByLabelText(/Nominal/), "20000");
    // Off by default — ke barang, and no account asked.
    const toExpense = within(dialog).getByRole("switch", {
      name: "Masuk akun beban",
    });
    expect(toExpense).not.toBeChecked();
    expect(within(dialog).queryByLabelText(/Akun beban/)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Simpan biaya" }));
    expect(screen.getByText("Ke barang (masuk HPP)")).toBeInTheDocument();
    expect(screen.getByText("Total sebelum PPN").nextSibling).toHaveTextContent(
      "Rp 170.000",
    );

    // Switched on, the account is asked for — and required.
    await user.click(screen.getByRole("button", { name: "Ubah biaya lain 1" }));
    dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("switch", { name: "Masuk akun beban" }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Simpan biaya" }));
    expect(
      within(dialog).getByText("Pilih akun bebannya."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText(/Akun beban/));
    await user.click(
      await screen.findByRole("option", { name: /6107 Beban Ongkos Kirim/ }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Simpan biaya" }));

    // Out of the subtotal, listed after PPN, still in Total tagihan.
    expect(
      screen.getByText("Beban · 6107 Beban Ongkos Kirim"),
    ).toBeInTheDocument();
    expect(screen.getByText("Total sebelum PPN").nextSibling).toHaveTextContent(
      "Rp 150.000",
    );
    expect(
      screen.getByText("Ongkir · beban 6107 Beban Ongkos Kirim"),
    ).toBeInTheDocument();
    expect(screen.getByText("Total tagihan").nextSibling).toHaveTextContent(
      "Rp 186.500",
    );
    await user.click(screen.getByRole("button", { name: /Simpan faktur/ }));

    await waitFor(() =>
      expect(purchaseInvoiceService.update).toHaveBeenCalledTimes(1),
    );
    expect(asMock(purchaseInvoiceService.update).mock.calls[0][1].otherCharges).toEqual([
      {
        label: "Ongkir",
        amount: "20000",
        allocation: "expense",
        accountId: "acc-ongkir",
      },
    ]);
  });

  // The vendor's number is optional — the bill gets our own (16 October 2026).
  it("files a manual invoice with no vendor number", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchaseInvoiceForm />);

    await user.click(await screen.findByLabelText("Supplier"));
    await user.click(
      await screen.findByRole("option", { name: /PT Sumber Pangan/ }),
    );
    expect(screen.getByLabelText(/No. faktur supplier/)).not.toBeRequired();

    await user.click(screen.getByRole("button", { name: /Tambah produk/ }));
    await user.click(await screen.findByLabelText(/Shampoo Anjing/));
    await user.click(screen.getByRole("button", { name: /Tambahkan/ }));
    await user.click(screen.getByRole("button", { name: /Simpan faktur/ }));

    await waitFor(() =>
      expect(purchaseInvoiceService.create).toHaveBeenCalledTimes(1),
    );
    expect(
      asMock(purchaseInvoiceService.create).mock.calls[0][0].supplierInvoiceNumber,
    ).toBe("");
  });

  it("files a manual invoice with its lines and PPN", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchaseInvoiceForm />);

    await user.click(await screen.findByLabelText("Supplier"));
    await user.click(
      await screen.findByRole("option", { name: /PT Sumber Pangan/ }),
    );
    await user.type(
      screen.getByLabelText(/No. faktur supplier/),
      " INV/2026/X/0007 ",
    );

    await user.click(screen.getByRole("button", { name: /Tambah produk/ }));
    await user.click(await screen.findByLabelText(/Shampoo Anjing/));
    await user.click(screen.getByRole("button", { name: /Tambahkan/ }));

    const qty = await screen.findByLabelText("Qty Shampoo Anjing");
    await user.clear(qty);
    await user.type(qty, "10");
    const price = screen.getByLabelText("Harga beli Shampoo Anjing");
    expect(price).toHaveValue("12000");
    await user.clear(price);
    await user.type(price, "15000");
    await user.type(screen.getByLabelText(/PPN masukan/), "16500");

    expect(screen.getByText("Rp 166.500")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Simpan faktur/ }));

    await waitFor(() =>
      expect(purchaseInvoiceService.create).toHaveBeenCalledTimes(1),
    );
    expect(asMock(purchaseInvoiceService.create).mock.calls[0][0]).toEqual({
      supplierId: "s1",
      warehouseId: "wh1",
      supplierInvoiceNumber: "INV/2026/X/0007",
      invoiceDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      taxAmount: "16500",
      invoiceDiscount: null,
      otherCharges: [],
      items: [
        { productId: "p1", qty: "10", costPerUnit: "15000", discount: null },
      ],
    });
    expect(purchaseInvoiceService.update).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(
      `/dashboard/purchasing/payables/${INVOICE_ID}`,
    );
  });

  it("refuses a zero quantity locally", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <PurchaseInvoiceForm invoice={manualDetail({ items: [invoiceItem()] })} />,
    );

    const qty = await screen.findByLabelText("Qty Shampoo Anjing");
    await user.clear(qty);
    await user.type(qty, "0");
    await user.click(screen.getByRole("button", { name: /Simpan faktur/ }));

    expect(
      await screen.findByText("Qty harus lebih dari 0"),
    ).toBeInTheDocument();
    expect(purchaseInvoiceService.update).not.toHaveBeenCalled();
  });

  it("edits through update, keeping each line's id", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PurchaseInvoiceForm invoice={manualDetail()} />);

    const qty = await screen.findByLabelText("Qty Shampoo Anjing");
    expect(qty).toHaveValue("10");
    await user.clear(qty);
    await user.type(qty, "12");

    await user.click(
      await screen.findByRole("button", { name: /Simpan faktur/ }),
    );

    await waitFor(() =>
      expect(purchaseInvoiceService.update).toHaveBeenCalledTimes(1),
    );
    const [id, body] = asMock(purchaseInvoiceService.update).mock.calls[0];
    expect(id).toBe(INVOICE_ID);
    expect(body).toEqual({
      supplierId: "s1",
      warehouseId: "wh1",
      supplierInvoiceNumber: "INV/2026/VIII/0142",
      invoiceDate: "2026-08-06",
      taxAmount: "16500",
      invoiceDiscount: null,
      otherCharges: [],
      items: [
        {
          invoiceItemId: "ii1",
          productId: "p1",
          qty: "12",
          costPerUnit: "15000",
          discount: null,
        },
      ],
    });
    expect(purchaseInvoiceService.create).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(
      `/dashboard/purchasing/payables/${INVOICE_ID}`,
    );
  });

  it("toasts the API's refusal and stays on the form", async () => {
    asMock(purchaseInvoiceService.update).mockRejectedValue(
      new ApiError("Faktur sudah terkunci oleh penerimaan barang", 409),
    );
    const user = userEvent.setup();
    renderWithAuth(<PurchaseInvoiceForm invoice={manualDetail()} />);

    await user.click(
      await screen.findByRole("button", { name: /Simpan faktur/ }),
    );

    await waitFor(() =>
      expect(swalToast).toHaveBeenCalledWith(
        expect.stringMatching(/sudah terkunci/),
        "error",
        6000,
      ),
    );
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("EditInvoiceScreen", () => {
  it("hands an unlocked manual invoice to the form", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(manualDetail());
    asMock(supplierService.list).mockResolvedValue(
      optionPage([
        { _id: "s1", name: "PT Sumber Pangan", type: "beli_putus", isActive: true },
      ]),
    );
    asMock(productService.list).mockResolvedValue(optionPage([]));

    renderWithAuth(<EditInvoiceScreen invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByLabelText("Qty Shampoo Anjing"),
    ).toHaveValue("10");
  });

  it("refuses to edit an invoice a receipt has locked", async () => {
    asMock(purchaseInvoiceService.getById).mockResolvedValue(detail());

    renderWithAuth(<EditInvoiceScreen invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByText(/sudah punya penerimaan barang/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Kembali ke faktur" }),
    ).toHaveAttribute("href", `/dashboard/purchasing/payables/${INVOICE_ID}`);
    expect(screen.queryByRole("button", { name: /Simpan faktur/ })).toBeNull();
  });
});

describe("PayablesTable — what a row can be paid", () => {
  it("marks a manual bill whose goods have not arrived, and offers no Bayar on it", async () => {
    asMock(purchaseInvoiceService.list).mockResolvedValue(
      page([
        listRow({
          goodsReceiptId: null,
          locked: false,
          receivedAmount: "0.0000",
          payableAmount: "0.0000",
        }),
      ]),
    );

    const user = userEvent.setup();
    renderWithAuth(<PayablesScreen />);

    expect(await screen.findByText("barang belum diterima")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Aksi / }));
    expect(
      await screen.findByRole("menuitem", { name: "Lihat detail" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Bayar" })).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Buat penerimaan barang" }),
    ).toHaveAttribute(
      "href",
      `/dashboard/purchasing/receipts/new?invoice=${INVOICE_ID}`,
    );
  });

  it("offers Bayar on a linked bill with something payable", async () => {
    asMock(purchaseInvoiceService.list).mockResolvedValue(page([listRow()]));

    const user = userEvent.setup();
    renderWithAuth(<PayablesScreen />);

    await user.click(await screen.findByRole("button", { name: /^Aksi / }));
    expect(
      await screen.findByRole("menuitem", { name: "Bayar" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("barang belum diterima")).toBeNull();
  });

  it("opens the receipts still expected from the pending card", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PayablesScreen />);

    await user.click(await screen.findByText("3 penerimaan"));

    expect(push).toHaveBeenCalledWith(
      "/dashboard/purchasing/receipts?status=open",
    );
  });
});
