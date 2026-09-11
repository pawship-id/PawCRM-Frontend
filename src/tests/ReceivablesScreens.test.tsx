import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";

import { InvoiceDetail, ReceivablesScreen } from "@/features/sales";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { customerService } from "@/services/customer.service";
import { branchService } from "@/services/branch.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import { tenantService } from "@/services/tenant.service";
import { ApiError } from "@/services/api-error";
import type {
  CustomerInvoiceDetail,
  CustomerInvoiceListRow,
  CustomerInvoicePayment,
} from "@/types/api";

import { swalToast } from "@/lib/swal";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customerInvoice.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/paymentChannel.service");
// The kwitansi's header reads the shop's own details.
jest.mock("@/services/tenant.service");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

/**
 * The module header — the title and the four-tab row — is reduced to the one
 * thing this screen puts INTO it: the Buat faktur button, which this suite is
 * genuinely about. The tab row needs a router this suite has no reason to stand
 * up, and the header's own behaviour has its own suite
 * (SalesModuleHeader.test.tsx).
 */
jest.mock("@/features/sales/components/SalesModuleHeader", () => ({
  SalesModuleHeader: ({ action }: { action?: React.ReactNode }) =>
    action ?? null,
}));

jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

/*
  REFUSALS ARE TOASTS on these screens, not inline alerts — a deliberate
  departure from ui-rules §9, asked for after the first build. So the assertions
  read `swalToast` rather than `role="alert"`: there is no alert in the DOM to
  find, and a test looking for one would pass only by never reaching the refusal.
*/
const toast = swalToast as jest.MockedFunction<typeof swalToast>;

/**
 * The Faktur Penjualan screens, against mocked services.
 *
 * WHAT THESE TESTS GUARD — every one of them is a way this screen could drift
 * back into computing in the browser what the server already answered:
 *
 *  1. `outstandingAmount` AND `isOverdue` COME FROM THE SERVER. A row rendered
 *     from locally recomputed arithmetic would disagree with the banner above it
 *     the first time a due date fell mid-render;
 *  2. THE VIEW FILTERS GO OVER THE WIRE as `outstanding` / `overdue` / `dueSoon`
 *     booleans. A client-side filter shows four rows above a pager claiming
 *     twenty;
 *  3. THE HEADLINE TOTALS ARE THE WHOLE BOOK, from `/outstanding` — never summed
 *     from the page, which would grow as the user pages;
 *  4. a payment cannot be double-submitted, because `POST /:id/payments` is not
 *     idempotent and would book the money arriving twice on two irreversible
 *     entries;
 *  5. `pay` is gated separately from `read`, which is the separation of duties
 *     the backend enforces;
 *  6. the channel picker asks for channels that can RECEIVE (`usableFor: "in"`)
 *     — one letter away from the payables form, and the server refuses the
 *     other direction.
 *
 * The Radix selects are not driven — jsdom cannot do their pointer protocol — so
 * the payment tests rely on the single-channel pre-selection and assert on the
 * payload.
 */
const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

const INVOICE_ID = "inv1";
const BRANCH_ID = "b1";
const CUSTOMER_ID = "c1";

function listRow(
  overrides: Partial<CustomerInvoiceListRow> = {},
): CustomerInvoiceListRow {
  return {
    _id: INVOICE_ID,
    invoiceNumber: "INV-2026-0042",
    customerId: CUSTOMER_ID,
    customerName: "Bu Sari",
    branchId: BRANCH_ID,
    branchName: "Cabang Pusat",
    posTransactionId: "pos1",
    source: "pos_bridge",
    invoiceDate: "2026-08-06T00:00:00.000Z",
    dueDate: "2026-09-05T00:00:00.000Z",
    total: "300000.0000",
    paidAmount: "0.0000",
    outstandingAmount: "300000.0000",
    isOverdue: false,
    status: "unpaid",
    paymentCount: 0,
    notes: null,
    ...overrides,
  };
}

function detail(
  overrides: Partial<CustomerInvoiceDetail> = {},
): CustomerInvoiceDetail {
  // The detail shape is the list row WITHOUT `paymentCount` — it carries the
  // payments themselves instead, so the count would be a second source of truth.
  const row: Omit<CustomerInvoiceListRow, "paymentCount"> & {
    paymentCount?: number;
  } = { ...listRow() };
  delete row.paymentCount;

  return {
    ...row,
    createdByName: null,
    payments: [],
    journalEntryId: "je-sale",
    // Empty and null, which is what a TILL-BORN invoice carries: its lines live
    // on the POS transaction, and its breakdown on that transaction's totals.
    items: [],
    invoiceDiscount: null,
    totals: null,
    warehouseId: null,
    channel: "manual",
    voidedAt: null,
    voidReason: null,
    journalEntries: [],
    bookings: [],
    stockImpact: [],
    credit: null,
    ...overrides,
  };
}

const page = (items: CustomerInvoiceListRow[]) => ({
  items,
  pagination: {
    page: 1,
    limit: 20,
    total: items.length,
    totalPages: items.length === 0 ? 0 : 1,
  },
});

const optionPage = <T,>(items: T[]) =>
  ({
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  }) as never;

