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
  CustomerOutstandingSummary,
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

/**
 * Opens the one filter panel and returns it.
 *
 * Pelanggan, cabang, sumber, the date range and the ordering all live inside it.
 * The trigger's text carries a count (`Filter (2)`); its accessible name does
 * not, so it is found by the stable half. The VIEW pills are deliberately not in
 * here — they sit outside the bar.
 */
async function openFilters(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Filter" }));
  return screen.findByRole("dialog");
}

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

function summary(
  overrides: Partial<CustomerOutstandingSummary> = {},
): CustomerOutstandingSummary {
  return {
    items: [],
    totalOutstanding: "300000.0000",
    totalInvoices: 1,
    totalOverdueOutstanding: "0.0000",
    totalOverdueInvoices: 0,
    totalDueSoonOutstanding: "0.0000",
    totalDueSoonInvoices: 0,
    horizonDays: 7,
    collectedThisMonth: {
      amount: "0.0000",
      paymentCount: 0,
      // The server's month, cut in the tenant's zone — 00:00 WIB on 1 August.
      from: "2026-07-31T17:00:00.000Z",
      to: "2026-08-31T16:59:59.999Z",
    },
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
  asMock(customerInvoiceService.outstanding).mockResolvedValue(
    summary({ totalOutstanding: "0.0000", totalInvoices: 0 }),
  );
  asMock(customerInvoiceService.getById).mockResolvedValue(detail());
  asMock(customerService.list).mockResolvedValue(
    optionPage([{ _id: CUSTOMER_ID, name: "Bu Sari" }]),
  );
  asMock(branchService.list).mockResolvedValue(
    optionPage([{ _id: BRANCH_ID, name: "Cabang Pusat", isActive: true }]),
  );
});

/* ------------------------------------------------------------------- list */

