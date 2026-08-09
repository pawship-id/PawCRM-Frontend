import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  FileInvoiceForm,
  InvoiceDetail,
  PayablesScreen,
  PurchasingHub,
} from "@/features/purchasing";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { supplierService } from "@/services/supplier.service";
import { ApiError } from "@/services/api-error";
import type {
  GoodsReceiptDetail,
  GoodsReceiptListRow,
  PurchaseInvoiceDetail,
  PurchaseInvoiceListRow,
  SupplierOutstandingSummary,
} from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/purchaseInvoice.service");
jest.mock("@/services/goodsReceipt.service");
jest.mock("@/services/supplier.service");
jest.mock("@/services/productBatch.service");

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
}));

jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

/**
 * The Utang Supplier screens, against mocked services.
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

const INVOICE_ID = "inv1";
const RECEIPT_ID = "gr1";

function listRow(
  overrides: Partial<PurchaseInvoiceListRow> = {},
): PurchaseInvoiceListRow {
  return {
    _id: INVOICE_ID,
    invoiceNumber: "INV/2026/VIII/0142",
    supplierId: "s1",
    supplierName: "PT Sumber Pangan",
    branchId: "b1",
    goodsReceiptId: RECEIPT_ID,
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
    branchName: "Cabang Pusat",
    goodsReceiptNumber: "GR-260806-001",
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
    ...overrides,
  };
}

function receiptDetail(): GoodsReceiptDetail {
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
  };
}

const page = (items: PurchaseInvoiceListRow[], total = items.length) => ({
  items,
  pagination: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
});

beforeEach(() => {
  jest.clearAllMocks();

  asMock(purchaseInvoiceService.list).mockResolvedValue(page([]));
  asMock(purchaseInvoiceService.outstandingSummary).mockResolvedValue(
    summary({ totalOutstanding: "0.0000", totalInvoices: 0 }),
  );
  asMock(purchaseInvoiceService.getById).mockResolvedValue(detail());
  asMock(goodsReceiptService.getById).mockResolvedValue(receiptDetail());
  asMock(goodsReceiptService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  });
  asMock(supplierService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  });
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
   * authoritative.
   */
  it("takes the headline total from the summary endpoint", async () => {
    asMock(purchaseInvoiceService.outstandingSummary).mockResolvedValue(
      summary({ totalOutstanding: "9500000.0000", totalInvoices: 12 }),
    );
    asMock(purchaseInvoiceService.list).mockResolvedValue(page([listRow()]));

    renderWithAuth(<PayablesScreen />);

    expect(await screen.findByText("Rp 9.500.000")).toBeInTheDocument();
    expect(screen.getByText("12 faktur belum lunas")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Jatuh tempo" }));

    await waitFor(() => {
      const calls = asMock(purchaseInvoiceService.list).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({ overdue: true });
    });
  });

  it("sends an exact status for the status views", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PayablesScreen />);

    await waitFor(() => expect(purchaseInvoiceService.list).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Lunas" }));

    await waitFor(() => {
      const calls = asMock(purchaseInvoiceService.list).mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last).toMatchObject({ status: "paid" });
      // The shorthands must not ride along: the server takes the explicit
      // status and silently drops them, so sending both hides the disagreement.
      expect(last).not.toHaveProperty("outstanding");
      expect(last).not.toHaveProperty("overdue");
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

describe("InvoiceDetail", () => {
  it("shows the balance and the payment form for an unpaid bill", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("INV/2026/VIII/0142")).toBeInTheDocument();
    expect(screen.getByLabelText("Jumlah dibayar")).toBeInTheDocument();
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
            method: "transfer",
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

    await user.type(await screen.findByLabelText("Jumlah dibayar"), "66500");
    await user.click(screen.getByRole("button", { name: "Simpan pembayaran" }));

    await waitFor(() =>
      expect(purchaseInvoiceService.recordPayment).toHaveBeenCalledWith(
        INVOICE_ID,
        expect.objectContaining({ amount: "66500", method: "transfer" }),
      ),
    );

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

    await user.type(await screen.findByLabelText("Jumlah dibayar"), "999999999");
    await user.click(screen.getByRole("button", { name: "Simpan pembayaran" }));

    expect(
      await screen.findByText(/Jumlah melebihi sisa tagihan/),
    ).toBeInTheDocument();
    expect(purchaseInvoiceService.recordPayment).not.toHaveBeenCalled();
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

    await user.type(await screen.findByLabelText("Jumlah dibayar"), "1000");

    const submit = screen.getByRole("button", { name: "Simpan pembayaran" });
    await user.click(submit);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Menyimpan…" })).toBeDisabled(),
    );

    await user.click(screen.getByRole("button", { name: "Menyimpan…" }));
    expect(purchaseInvoiceService.recordPayment).toHaveBeenCalledTimes(1);

    release(detail());
  });

  it("shows the backend's refusal verbatim", async () => {
    asMock(purchaseInvoiceService.recordPayment).mockRejectedValue(
      new ApiError("Invoice INV/2026/VIII/0142 is already settled", 409, {
        reason: "There is nothing left outstanding to pay",
      }),
    );

    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await user.type(await screen.findByLabelText("Jumlah dibayar"), "1000");
    await user.click(screen.getByRole("button", { name: "Simpan pembayaran" }));

    // `fullMessage` — the message plus the reason, which is the half that says
    // what to do next.
    expect(
      await screen.findByText(/nothing left outstanding to pay/),
    ).toBeInTheDocument();
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
    expect(screen.queryByLabelText("Jumlah dibayar")).not.toBeInTheDocument();
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

    expect(await screen.findByText("INV/2026/VIII/0142")).toBeInTheDocument();
    expect(screen.queryByLabelText("Jumlah dibayar")).not.toBeInTheDocument();
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

  // The lines belong to the goods receipt, not the invoice. A clerk who came to
  // pay a bill can still pay it when they fail to load.
  it("stays usable when the delivery's lines cannot be loaded", async () => {
    asMock(goodsReceiptService.getById).mockRejectedValue(
      new ApiError("Server error", 500),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByLabelText("Jumlah dibayar")).toBeInTheDocument();
    expect(
      screen.getByText(/Rincian barang tidak dapat dimuat/),
    ).toBeInTheDocument();
  });

  it("names the journal entry behind each payment", async () => {
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

    // The only handle anyone has on a wrong payment: it cannot be edited or
    // deleted, so correcting one means reversing the entry it posted.
    expect(await screen.findByText("je9")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------ file a bill */

describe("FileInvoiceForm", () => {
  beforeEach(() => {
    asMock(goodsReceiptService.list).mockResolvedValue({
      items: [receiptRow()],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
  });

  /**
   * BOTH FILTERS ARE THE SERVER'S. A consignment delivery can never be invoiced
   * on arrival, and a page filtered client-side on `invoiceId === null` hides
   * rows the pager already counted.
   */
  it("asks the server for unbilled outright deliveries only", async () => {
    renderWithAuth(<FileInvoiceForm />);

    await waitFor(() => expect(goodsReceiptService.list).toHaveBeenCalled());

    expect(goodsReceiptService.list).toHaveBeenCalledWith(
      expect.objectContaining({ invoiced: false, purchaseType: "beli_putus" }),
    );
  });

  it("explains the empty state without blaming the user", async () => {
    asMock(goodsReceiptService.list).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });

    renderWithAuth(<FileInvoiceForm />);

    expect(
      await screen.findByText("Tidak ada penerimaan yang menunggu faktur."),
    ).toBeInTheDocument();
  });

  /**
   * THE AMOUNTS ARE NOT EDITABLE. They must equal the receipt's to the minor
   * unit or the API refuses the request, so the only thing an input could do is
   * introduce a failure — see the component header.
   */
  it("copies the amounts from the receipt rather than asking for them", async () => {
    asMock(purchaseInvoiceService.create).mockResolvedValue(detail());

    const user = userEvent.setup();
    renderWithAuth(<FileInvoiceForm receiptId={RECEIPT_ID} />);

    await user.type(
      await screen.findByLabelText(/Nomor faktur supplier/),
      "INV/2026/VIII/0142",
    );
    await user.click(screen.getByRole("button", { name: "Catat faktur" }));

    await waitFor(() =>
      expect(purchaseInvoiceService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          goodsReceiptId: RECEIPT_ID,
          // The receipt's EX-TAX value is exactly what `subtotal` means here.
          subtotal: "150000.0000",
          taxAmount: "16500.0000",
          // Never picked: billing one vendor for another's delivery pays the
          // wrong company and leaves the right one still owed.
          supplierId: "s1",
        }),
      ),
    );

    expect(screen.queryByLabelText(/Subtotal/)).not.toBeInTheDocument();
  });

  it("shows a reconcile refusal in full", async () => {
    asMock(purchaseInvoiceService.create).mockRejectedValue(
      new ApiError(
        "Goods receipt GR-260806-001 has already been invoiced",
        409,
        { reason: "Invoice INV/2026/VIII/0001 already bills this delivery" },
      ),
    );

    const user = userEvent.setup();
    renderWithAuth(<FileInvoiceForm receiptId={RECEIPT_ID} />);

    await user.type(
      await screen.findByLabelText(/Nomor faktur supplier/),
      "INV/2026/VIII/0142",
    );
    await user.click(screen.getByRole("button", { name: "Catat faktur" }));

    expect(
      await screen.findByText(/already bills this delivery/),
    ).toBeInTheDocument();
  });

  it("says so when the picker had to truncate", async () => {
    asMock(goodsReceiptService.list).mockResolvedValue({
      items: [receiptRow()],
      pagination: { page: 1, limit: 100, total: 140, totalPages: 2 },
    });

    renderWithAuth(<FileInvoiceForm />);

    // A picker that silently drops options reads as "there are no more".
    expect(
      await screen.findByText(/Hanya 1 penerimaan pertama yang ditampilkan/),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------- hub */

describe("PurchasingHub payables panels", () => {
  function panel(title: string): HTMLElement {
    return screen.getByText(title).closest("section")!;
  }

  it("takes the overdue count and total from the summary endpoint", async () => {
    asMock(purchaseInvoiceService.outstandingSummary).mockResolvedValue(
      summary({
        totalOutstanding: "9500000.0000",
        totalInvoices: 12,
        totalOverdueInvoices: 7,
        totalOverdueOutstanding: "2750000.0000",
      }),
    );
    asMock(purchaseInvoiceService.list).mockResolvedValue(
      page([listRow({ isOverdue: true })], 7),
    );

    renderWithAuth(<PurchasingHub />);

    // The whole bucket, not the rows shown — "1" beside one of seven rows would
    // say the job was nearly done.
    await waitFor(() =>
      expect(within(panel("Lewat jatuh tempo")).getByText("7")).
        toBeInTheDocument(),
    );
    expect(
      within(panel("Lewat jatuh tempo")).getByText("Rp 2.750.000"),
    ).toBeInTheDocument();
  });

  /**
   * `dueBefore` bounds only the far end of the window, so the API's answer
   * necessarily includes everything already late. The two panels are read side
   * by side and their totals added up, so an invoice in both would be counted
   * twice.
   */
  it("keeps an already-late invoice out of the due-soon panel", async () => {
    asMock(purchaseInvoiceService.outstandingSummary).mockResolvedValue(
      summary({ totalOverdueInvoices: 1, totalOverdueOutstanding: "50000.0000" }),
    );
    asMock(purchaseInvoiceService.list).mockImplementation(async (query) => {
      if (query?.overdue) return page([listRow({ isOverdue: true })], 1);
      // The due-soon read: both the late one and a genuinely upcoming one.
      return page(
        [
          listRow({ _id: "late", isOverdue: true }),
          listRow({
            _id: "soon",
            invoiceNumber: "INV/2026/VIII/0200",
            supplierName: "CV Mitra Ternak",
            outstandingAmount: "80000.0000",
          }),
        ],
        2,
      );
    });

    renderWithAuth(<PurchasingHub />);

    await waitFor(() =>
      expect(
        within(panel("Jatuh tempo minggu ini")).getByText("CV Mitra Ternak"),
      ).toBeInTheDocument(),
    );

    const soon = panel("Jatuh tempo minggu ini");
    expect(within(soon).queryByText("PT Sumber Pangan")).not.toBeInTheDocument();
    // Twice: as the panel's total and as the row's own amount. That they are
    // equal IS the assertion — the total covers the one upcoming invoice, not
    // the two the API returned.
    expect(within(soon).getAllByText("Rp 80.000")).toHaveLength(2);
  });

  it("issues no payables requests for a role that may not read them", async () => {
    renderWithAuth(<PurchasingHub />, {
      isSuperAdmin: false,
      permissions: [{ feature: "suppliers", actions: ["read"] }],
    });

    await screen.findByText("Supplier");

    expect(screen.queryByText("Utang Supplier")).not.toBeInTheDocument();
    expect(screen.queryByText("Lewat jatuh tempo")).not.toBeInTheDocument();
    expect(purchaseInvoiceService.list).not.toHaveBeenCalled();
    expect(purchaseInvoiceService.outstandingSummary).not.toHaveBeenCalled();
  });

  it("says so plainly when nothing is due", async () => {
    renderWithAuth(<PurchasingHub />);

    expect(
      await screen.findByText("Tidak ada faktur yang lewat jatuh tempo."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tidak ada faktur yang jatuh tempo dalam 7 hari/),
    ).toBeInTheDocument();
  });
});