beforeEach(() => {
  jest.clearAllMocks();

  /*
    The payment form reads the tenant's INCOMING channels — where the money
    lands. One BCA account, which the form pre-selects.
  */
  asMock(paymentChannelService.list).mockResolvedValue(
    optionPage([
      {
        _id: "chan-bca",
        type: "transfer",
        name: "BCA Operasional",
        accountId: "acc-bca",
        usableFor: ["in", "out"],
        isActive: true,
      },
    ]),
  );

  asMock(tenantService.me).mockResolvedValue({
    _id: "t1",
    name: "Buloo Petshop",
  } as never);

  asMock(customerInvoiceService.list).mockResolvedValue(page([]) as never);
  // The list screen's cards and filter options — its own suite is
  // SalesInvoiceList.test.tsx; here they only need to answer.
  asMock(customerInvoiceService.summary).mockRejectedValue(
    new ApiError("not under test", 500),
  );
  asMock(customerInvoiceService.filterOptions).mockResolvedValue({
    branches: [],
    warehouses: [],
    creators: [],
  });
  asMock(customerInvoiceService.getById).mockResolvedValue(detail());
  // The activity log is read with the page, for the count on its fold.
  asMock(customerInvoiceService.activity).mockResolvedValue({ items: [] });
  asMock(customerService.list).mockResolvedValue(
    optionPage([{ _id: CUSTOMER_ID, name: "Bu Sari" }]),
  );
  asMock(branchService.list).mockResolvedValue(
    optionPage([{ _id: BRANCH_ID, name: "Cabang Pusat", isActive: true }]),
  );
});

/* ------------------------------------------------------------------- list */

/*
  THE LIST SCREEN'S OWN SUITE MOVED to SalesInvoiceList.test.tsx with the
  September 2026 layout — scope bar, four cards, sortable headers, row actions.
  The walk-in case below stays here because it is about the shared
  "Pelanggan umum" rule, which the detail screen follows too.
*/

/* ----------------------------------------------------------------- detail */