describe("ReceivablesScreen", () => {
  it("opens on the outstanding view, asked of the server", async () => {
    // NOT "all". A receivables screen is opened to answer "who still owes us" —
    // settled and voided invoices are history, and leading with them buries the
    // rows that need chasing.
    renderWithAuth(<ReceivablesScreen />);

    await waitFor(() =>
      expect(customerInvoiceService.list).toHaveBeenCalledWith(
        expect.objectContaining({ outstanding: true }),
      ),
    );
  });

  it("orders by soonest due — who has waited longest, not what was billed last", async () => {
    renderWithAuth(<ReceivablesScreen />);

    await waitFor(() =>
      expect(customerInvoiceService.list).toHaveBeenCalledWith(
        expect.objectContaining({ sort: "dueSoonest" }),
      ),
    );
  });

  it("sends the overdue lens over the wire rather than filtering the page", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await waitFor(() => expect(customerInvoiceService.list).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Jatuh tempo" }));

    await waitFor(() =>
      expect(customerInvoiceService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ overdue: true }),
      ),
    );
  });

  it("sends an exact status when the lens names one", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await waitFor(() => expect(customerInvoiceService.list).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Void" }));

    await waitFor(() =>
      expect(customerInvoiceService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "void" }),
      ),
    );
  });

  it("renders the server's outstanding figure, never a sum of the page", async () => {
    asMock(customerInvoiceService.list).mockResolvedValue(
      page([listRow(), listRow({ _id: "inv2" })]) as never,
    );
    asMock(customerInvoiceService.outstanding).mockResolvedValue(
      // Deliberately NOT 2 × 300.000: the book is bigger than the page.
      summary({ totalOutstanding: "9500000.0000", totalInvoices: 31 }),
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(await screen.findByText(/Rp\s?9\.500\.000/)).toBeInTheDocument();
    expect(screen.getByText("31 faktur belum lunas")).toBeInTheDocument();
  });

  it("warns about overdue money with the server's own two figures", async () => {
    asMock(customerInvoiceService.outstanding).mockResolvedValue(
      summary({
        totalOverdueInvoices: 3,
        totalOverdueOutstanding: "4310000.0000",
      }),
    );

    renderWithAuth(<ReceivablesScreen />);

    /*
      SCOPED TO THE BANNER. The same figure is on the stat card above it — the
      sheet's AC asks for both, and the two are not redundant in use: the card is
      always there with the number, the banner appears only when there is
      something to act on and says what to do.
    */
    const banner = (
      await screen.findByText("3 faktur sudah lewat jatuh tempo")
    ).closest("div") as HTMLElement;

    expect(banner).toHaveTextContent(/Rp\s?4\.310\.000/);
  });

  it("captions the due-soon note with the server's window, not a constant", async () => {
    asMock(customerInvoiceService.outstanding).mockResolvedValue(
      summary({
        totalDueSoonInvoices: 4,
        totalDueSoonOutstanding: "6185000.0000",
        horizonDays: 14,
      }),
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(
      await screen.findByText("4 faktur jatuh tempo dalam 14 hari"),
    ).toBeInTheDocument();
  });

  it("renders the row's lateness from the server's verdict", async () => {
    asMock(customerInvoiceService.list).mockResolvedValue(
      page([listRow({ isOverdue: true })]) as never,
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(await screen.findByText(/telat \d+ hari/)).toBeInTheDocument();
  });

  /*
    The one column the payables list does not have. A bridged invoice never
    passed through a form, and "where did this come from" is asked whenever a
    figure looks unfamiliar.
  */
  it("says which invoices the till raised", async () => {
    asMock(customerInvoiceService.list).mockResolvedValue(
      page([
        listRow({ source: "pos_bridge" }),
        listRow({ _id: "inv2", source: "manual" }),
      ]) as never,
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(await screen.findByText("dari kasir")).toBeInTheDocument();
    expect(screen.getByText("manual")).toBeInTheDocument();
  });

  it("shows a voided invoice as owing nothing", async () => {
    asMock(customerInvoiceService.list).mockResolvedValue(
      page([listRow({ status: "void", outstandingAmount: "300000.0000" })]) as never,
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(await screen.findByText("void")).toBeInTheDocument();
    // The outstanding column is dashed rather than showing a figure somebody
    // might go and chase.
    const row = screen.getByRole("row", { name: /INV-2026-0042/ });
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("filters by customer through the panel, because search does not match names", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await waitFor(() => expect(customerService.list).toHaveBeenCalled());
    const panel = await openFilters(user);

    await user.click(
      within(panel).getByRole("button", { name: /Filter pelanggan/ }),
    );
    await user.click(await screen.findByRole("option", { name: "Bu Sari" }));
    await user.click(within(panel).getByRole("button", { name: /Terapkan/i }));

    await waitFor(() =>
      expect(customerInvoiceService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ customerId: CUSTOMER_ID }),
      ),
    );
  });

  it("says so when the request fails, rather than showing an empty list", async () => {
    asMock(customerInvoiceService.list).mockRejectedValue(
      new ApiError("Server error", 500),
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  /**
   * The create button, and the grant behind it.
   *
   * `customerInvoices:create` IS SEPARATE FROM `read` on purpose: opening this
   * list is what counter staff do, while raising an invoice cuts stock and posts
   * two journal entries. A tenant grants the first without the second.
   */
  it("offers a create button to a role that may raise one", async () => {
    renderWithAuth(<ReceivablesScreen />);

    await waitFor(() => expect(customerInvoiceService.list).toHaveBeenCalled());
    expect(
      screen.getByRole("link", { name: /buat faktur/i }),
    ).toHaveAttribute("href", "/dashboard/sales/new");
  });

  it("hides it from a role that may only read", async () => {
    renderWithAuth(<ReceivablesScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "customerInvoices", actions: ["read"] }],
    });

    await waitFor(() => expect(customerInvoiceService.list).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: /buat faktur/i }),
    ).not.toBeInTheDocument();
  });
});

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
      await screen.findByText(/sudah di-void/),
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
    expect(await screen.findByText(/Masuk ke BCA Operasional/)).toBeInTheDocument();
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
      await screen.findByText(/Masuk ke BCA Operasional/),
    ).toBeInTheDocument();
    /*
      The ledger entry is the only handle on a mistake — a payment cannot be
      edited or deleted. Named by its NUMBER, which is what the ledger is filed
      under; the id is the link's address, not the label.
    */
    expect(
      screen.getByRole("link", { name: "JE-2026-08-0412" }),
    ).toBeInTheDocument();
  });
});

/* ============ PCR-032 — membatalkan pembayaran, dan kwitansinya ============ */

const PAYMENT_ID = "pay1";