describe("InvoiceDetail", () => {
  it("shows the server's outstanding figure beside what was billed and paid", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        total: "300000.0000",
        paidAmount: "100000.0000",
        outstandingAmount: "200000.0000",
        status: "partial",
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    /*
      Scoped to its own row: the payment form's "Maksimal …" hint carries the
      same figure, which is the point — but this assertion is about the summary.

      "Sisa", not "Sisa tagihan": the figure moved into the status panel in the
      side column, where the three rows above it already say what they are.
    */
    const label = await screen.findByText("Sisa");
    const row = label.parentElement as HTMLElement;
    expect(within(row).getByText(/Rp\s?200\.000/)).toBeInTheDocument();
  });

  it("names the till when nobody typed the invoice", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("Otomatis dari kasir")).toBeInTheDocument();
  });

  /*
    THE WAY BACK BELONGS TO THE DEAD END, not to the working page. A loaded
    invoice already has the breadcrumb above it; a second "Semua faktur
    penjualan" at the foot was a duplicate of a control that never left the
    screen. It stays in the not-found state below, which has nothing else on it.
  */
  it("carries no back link on an invoice that loaded", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await screen.findByText("Otomatis dari kasir");
    expect(
      screen.queryByRole("link", { name: /Semua faktur penjualan/ }),
    ).not.toBeInTheDocument();
  });

  it("offers a way back rather than a retry when the id does not resolve", async () => {
    asMock(customerInvoiceService.getById).mockRejectedValue(
      new ApiError("Invoice not found", 404),
    );

    renderWithAuth(<InvoiceDetail invoiceId="nope" />);

    expect(
      await screen.findByText("Faktur tidak ditemukan."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Semua faktur penjualan/ }),
    ).toBeInTheDocument();
  });

  it("hides the payment form once the invoice is settled", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        status: "paid",
        paidAmount: "300000.0000",
        outstandingAmount: "0.0000",
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("Faktur ini sudah lunas.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Jumlah diterima")).not.toBeInTheDocument();
  });

  it("hides it on a voided invoice too — there is nothing to collect", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({ status: "void" }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByText(/Tidak ada yang bisa ditagih/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Jumlah diterima")).not.toBeInTheDocument();
  });

  /* --- THE SEPARATION OF DUTIES --- */

  it("shows a read-only role the picture and no way to take money", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "customerInvoices", actions: ["read"] }],
    });

    expect(
      await screen.findByRole("heading", { name: "INV-2026-0042" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Jumlah diterima")).not.toBeInTheDocument();
    expect(screen.getByText(/customerInvoices:pay/)).toBeInTheDocument();
  });

  /* --- the payment --- */

  it("asks for channels that can RECEIVE, not pay out", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    await openPaymentDialog(user);

    await waitFor(() =>
      expect(paymentChannelService.list).toHaveBeenCalledWith(
        expect.objectContaining({ usableFor: "in" }),
      ),
    );
  });

  it("records a payment and renders the invoice the write returned", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.recordPayment).mockResolvedValue(
      detail({
        status: "partial",
        paidAmount: "100000.0000",
        outstandingAmount: "200000.0000",
        payments: [
          {
            paymentId: "pay1",
            paymentNumber: "PMT-2026-0001",
            at: "2026-08-27T00:00:00.000Z",
            amount: "100000.0000",
            method: "transfer",
            channelId: "chan-bca",
            channelName: "BCA Operasional",
            ref: "TRF-1",
            byUserId: "u1",
            byUserName: "Rani",
            journalEntryId: "je-pay1",
            journalEntryNumber: "JE-2026-08-0412",
            reversalJournalEntryNumber: null,
            isVoided: false,
            voidedAt: null,
            voidedBy: null,
            voidReason: null,
            reversalJournalEntryId: null,
          },
        ],
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    await openPaymentDialog(user);

    await user.type(
      await screen.findByLabelText("Jumlah diterima"),
      "100000",
    );
    await user.click(screen.getByRole("button", { name: "Simpan pembayaran" }));

    await waitFor(() =>
      expect(customerInvoiceService.recordPayment).toHaveBeenCalledWith(
        INVOICE_ID,
        expect.objectContaining({
          amount: "100000",
          method: "transfer",
          channelId: "chan-bca",
        }),
      ),
    );

    // NOT a refetch: the response IS the new state of the document, rendered
    // straight into the history below.
    expect(await screen.findByText(/Transfer — BCA Operasional/)).toBeInTheDocument();
    expect(customerInvoiceService.getById).toHaveBeenCalledTimes(1);
  });

  it("fills the amount with what is outstanding when Lunasi is pressed", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    await openPaymentDialog(user);

    await user.click(await screen.findByRole("button", { name: "Lunasi" }));

    /*
      TRIMMED, not "300000.0000". `toDecimalString` always writes four decimal
      places — the scale the ledger stores — and a box pre-filled with them reads
      at a glance as a far larger number than it is.

      A REAL FRACTION WOULD SURVIVE: only trailing zeros go. The case below
      proves it, because rounding to whole rupiah here would quietly change what
      is about to be paid.
    */
    expect(await screen.findByLabelText("Jumlah diterima")).toHaveValue(
      "300000",
    );
  });

  it("keeps a fraction the outstanding actually has", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({ outstandingAmount: "155400.5000" }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    await openPaymentDialog(user);

    await user.click(await screen.findByRole("button", { name: "Lunasi" }));

    expect(screen.getByLabelText("Jumlah diterima")).toHaveValue("155400.5");
  });

  /*
    THE FIGURE ECHOED BACK IN RUPIAH. The box stays a plain number — grouping it
    as the caret moves fights the caret — so the formatting happens underneath,
    where it can be checked without being edited.
  */
  it("echoes what was typed as rupiah, beside the ceiling", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    await openPaymentDialog(user);

    await user.type(await screen.findByLabelText("Jumlah diterima"), "38850");

    expect(
      screen.getByText(/Rp 38\.850 · maksimal Rp 300\.000/),
    ).toBeInTheDocument();
  });

  it("shows only the ceiling while the box is empty", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    await openPaymentDialog(user);

    // "Rp 0" under an empty field is a figure nobody entered.
    expect(await screen.findByText("Maksimal Rp 300.000")).toBeInTheDocument();
  });

  it("refuses more than what is outstanding before spending a round trip", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    await openPaymentDialog(user);

    await user.type(await screen.findByLabelText("Jumlah diterima"), "400000");
    await user.click(screen.getByRole("button", { name: "Simpan pembayaran" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringMatching(/melebihi/i),
        "error",
      ),
    );
    expect(customerInvoiceService.recordPayment).not.toHaveBeenCalled();
  });

  it("refuses a payment of zero", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    await openPaymentDialog(user);

    await user.type(await screen.findByLabelText("Jumlah diterima"), "0");
    await user.click(screen.getByRole("button", { name: "Simpan pembayaran" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.any(String), "error"),
    );
    expect(customerInvoiceService.recordPayment).not.toHaveBeenCalled();
  });

  /*
    THE ONE THAT MATTERS MOST. `POST /:id/payments` has no idempotency key, so a
    double-click books the money arriving twice on two irreversible entries.
  */
  it("cannot be double-submitted", async () => {
    const user = userEvent.setup();
    let release: (value: CustomerInvoiceDetail) => void = () => {};
    asMock(customerInvoiceService.recordPayment).mockReturnValue(
      new Promise<CustomerInvoiceDetail>((resolve) => {
        release = resolve;
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    await openPaymentDialog(user);

    await user.type(await screen.findByLabelText("Jumlah diterima"), "100000");
    const submit = screen.getByRole("button", { name: "Simpan pembayaran" });

    await user.click(submit);
    await user.click(submit);

    expect(customerInvoiceService.recordPayment).toHaveBeenCalledTimes(1);

    release(detail({ status: "partial" }));
  });

  it("shows the server's refusal verbatim when somebody paid first", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.recordPayment).mockRejectedValue(
      new ApiError(
        "Invoice INV-2026-0042 was paid by someone else while this payment was being recorded",
        409,
      ),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    await openPaymentDialog(user);

    await user.type(await screen.findByLabelText("Jumlah diterima"), "100000");
    await user.click(screen.getByRole("button", { name: "Simpan pembayaran" }));

    /*
      LONGER THAN THE DEFAULT, and asserted: this message tells the user to
      reload and re-check a balance. A three-second toast carrying an instruction
      is one nobody finishes reading.
    */
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringMatching(/paid by someone else/),
        "error",
        8000,
      ),
    );
  });

  it("names the account each payment landed in, for reconciliation", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        status: "partial",
        paidAmount: "100000.0000",
        outstandingAmount: "200000.0000",
        payments: [
          {
            paymentId: "pay1",
            paymentNumber: "PMT-2026-0001",
            at: "2026-08-27T00:00:00.000Z",
            amount: "100000.0000",
            method: "transfer",
            channelId: "chan-bca",
            channelName: "BCA Operasional",
            ref: null,
            byUserId: "u1",
            byUserName: "Rani",
            journalEntryId: "je-pay1",
            journalEntryNumber: "JE-2026-08-0412",
            reversalJournalEntryNumber: null,
            isVoided: false,
            voidedAt: null,
            voidedBy: null,
            voidReason: null,
            reversalJournalEntryId: null,
          },
        ],
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByText(/Transfer — BCA Operasional/),
    ).toBeInTheDocument();
    /*
      THE ROW OPENS THE PAYMENT'S OWN PAGE, which is where its journal entry,
      its kwitansi and its cancellation live now — see
      InvoicePaymentDetail.test.tsx.
    */
    const row = screen.getByRole("link", {
      name: /Transfer — BCA Operasional/,
    });
    expect(row).toHaveAttribute(
      "href",
      "/dashboard/sales/inv1/payments/pay1",
    );
    // The payment's own number, above the amount.
    expect(within(row).getByText("PMT-2026-0001")).toBeInTheDocument();
  });

  it("falls back to the amount alone on a payment recorded before numbering existed", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        status: "partial",
        paidAmount: "100000.0000",
        outstandingAmount: "200000.0000",
        payments: [
          {
            paymentId: "pay1",
            paymentNumber: null,
            at: "2026-08-27T00:00:00.000Z",
            amount: "100000.0000",
            method: "transfer",
            channelId: "chan-bca",
            channelName: "BCA Operasional",
            ref: null,
            byUserId: "u1",
            byUserName: "Rani",
            journalEntryId: "je-pay1",
            journalEntryNumber: "JE-2026-08-0412",
            reversalJournalEntryNumber: null,
            isVoided: false,
            voidedAt: null,
            voidedBy: null,
            voidReason: null,
            reversalJournalEntryId: null,
          },
        ],
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    const row = await screen.findByRole("link", {
      name: /Transfer — BCA Operasional/,
    });
    expect(within(row).queryByText(/^PMT-/)).not.toBeInTheDocument();
  });
});

/* ============ PCR-032 — membatalkan pembayaran, dan kwitansinya ============ */

const PAYMENT_ID = "pay1";

const paymentRow = (
  overrides: Partial<CustomerInvoicePayment> = {},
): CustomerInvoicePayment => ({
  paymentId: PAYMENT_ID,
  paymentNumber: "PMT-2026-0001",
  at: "2026-08-27T00:00:00.000Z",
  amount: "100000.0000",
  method: "transfer",
  channelId: "chan-bca",
  channelName: "BCA Operasional",
  ref: "TRF-1",
  byUserId: "u1",
  byUserName: "Rani",
  journalEntryId: "je-pay1",
  journalEntryNumber: "JE-2026-08-0412",
  isVoided: false,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  reversalJournalEntryId: null,
  reversalJournalEntryNumber: null,
  ...overrides,
});

/**
 * A WALK-IN'S FAKTUR — the shape every cash till sale now produces.
 *
 * Since a paid sale raises an invoice too, most rows on this list have nobody
 * attached: somebody bought a bag of feed and left. Two nulls that mean opposite
 * things meet here, and the ID is what tells them apart — a name that is missing
 * because there was never a customer, and one missing because somebody deleted
 * the customer, whose debt still stands.
 */
/**
 * A TILL-BORN FAKTUR READS LIKE A HAND-RAISED ONE.
 *
 * The document stores no lines and no settlement of its own; the detail read
 * joins both from the sale. What this pins is the WIRING — that the joined data
 * reaches the same table and that the till's money gets its own card rather than
 * a row in the collection history, where it would carry a Batalkan button over
 * an entry that does not exist.
 */
describe("InvoiceDetail — a sale joined from the till", () => {
  const withSale = (overrides = {}) =>
    detail({
      posTransactionId: "pos-1",
      source: "pos_bridge",
      status: "paid",
      paidAmount: "190000.0000",
      outstandingAmount: "0.0000",
      total: "190000.0000",
      payments: [],
      items: [
        {
          kind: "product",
          refId: "p1",
          name: "Kalung Nylon",
          sku: "KLG",
          qty: "2.0000",
          unitPrice: "100000.0000",
          discount: null,
          lineTotal: "200000.0000",
          hppAtTime: null,
          dpp: null,
          tax: null,
          bookingId: null,
    bookingItemId: null,
          petId: null,
          petName: null,
          groomerName: null,
        },
      ],
      totals: {
        subtotal: "200000.0000",
        itemDiscount: "0.0000",
        invoiceDiscount: "20000.0000",
        dpp: "190000.0000",
        tax: "0.0000",
        grandTotal: "190000.0000",
        otherCharges: "10000.0000",
      },
      otherCharges: [{ label: "Ongkos kirim", amount: "10000.0000" }],
      posSettlement: {
        transactionNumber: "TRX-2026-0007",
        paidAt: "2026-09-01T03:00:00.000Z",
        payments: [
          {
            channelId: "ch1",
            channelName: "Kas Laci",
            channelType: "cash",
            amount: "200000.0000",
            change: "10000.0000",
            reference: null,
          },
        ],
        credit: "0.0000",
      },
      ...overrides,
    });

  it("shows the basket's lines instead of pointing at another screen", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(withSale());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("Kalung Nylon")).toBeInTheDocument();
    expect(
      screen.queryByText(/barisnya tercatat di transaksi kasirnya/i),
    ).not.toBeInTheDocument();
  });

  // Removed on request (11 Sep 2026): the page had no need for a card of its own.
  it("gives the counter's money no card of its own", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(withSale());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await screen.findByText("Kalung Nylon");
    expect(screen.queryByText("Pembayaran di kasir")).not.toBeInTheDocument();
  });

  /*
    "Belum ada pembayaran tercatat" beside a status reading Lunas is a
    contradiction — and on a settled cash sale there is nothing left to collect.
  */
  it("drops the collection history on a settled cash sale", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(withSale());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await screen.findByText("Kalung Nylon");
    expect(
      screen.queryByText(/belum ada pembayaran tercatat/i),
    ).not.toBeInTheDocument();
  });

  /*
    BUT KEEPS IT ON A CREDIT SALE, where instalments against the remainder are
    exactly what that list is for.
  */
  it("keeps the collection history on a sale part-paid at the counter", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      withSale({
        status: "unpaid",
        paidAmount: "0.0000",
        total: "90000.0000",
        outstandingAmount: "90000.0000",
        posSettlement: {
          transactionNumber: "TRX-2026-0008",
          paidAt: "2026-09-01T03:00:00.000Z",
          payments: [],
          credit: "90000.0000",
        },
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByText(/belum ada pembayaran tercatat/i),
    ).toBeInTheDocument();
  });

  /*
    ONE RECAP, NOT TWO. The table lays out the full breakdown including the rows
    the invoice shape has no field for; the block underneath would repeat a
    shorter version that disagrees about what the customer paid.
  */
  it("does not print a second breakdown underneath the table", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(withSale());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await screen.findByText("Kalung Nylon");
    expect(screen.queryByText("Dasar pengenaan pajak")).not.toBeInTheDocument();
  });
});