const paymentRow = (
  overrides: Partial<CustomerInvoicePayment> = {},
): CustomerInvoicePayment => ({
  paymentId: PAYMENT_ID,
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

const paidDetail = (payments: CustomerInvoicePayment[] = [paymentRow()]) =>
  detail({
    status: "partial",
    paidAmount: "100000.0000",
    outstandingAmount: "200000.0000",
    payments,
  });

describe("InvoiceDetail — membatalkan pembayaran", () => {
  beforeEach(() => {
    asMock(customerInvoiceService.getById).mockResolvedValue(paidDetail());
  });

  it("cancels the payment with its reason and renders what the write returned", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.voidPayment).mockResolvedValue(
      detail({
        status: "unpaid",
        paidAmount: "0.0000",
        outstandingAmount: "300000.0000",
        payments: [
          paymentRow({
            isVoided: true,
            voidedAt: "2026-08-28T00:00:00.000Z",
            voidReason: "Salah faktur",
            reversalJournalEntryId: "je-rev1",
          }),
        ],
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await user.click(await screen.findByRole("button", { name: /Batalkan/ }));
    await user.type(await screen.findByLabelText("Alasan"), "Salah faktur");
    await user.click(
      screen.getByRole("button", { name: "Batalkan pembayaran" }),
    );

    await waitFor(() =>
      expect(customerInvoiceService.voidPayment).toHaveBeenCalledWith(
        INVOICE_ID,
        PAYMENT_ID,
        { reason: "Salah faktur" },
      ),
    );

    /*
      NOT a refetch: the response IS the new state of the document. Asserted on
      the row's badge rather than the word alone — the card's footnote uses
      "dibatalkan" too, and matching that would pass with no row rendered.
    */
    expect(await screen.findByText("Salah faktur", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText("dibatalkan").length).toBeGreaterThan(0);
    expect(customerInvoiceService.getById).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty reason before spending a round trip", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await user.click(await screen.findByRole("button", { name: /Batalkan/ }));
    await user.click(
      screen.getByRole("button", { name: "Batalkan pembayaran" }),
    );

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringMatching(/alasan/i),
        "error",
      ),
    );
    expect(customerInvoiceService.voidPayment).not.toHaveBeenCalled();
  });

  it("shows the server's refusal verbatim", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.voidPayment).mockRejectedValue(
      new ApiError("Payment was already cancelled", 409),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await user.click(await screen.findByRole("button", { name: /Batalkan/ }));
    await user.type(await screen.findByLabelText("Alasan"), "x");
    await user.click(
      screen.getByRole("button", { name: "Batalkan pembayaran" }),
    );

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringMatching(/already cancelled/),
        "error",
        8000,
      ),
    );
  });

  /* --- THE GATE --- */

  it("hides Batalkan from a role that may take money but not undo one", async () => {
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "customerInvoices", actions: ["read", "pay"] },
      ],
    });

    expect(await screen.findByText(/Masuk ke BCA Operasional/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Batalkan/ }),
    ).not.toBeInTheDocument();
  });

  /* --- a cancelled row stays visible --- */

  it("keeps a cancelled payment on the timeline, with its reason", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      paidDetail([
        paymentRow({
          isVoided: true,
          voidedAt: "2026-08-28T00:00:00.000Z",
          voidReason: "Dobel input",
          reversalJournalEntryId: "je-rev1",
        }),
      ]),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText(/Dobel input/)).toBeInTheDocument();
    expect(screen.getAllByText("dibatalkan").length).toBeGreaterThan(0);
  });

  it("offers no second cancellation on a payment already cancelled", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      paidDetail([paymentRow({ isVoided: true, voidReason: "Dobel input" })]),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText(/Dobel input/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Batalkan/ }),
    ).not.toBeInTheDocument();
  });
});