describe("a faktur with no customer", () => {
  it("names a walk-in rather than accusing the shop of losing a record", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        customerId: null,
        customerName: null,
        status: "paid",
        paidAmount: "300000.0000",
        outstandingAmount: "0.0000",
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findAllByText("Pelanggan umum")).not.toHaveLength(0);
    expect(screen.queryByText("Pelanggan terhapus")).not.toBeInTheDocument();
  });

  it("still says terhapus when there WAS a customer and the name is gone", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({ customerId: CUSTOMER_ID, customerName: null }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findAllByText("Pelanggan terhapus")).not.toHaveLength(0);
  });

  it("lists a walk-in on the receivables table by the same rule", async () => {
    asMock(customerInvoiceService.list).mockResolvedValue(
      page([listRow({ customerId: null, customerName: null })]) as never,
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(await screen.findByText("Pelanggan umum")).toBeInTheDocument();
  });
});

/* =================== regressions found in UI verification =================== */

describe("InvoiceDetail — the submit lock", () => {
  /*
    THE BUG THIS GUARDS. `saving` used to be released only on failure, on the
    reasoning that success unmounts the form — which holds only when the invoice
    becomes SETTLED. After a PARTIAL payment the parent re-renders the same
    element in the same position, React keeps the component's state, and the
    button stayed disabled with a spinner until the page was reloaded.
  */
  it("re-enables the button after a partial payment, without a reload", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.recordPayment).mockResolvedValue(
      detail({
        status: "partial",
        paidAmount: "100000.0000",
        outstandingAmount: "200000.0000",
        payments: [paymentRow()],
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);
    await openPaymentDialog(user);

    await user.type(await screen.findByLabelText("Jumlah diterima"), "100000");
    await user.click(screen.getByRole("button", { name: "Simpan pembayaran" }));

    await waitFor(() =>
      expect(customerInvoiceService.recordPayment).toHaveBeenCalled(),
    );

    /*
      THE DIALOG CLOSES ON SUCCESS, so the original shape of this guard — "the
      button is still there and usable" — no longer applies. What still has to
      hold is the same fact one step later: REOPENING gives a form that works.
      A `saving` flag never released would come back locked.
    */
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    await openPaymentDialog(user);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Simpan pembayaran" }),
      ).toBeEnabled(),
    );
  });

  /*
    AND IT COMES BACK EMPTY. A dialog closed halfway through and reopened must
    not still hold the amount somebody typed and abandoned — the most likely next
    action is to press Simpan.
  */
  it("reopens clean rather than holding an abandoned amount", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await openPaymentDialog(user);
    await user.type(await screen.findByLabelText("Jumlah diterima"), "12345");
    await user.click(screen.getByRole("button", { name: "Batal" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    await openPaymentDialog(user);

    expect(await screen.findByLabelText("Jumlah diterima")).toHaveValue("");
  });
});

/**
 * THE SIDE COLUMN — the STATE of the invoice rather than the document.
 *
 * The screen used to be one grid with every card dropped in sequentially, so the
 * browser decided which column each landed in — and the answer changed with the
 * invoice, because a card that does not render shifts everything after it. It
 * read as a different screen for every bill.
 */
/**
 * Opens the payment dialog, which is where the form now lives.
 *
 * IT USED TO BE A CARD sitting open on the detail screen for every unpaid
 * invoice — a form in front of everybody who came to READ one, and most visits
 * are reads. Behind a button it is one click away for whoever came to record a
 * payment and out of the way for everybody else.
 */
async function openPaymentDialog(user: UserEvent) {
  await user.click(
    await screen.findByRole("button", { name: /Catat pembayaran/ }),
  );
  return within(await screen.findByRole("dialog"));
}

describe("InvoiceDetail — the status panel", () => {
  it("shows how far along the bill is, as a figure not just a bar", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        total: "300000.0000",
        paidAmount: "100000.0000",
        outstandingAmount: "200000.0000",
        status: "partial",
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    // A bar alone is a shape nobody can quote.
    expect(await screen.findByText(/33% terbayar/)).toBeInTheDocument();
  });

  /*
    AN INVOICE FOR NOTHING would divide by zero and render `NaN%`, which paints a
    full bar — the most misleading answer available.
  */
  it("does not divide by zero on an invoice worth nothing", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        total: "0.0000",
        paidAmount: "0.0000",
        outstandingAmount: "0.0000",
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText(/0% terbayar/)).toBeInTheDocument();
  });

  it("drops the progress line on a voided invoice", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({ status: "void", voidReason: "Salah pelanggan" }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await screen.findByText(/Tidak ada yang bisa ditagih/);
    // There is no progress towards paying something that was never owed.
    expect(screen.queryByText(/terbayar ·/)).not.toBeInTheDocument();
  });
});

/**
 * TAKING MONEY IS BEHIND A BUTTON NOW, not a form sitting open on the page.
 *
 * The card used to be there for every unpaid invoice, which put a form in front
 * of everybody who came to READ one — and most visits are reads.
 */
describe("InvoiceDetail — the payment dialog", () => {
  it("shows no form until somebody asks for one", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await screen.findByText("Rincian faktur");
    expect(screen.queryByLabelText("Jumlah diterima")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Catat pembayaran/ }),
    ).toBeInTheDocument();
  });

  /*
    WHICH INVOICE, AND WHAT IS LEFT — before an amount is typed. The dialog
    covers the screen that would otherwise have said it.
  */
  it("names the invoice and what is left, inside the dialog", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    const dialog = await openPaymentDialog(user);

    expect(dialog.getByText("Sisa tagihan saat ini")).toBeInTheDocument();
    expect(dialog.getByText(/INV-2026-0042/)).toBeInTheDocument();
  });

  /*
    WHAT HAPPENS AFTER SAVE, said before it. "DP sebagian" and "Lunas" are not
    buttons anybody presses, and somebody who does not know that goes looking for
    the step that marks it paid.
  */
  it("says the status will move on its own", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    const dialog = await openPaymentDialog(user);

    expect(dialog.getByText(/tidak ada aksi manual terpisah/)).toBeInTheDocument();
  });

  /*
    THE ORDER OF THE FIELDS IS A DECISION, so it is asserted rather than left to
    whoever edits the form next.

    HOW MUCH AND WHEN COME FIRST, because that is what somebody holding a
    transfer slip reads off it — the method and the account are chosen from what
    they already know. Putting the pickers first makes them answer "which
    account" before they have said what they are recording.
  */
  it("asks how much before it asks how", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    const dialog = await openPaymentDialog(user);

    const order = dialog
      .getAllByText(
        /^(Jumlah diterima|Tanggal terima|Metode|Masuk ke|No\. referensi)$/,
      )
      .map((node) => node.textContent);

    expect(order).toEqual([
      "Jumlah diterima",
      "Tanggal terima",
      "Metode",
      "Masuk ke",
      "No. referensi",
    ]);
  });

  it("offers no button on a settled invoice", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        status: "paid",
        paidAmount: "300000.0000",
        outstandingAmount: "0.0000",
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("Faktur ini sudah lunas.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Catat pembayaran/ }),
    ).not.toBeInTheDocument();
  });

  it("offers no button on a voided invoice", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({ status: "void", voidReason: "Salah pelanggan" }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await screen.findByText(/Tidak ada yang bisa ditagih/);
    expect(
      screen.queryByRole("button", { name: /Catat pembayaran/ }),
    ).not.toBeInTheDocument();
  });

  /*
    A ROLE WITHOUT `pay` IS TOLD, not left to wonder where the button went — the
    separation of duties the backend enforces, made visible instead of discovered
    through a 403.
  */
  it("tells a read-only role why there is no button", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "customerInvoices", actions: ["read"] }],
    });

    expect(
      await screen.findByText(/tidak punya izin mencatat pembayaran/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Catat pembayaran/ }),
    ).not.toBeInTheDocument();
  });
});

describe("InvoiceDetail — what the invoice did to the shelf", () => {
  const withStock = () =>
    detail({
      stockImpact: [
        {
          productId: "p1",
          name: "Royal Canin 2kg",
          qty: "-2.0000",
          before: "18.0000",
          after: "16.0000",
        },
      ],
    });

  /*
    BEFORE AND AFTER, not just the quantity moved. "−2" says what happened;
    "18 → 16" says whether it left the shelf you thought it did.
  */
  it("shows the shelf before and after", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(withStock());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("Dampak stok")).toBeInTheDocument();
    expect(screen.getByText(/18 → 16/)).toBeInTheDocument();
  });

  /* Stock goes when the invoice is ISSUED, which is what surprises people. */
  it("says when the stock actually left", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(withStock());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByText(/Dipotong saat faktur terbit, bukan saat lunas/),
    ).toBeInTheDocument();
  });

  /*
    ABSENT ENTIRELY for a grooming bill. A "Dampak stok" heading over an empty
    card invites the reader to wonder what broke.
  */
  it("draws no card at all when nothing shipped", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(detail());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await screen.findByText("Rincian faktur");
    expect(screen.queryByText("Dampak stok")).not.toBeInTheDocument();
  });

  /* A guess would be a confident pair of numbers nobody can reconcile. */
  it("falls back to the quantity when the balance is unknown", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        stockImpact: [
          {
            productId: "p1",
            name: "Royal Canin 2kg",
            qty: "-2.0000",
            before: null,
            after: null,
          },
        ],
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("-2")).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });
});

describe("InvoiceDetail — what the customer owes altogether", () => {
  it("shows the running receivable and the ceiling", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        credit: {
          customerId: "c1",
          outstanding: "719130.0000",
          invoiceCount: 2,
          creditLimit: "5000000.0000",
          remaining: "4280870.0000",
        },
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("Piutang pelanggan")).toBeInTheDocument();
    expect(screen.getByText("Sisa plafon")).toBeInTheDocument();
  });

  /*
    NO CEILING IS NOT ZERO LEFT. "Tanpa plafon" and "Rp 0 tersisa" are opposite
    facts, and printing the second for the first would stop a sale nobody meant
    to stop.
  */
  it("says there is no ceiling rather than showing zero", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        credit: {
          customerId: "c1",
          outstanding: "719130.0000",
          invoiceCount: 2,
          creditLimit: null,
          remaining: null,
        },
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("Tanpa plafon")).toBeInTheDocument();
    expect(screen.queryByText("Sisa plafon")).not.toBeInTheDocument();
  });

  /* A receivable against somebody since deleted is still a receivable. */
  it("drops the card rather than the page when the customer is gone", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({ credit: null }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await screen.findByText("Rincian faktur");
    expect(screen.queryByText("Piutang pelanggan")).not.toBeInTheDocument();
  });
});