describe("InvoiceDetail — kwitansi", () => {
  beforeEach(() => {
    asMock(customerInvoiceService.getById).mockResolvedValue(paidDetail());
  });

  it("prints one PAYMENT, not the whole invoice", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await user.click(await screen.findByRole("button", { name: /Kwitansi/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("KWITANSI")).toBeInTheDocument();
    // The amount received, not the invoice total.
    expect(within(dialog).getByText(/Rp\s?100\.000/)).toBeInTheDocument();
    expect(within(dialog).getByText("Jumlah diterima")).toBeInTheDocument();
  });

  it("carries the shop's own header", async () => {
    const user = userEvent.setup();
    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await user.click(await screen.findByRole("button", { name: /Kwitansi/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Buloo Petshop")).toBeInTheDocument();
  });

  /*
    Somebody re-printing a cancelled payment is usually doing so BECAUSE it was
    cancelled. A sheet that silently omitted that would be worse than none.
  */
  it("still prints a cancelled payment, marked", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.getById).mockResolvedValue(
      paidDetail([
        paymentRow({ isVoided: true, voidReason: "Salah faktur" }),
      ]),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await user.click(await screen.findByRole("button", { name: /Kwitansi/ }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/PEMBAYARAN INI DIBATALKAN/),
    ).toBeInTheDocument();
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

describe("PaymentReceipt — what does NOT go on a customer's sheet", () => {
  /*
    The kwitansi used to carry "dicetak dari … · jurnal <ObjectId>". Neither the
    PRD nor the PCR sheet asks for it, and a database id on a document handed to
    a customer is noise. The id stays on the staff-facing timeline.
  */
  it("carries no ledger id", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.getById).mockResolvedValue(paidDetail());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await user.click(await screen.findByRole("button", { name: /Kwitansi/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText("je-pay1")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("JE-2026-08-0412"),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Dicetak dari/)).not.toBeInTheDocument();
  });

  it("still names the shop, the customer and what is left", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.getById).mockResolvedValue(paidDetail());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    await user.click(await screen.findByRole("button", { name: /Kwitansi/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Buloo Petshop")).toBeInTheDocument();
    expect(within(dialog).getByText("Bu Sari")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Sisa tagihan saat ini"),
    ).toBeInTheDocument();
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

    await screen.findByText(/sudah di-void/);
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

    await screen.findByText(/sudah di-void/);
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

describe("InvoiceDetail — the postings, not just their numbers", () => {
  const withLines = () =>
    detail({
      journalEntries: [
        {
          _id: "je1",
          entryNumber: "JE-2026-08-0411",
          date: "2026-08-27T00:00:00.000Z",
          description: "Penerbitan faktur",
          sourceType: "invoice",
          isReversal: false,
          belongsToSale: false,
          lines: [
            {
              accountId: "a1",
              code: "1103",
              name: "Piutang Usaha",
              debit: "1119130.0000",
              credit: "0.0000",
              memo: null,
            },
            {
              accountId: "a2",
              code: "4101",
              name: "Penjualan",
              debit: "0.0000",
              credit: "1119130.0000",
              memo: null,
            },
          ],
        },
      ],
    });

  /*
    THE ACCOUNTS ARE THE WHOLE REASON THE ENTRIES ARE INTERESTING. The card used
    to list four numbers, so anybody asking "what did it actually debit" opened
    the ledger four times.
  */
  it("names the accounts it debited and credited", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(withLines());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    // Two nodes each — the code and the name sit in one cell as separate spans.
    expect((await screen.findAllByText(/Piutang Usaha/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Penjualan/).length).toBeGreaterThan(0);
    expect(screen.getByText("1103")).toBeInTheDocument();
  });

  /* The number is still what somebody quotes. */
  it("keeps the entry number beside them", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(withLines());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("JE-2026-08-0411")).toBeInTheDocument();
  });

  /*
    AN ACCOUNT RETIRED SINCE THE POSTING still shows its figures. Dropping the
    row would make the entry stop balancing on screen, which reads as a broken
    ledger rather than a retired account.
  */
  it("still prints a line whose account was deleted", async () => {
    const entry = withLines().journalEntries[0];
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        journalEntries: [
          {
            ...entry,
            lines: [
              { ...entry.lines[0], code: null, name: null },
              entry.lines[1],
            ],
          },
        ],
      }),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(await screen.findByText("Akun terhapus")).toBeInTheDocument();
  });
});

describe("PaymentHistory — the ledger reference", () => {
  /*
    The timeline used to render "jurnal 6a903c1a3d3de99c0994134a". An ObjectId is
    neither something a person can look up nor something they can quote to whoever
    can — and it was not a link either.
  */
  it("shows the entry NUMBER, linked to the entry itself", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(paidDetail());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    const link = await screen.findByRole("link", { name: "JE-2026-08-0412" });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/keuangan/journal-entries/je-pay1",
    );
    // The raw id is not on screen anywhere.
    expect(screen.queryByText("je-pay1")).not.toBeInTheDocument();
  });

  it("links the reversing entry too, on a cancelled payment", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      paidDetail([
        paymentRow({
          isVoided: true,
          voidReason: "Dobel input",
          reversalJournalEntryId: "je-rev1",
          reversalJournalEntryNumber: "JE-2026-08-0498",
        }),
      ]),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByRole("link", { name: "JE-2026-08-0498" }),
    ).toHaveAttribute("href", "/dashboard/keuangan/journal-entries/je-rev1");
  });

  /*
    A link that lands on "Akses ditolak" is worse than plain text — it promises
    somewhere to go. The number still shows: it is what somebody quotes to
    whoever can open the ledger.
  */
  it("shows the number as plain text without `journalEntries:read`", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(paidDetail());

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "customerInvoices", actions: ["read", "pay"] }],
    });

    expect(await screen.findByText("JE-2026-08-0412")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "JE-2026-08-0412" }),
    ).not.toBeInTheDocument();
  });

  it("falls back to the id when the number cannot be resolved", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      paidDetail([paymentRow({ journalEntryNumber: null })]),
    );

    renderWithAuth(<InvoiceDetail invoiceId={INVOICE_ID} />);

    expect(
      await screen.findByRole("link", { name: "je-pay1" }),
    ).toBeInTheDocument();
  });
});