/* ============ the September 2026 layout — `buloo-invoice-detail-v5` ============ */

/**
 * A HAND-RAISED, UNPAID INVOICE — the only kind an edit is offered on. The
 * default fixture is a till-born one, whose lines belong to its sale.
 */
const manualUnpaid = (overrides: Partial<CustomerInvoiceDetail> = {}) =>
  detail({
    source: "manual",
    posTransactionId: null,
    status: "unpaid",
    paidAmount: "0.0000",
    outstandingAmount: "300000.0000",
    payments: [],
    ...overrides,
  });

describe("InvoiceDetail — the title line", () => {
  /*
    THE STATUS BESIDE THE NUMBER IT DESCRIBES, outside the `h1` so the heading's
    name stays the number. The origin sits on the line below, named "Kasir".
  */
  it("puts the status beside the number, and names the till as Kasir", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    const heading = await screen.findByRole("heading", {
      name: "INV-2026-0042",
    });
    const titleLine = heading.parentElement as HTMLElement;
    const block = titleLine.parentElement as HTMLElement;

    expect(within(titleLine).getByText("belum lunas")).toBeInTheDocument();
    expect(within(block).getByText("Kasir")).toBeInTheDocument();
    expect(within(block).queryByText("dari kasir")).not.toBeInTheDocument();
  });

  it("names a hand-raised invoice Manual", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(manualUnpaid());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    const heading = await screen.findByRole("heading", {
      name: "INV-2026-0042",
    });
    const block = (heading.parentElement as HTMLElement)
      .parentElement as HTMLElement;
    expect(within(block).getByText("Manual")).toBeInTheDocument();
  });
});

describe("InvoiceDetail — WhatsApp", () => {
  it("opens a chat with the customer, carrying the bill's figures", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({ customerWhatsApp: "6281234567890" }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    const link = await screen.findByRole("link", { name: /WhatsApp/ });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("https://wa.me/6281234567890?text=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("INV-2026-0042");
    expect(decodeURIComponent(href)).toContain("sisa tagihan Rp 300.000");
  });

  it("is drawn disabled, with its reason, when there is no number", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    const button = await screen.findByRole("button", { name: /WhatsApp/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "title",
      "Pelanggan ini belum punya nomor WhatsApp.",
    );
  });

  it("is not offered on a cancelled invoice", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({ status: "void", customerWhatsApp: "6281234567890" }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await screen.findByText(/Tidak ada yang bisa ditagih/);
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
  });
});

describe("InvoiceDetail — Batalkan faktur, behind the ⋮", () => {
  it("opens the cancellation from the menu beside Cetak", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.getById).mockResolvedValue(manualUnpaid());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await user.click(
      await screen.findByRole("button", { name: "Aksi lain untuk faktur ini" }),
    );
    await user.click(screen.getByRole("menuitem", { name: /Batalkan faktur/ }));

    expect(
      await screen.findByRole("heading", { name: "Batalkan INV-2026-0042?" }),
    ).toBeInTheDocument();
  });

  /*
    WHILE A PAYMENT STILL COUNTS the server refuses a void, but the menu row stays
    clickable: it used to be drawn disabled, which read as broken. The dialog
    opens on the payments to cancel first, each linked to its own page.
  */
  it("opens on the payments to cancel first while one still counts", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        status: "partial",
        paidAmount: "100000.0000",
        outstandingAmount: "200000.0000",
        payments: [
          {
            paymentId: "pay1",
            paymentNumber: "PMT-2026-0001",
            at: "2026-08-27T00:00:00.000Z",
            amount: "100000.0000",
            method: "transfer",
            channelId: "chan-bca",
            channelName: "BCA Operasional",
            ref: null,
            byUserId: "u1",
            byUserName: "Rani",
            journalEntryId: "je-pay1",
            journalEntryNumber: "JE-2026-08-0412",
            reversalJournalEntryNumber: null,
            isVoided: false,
            voidedAt: null,
            voidedBy: null,
            voidReason: null,
            reversalJournalEntryId: null,
          },
        ],
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await user.click(
      await screen.findByRole("button", { name: "Aksi lain untuk faktur ini" }),
    );

    const item = screen.getByRole("menuitem", { name: /Batalkan faktur/ });
    // Clickable — a pale row that did nothing read as a broken menu.
    expect(item).not.toHaveAttribute("aria-disabled", "true");

    await user.click(item);

    expect(
      await screen.findByRole("heading", {
        name: "INV-2026-0042 belum bisa dibatalkan",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /PMT-2026-0001/ }),
    ).toHaveAttribute("href", "/dashboard/sales/inv1/payments/pay1");
  });

  it("offers no menu to a role that may not cancel", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "customerInvoices", actions: ["read", "pay"] }],
    });

    await screen.findByText("Rincian faktur");
    expect(
      screen.queryByRole("button", { name: "Aksi lain untuk faktur ini" }),
    ).not.toBeInTheDocument();
  });
});

describe("InvoiceDetail — the Rincian card's ⋮", () => {
  async function openRincianMenu(user: UserEvent) {
    await user.click(
      await screen.findByRole("button", { name: "Aksi rincian faktur" }),
    );
  }

  it("opens the postings in a dialog", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await openRincianMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Lihat jurnal" }));

    expect(
      await screen.findByRole("heading", { name: "Jurnal faktur" }),
    ).toBeInTheDocument();
  });

  /**
   * EDITING IS OFFERED EXACTLY WHERE THE SERVER WILL ACCEPT IT: raised here,
   * nothing paid, not cancelled, and `update` held. A menu row that 409s is a
   * row that should not have been drawn. The editor itself has its own suite
   * (InvoiceEditor.test.tsx).
   */
  it("offers Ubah rincian on a hand-raised invoice nobody has paid, and opens the editor", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.getById).mockResolvedValue(manualUnpaid());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText(/masih bisa diubah/)).toBeInTheDocument();

    await openRincianMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /Ubah rincian/ }));

    expect(
      await screen.findByText(/Sedang diubah — belum tersimpan/),
    ).toBeInTheDocument();
  });

  it("does not offer Ubah rincian on an invoice raised at the till, and says why", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByText(/barisnya milik transaksi kasir/),
    ).toBeInTheDocument();
    await openRincianMenu(user);
    expect(
      screen.queryByRole("menuitem", { name: /Ubah rincian/ }),
    ).not.toBeInTheDocument();
  });

  it("locks once a payment is recorded", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.getById).mockResolvedValue(
      manualUnpaid({
        status: "partial",
        paidAmount: "100000.0000",
        outstandingAmount: "200000.0000",
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByText(/Terkunci sejak ada pembayaran tercatat/),
    ).toBeInTheDocument();
    await openRincianMenu(user);
    expect(
      screen.queryByRole("menuitem", { name: /Ubah rincian/ }),
    ).not.toBeInTheDocument();
  });

  it("does not offer Ubah rincian to a role without customerInvoices:update", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.getById).mockResolvedValue(manualUnpaid());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "customerInvoices", actions: ["read", "pay", "void"] },
      ],
    });

    await openRincianMenu(user);
    expect(
      screen.queryByRole("menuitem", { name: /Ubah rincian/ }),
    ).not.toBeInTheDocument();
    // The rest of the menu still stands — only the row that 409s is withheld.
    expect(
      screen.getByRole("menuitem", { name: "Lihat jurnal" }),
    ).toBeInTheDocument();
  });
});

describe("InvoiceDetail — Riwayat aktivitas", () => {
  /* Folded, and not fetched until somebody opens it — most visits never do. */
  /** The badge on the fold — its number, and the word a screen reader hears. */
  const badge = (label: string) =>
    screen.queryByText(
      (_content, element) =>
        element?.tagName === "SPAN" && element.textContent === label,
    );

  /*
    THE COUNT IS ON THE CLOSED PANEL, the mockup's badge — which is why the log
    is read with the page rather than when it is opened.
  */
  it("counts what happened on the fold, and lists it when opened", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.activity).mockResolvedValue({
      items: [
        {
          _id: "a2",
          action: "invoice_update",
          at: "2026-09-11T03:10:00.000Z",
          actorName: "Jess",
          metadata: {
            previousTotal: "181000.0000",
            total: "215000.0000",
            lineCount: 3,
          },
          fromDocument: false,
        },
        {
          _id: "issued-inv1",
          action: "invoice_create",
          at: "2026-09-01T02:00:00.000Z",
          actorName: null,
          metadata: { source: "pos_bridge" },
          fromDocument: true,
        },
      ],
    });

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await waitFor(() => expect(badge("2 aktivitas")).toBeInTheDocument());
    expect(customerInvoiceService.activity).toHaveBeenCalledWith(INVOICE_ID);

    await user.click(screen.getByText("Riwayat aktivitas"));

    expect(await screen.findByText("Faktur diubah")).toBeInTheDocument();
    expect(
      screen.getByText("Total Rp 181.000 → Rp 215.000 · 3 baris"),
    ).toBeInTheDocument();
    expect(screen.getByText("Jess")).toBeInTheDocument();
  });

  /*
    NO "0" WHEN THE LOG COULD NOT BE READ. Nought claims nothing happened, and a
    failed read does not know that — the panel says it failed instead.
  */
  it("shows no count when the log cannot be read, and says so inside", async () => {
    asMock(customerInvoiceService.activity).mockRejectedValue(
      new ApiError("Riwayat aktivitas gagal dimuat.", 500),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByText(/Riwayat aktivitas gagal dimuat/),
    ).toBeInTheDocument();
    expect(badge("0 aktivitas")).not.toBeInTheDocument();
  });

  /* The payment's own number leads its row, ahead of the amount and channel. */
  it("names the payment by its own number in the payment-recorded entry", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        status: "partial",
        paidAmount: "100000.0000",
        outstandingAmount: "200000.0000",
        payments: [
          {
            paymentId: "pay1",
            paymentNumber: "PMT-2026-0001",
            at: "2026-08-27T00:00:00.000Z",
            amount: "100000.0000",
            method: "transfer",
            channelId: "chan-bca",
            channelName: "BCA Operasional",
            ref: null,
            byUserId: "u1",
            byUserName: "Rani",
            journalEntryId: "je-pay1",
            journalEntryNumber: "JE-2026-08-0412",
            reversalJournalEntryNumber: null,
            isVoided: false,
            voidedAt: null,
            voidedBy: null,
            voidReason: null,
            reversalJournalEntryId: null,
          },
        ],
      }),
    );
    asMock(customerInvoiceService.activity).mockResolvedValue({
      items: [
        {
          _id: "a1",
          action: "invoice_payment_record",
          at: "2026-08-27T00:00:00.000Z",
          actorName: "Rani",
          metadata: {
            paymentId: "pay1",
            paymentNumber: "PMT-2026-0001",
            amount: "100000.0000",
          },
          fromDocument: false,
        },
      ],
    });

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await waitFor(() => expect(badge("1 aktivitas")).toBeInTheDocument());
    await user.click(screen.getByText("Riwayat aktivitas"));

    expect(
      await screen.findByText(
        "PMT-2026-0001 · Rp 100.000 · Transfer — BCA Operasional",
      ),
    ).toBeInTheDocument();
  });
});