describe("ReceivablesScreen — the three stat cards", () => {
  /*
    PCR-033's own list: "Stat cards: Total Piutang, Overdue, Bulan Ini". They read
    as one sentence — owed, late, collected — and the order is the order the
    questions are asked in.
  */
  it("shows all three, from the server's own figures", async () => {
    asMock(customerInvoiceService.outstanding).mockResolvedValue(
      summary({
        totalOutstanding: "9500000.0000",
        totalInvoices: 31,
        totalOverdueOutstanding: "4310000.0000",
        totalOverdueInvoices: 3,
        collectedThisMonth: {
          amount: "22940000.0000",
          paymentCount: 31,
          from: "2026-07-31T17:00:00.000Z",
          to: "2026-08-31T16:59:59.999Z",
        },
      }),
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(await screen.findByText(/Rp\s?9\.500\.000/)).toBeInTheDocument();
    expect(screen.getAllByText(/Rp\s?4\.310\.000/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Rp\s?22\.940\.000/)).toBeInTheDocument();
    expect(screen.getByText("31 pembayaran diterima")).toBeInTheDocument();
  });

  /*
    THE CAPTION COMES FROM THE SERVER'S RANGE, not the browser's clock. The month
    was cut in the TENANT's timezone; deriving it locally would caption one month
    over a figure computed for another for a few hours either side of every
    boundary.
  */
  it("captions the month from the range the figure was computed over", async () => {
    asMock(customerInvoiceService.outstanding).mockResolvedValue(
      summary({
        collectedThisMonth: {
          amount: "1000.0000",
          paymentCount: 1,
          // 00:00 WIB on 1 August — a UTC reader would call this July.
          from: "2026-07-31T17:00:00.000Z",
          to: "2026-08-31T16:59:59.999Z",
        },
      }),
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(await screen.findByText("Tertagih Agustus 2026")).toBeInTheDocument();
  });

  /*
    A CARD THAT VANISHES AT ZERO teaches people its absence means "not loaded".
    Unlike the two notices below them, which appear only when there is something
    to act on.
  */
  it("stays visible at zero", async () => {
    asMock(customerInvoiceService.outstanding).mockResolvedValue(
      summary({
        totalOutstanding: "0.0000",
        totalInvoices: 0,
        totalOverdueInvoices: 0,
      }),
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(await screen.findByText("Lewat jatuh tempo")).toBeInTheDocument();
    expect(screen.getByText("0 faktur perlu ditagih")).toBeInTheDocument();
    // No banner, though — nothing to act on.
    expect(
      screen.queryByText(/sudah lewat jatuh tempo/),
    ).not.toBeInTheDocument();
  });

  /*
    NULL IS NOT ZERO. A failed summary read renders an em dash; "Rp 0" would be a
    confident wrong answer on a screen whose whole point is figures that can be
    trusted.
  */
  it("renders an absence, not a zero, when the summary fails", async () => {
    asMock(customerInvoiceService.outstanding).mockRejectedValue(
      new ApiError("boom", 500),
    );

    renderWithAuth(<ReceivablesScreen />);

    await waitFor(() => expect(customerInvoiceService.list).toHaveBeenCalled());
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/Rp\s?0/)).not.toBeInTheDocument();
  });
});

describe("ReceivablesToolbar — ordering by what was billed", () => {
  it("sends totalHighest over the wire", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await waitFor(() => expect(customerInvoiceService.list).toHaveBeenCalled());
    const panel = await openFilters(user);

    await user.click(within(panel).getByRole("button", { name: /Urutkan/ }));
    await user.click(
      await screen.findByRole("option", { name: "Tagihan terbesar" }),
    );
    await user.click(within(panel).getByRole("button", { name: /Terapkan/i }));

    await waitFor(() =>
      expect(customerInvoiceService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "totalHighest" }),
      ),
    );
  });
});
