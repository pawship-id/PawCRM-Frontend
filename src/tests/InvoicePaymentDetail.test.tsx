import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InvoicePaymentDetail } from "@/features/sales";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { tenantService } from "@/services/tenant.service";
import { ApiError } from "@/services/api-error";
import { swalToast } from "@/lib/swal";
import type {
  CustomerInvoiceDetail,
  CustomerInvoicePayment,
} from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customerInvoice.service");
// The kwitansi's header reads the shop's own details.
jest.mock("@/services/tenant.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;
const toast = swalToast as jest.MockedFunction<typeof swalToast>;

/**
 * ONE PAYMENT'S OWN PAGE — where printing its kwitansi and cancelling it live now.
 *
 * THESE CASES MOVED HERE from the invoice's screen with the September 2026 layout,
 * and what they guard did not change: a cancellation posts a reversal and keeps
 * the row, it needs its own grant and its own reason, and the kwitansi prints one
 * payment rather than the whole bill.
 *
 * READ-ONLY OTHERWISE, and asserted: a payment's amount and channel are not
 * editable, because the entry they posted is permanent.
 */
const INVOICE_ID = "inv1";
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

const detail = (
  overrides: Partial<CustomerInvoiceDetail> = {},
): CustomerInvoiceDetail =>
  ({
    _id: INVOICE_ID,
    invoiceNumber: "INV-2026-0042",
    customerId: "c1",
    customerName: "Bu Sari",
    branchId: "b1",
    branchName: "Cabang Pusat",
    posTransactionId: null,
    source: "manual",
    invoiceDate: "2026-08-06T00:00:00.000Z",
    dueDate: "2026-09-05T00:00:00.000Z",
    total: "300000.0000",
    paidAmount: "100000.0000",
    outstandingAmount: "200000.0000",
    isOverdue: false,
    status: "partial",
    notes: null,
    createdByName: "Jess",
    payments: [paymentRow()],
    journalEntryId: "je-issue",
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
  }) as CustomerInvoiceDetail;

const renderPage = (options?: Parameters<typeof renderWithAuth>[1]) =>
  renderWithAuth(
    <InvoicePaymentDetail invoiceId={INVOICE_ID} paymentId={PAYMENT_ID} />,
    options,
  );

beforeEach(() => {
  jest.clearAllMocks();
  asMock(customerInvoiceService.getById).mockResolvedValue(detail());
  asMock(tenantService.me).mockResolvedValue({
    _id: "t1",
    name: "Buloo Petshop",
  } as never);
});

describe("InvoicePaymentDetail — what it shows", () => {
  it("names the payment, the channel it landed in, and the invoice it belongs to", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Pembayaran Rp 100.000" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Transfer — BCA Operasional")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /INV-2026-0042 →/ }),
    ).toHaveAttribute("href", "/dashboard/sales/inv1");
  });

  it("offers nothing to edit — a posted payment is corrected by cancelling it", async () => {
    renderPage();

    await screen.findByText("Rincian pembayaran");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("says so when the payment is not on this invoice", async () => {
    renderWithAuth(
      <InvoicePaymentDetail invoiceId={INVOICE_ID} paymentId="pay-unknown" />,
    );

    expect(
      await screen.findByText(/Pembayaran ini tidak ada di faktur INV-2026-0042/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Kembali ke faktur/ }),
    ).toHaveAttribute("href", "/dashboard/sales/inv1");
  });
});

describe("InvoicePaymentDetail — cancelling it", () => {
  async function openCancel(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole("button", { name: "Batalkan pembayaran" }),
    );
    return within(await screen.findByRole("dialog"));
  }

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

    renderPage();
    const dialog = await openCancel(user);

    await user.type(dialog.getByLabelText("Alasan"), "Salah faktur");
    await user.click(
      dialog.getByRole("button", { name: "Batalkan pembayaran" }),
    );

    await waitFor(() =>
      expect(customerInvoiceService.voidPayment).toHaveBeenCalledWith(
        INVOICE_ID,
        PAYMENT_ID,
        { reason: "Salah faktur" },
      ),
    );

    // NOT a refetch: the response IS the new state of the document.
    expect(await screen.findByText("Alasan: Salah faktur")).toBeInTheDocument();
    expect(screen.getByText("dibatalkan")).toBeInTheDocument();
    expect(customerInvoiceService.getById).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty reason before spending a round trip", async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await openCancel(user);

    await user.click(
      dialog.getByRole("button", { name: "Batalkan pembayaran" }),
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

    renderPage();
    const dialog = await openCancel(user);

    await user.type(dialog.getByLabelText("Alasan"), "x");
    await user.click(
      dialog.getByRole("button", { name: "Batalkan pembayaran" }),
    );

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringMatching(/already cancelled/),
        "error",
        8000,
      ),
    );
  });

  /* "Kembali" beside "Batalkan pembayaran" — the two must not sound alike. */
  it("closes with Kembali, not Batal", async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await openCancel(user);

    expect(dialog.getByRole("button", { name: "Kembali" })).toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: "Batal" })).not.toBeInTheDocument();
  });

  it("hides the cancel button from a role that may take money but not undo it", async () => {
    renderPage({
      isSuperAdmin: false,
      permissions: [{ feature: "customerInvoices", actions: ["read", "pay"] }],
    });

    await screen.findByText("Rincian pembayaran");
    expect(
      screen.queryByRole("button", { name: /Batalkan pembayaran/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps a cancelled payment readable, with its reason, and offers no second cancellation", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        payments: [
          paymentRow({
            isVoided: true,
            voidedAt: "2026-08-28T00:00:00.000Z",
            voidReason: "Dobel input",
            reversalJournalEntryId: "je-rev1",
          }),
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText("Alasan: Dobel input")).toBeInTheDocument();
    expect(screen.getByText("dibatalkan")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Batalkan pembayaran/ }),
    ).not.toBeInTheDocument();
  });
});

describe("InvoicePaymentDetail — kwitansi", () => {
  async function openReceipt() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Kwitansi/ }));
    return within(await screen.findByRole("dialog"));
  }

  it("prints one PAYMENT, not the whole invoice", async () => {
    renderPage();
    const dialog = await openReceipt();

    expect(dialog.getByText("KWITANSI")).toBeInTheDocument();
    // The amount received, not the invoice total.
    expect(dialog.getByText(/Rp\s?100\.000/)).toBeInTheDocument();
    expect(dialog.getByText("Jumlah diterima")).toBeInTheDocument();
  });

  it("carries the shop, the customer and what is left — and no ledger id", async () => {
    renderPage();
    const dialog = await openReceipt();

    expect(dialog.getByText("Buloo Petshop")).toBeInTheDocument();
    expect(dialog.getByText("Bu Sari")).toBeInTheDocument();
    expect(dialog.getByText("Sisa tagihan saat ini")).toBeInTheDocument();
    expect(dialog.queryByText("je-pay1")).not.toBeInTheDocument();
    expect(dialog.queryByText("JE-2026-08-0412")).not.toBeInTheDocument();
  });

  /*
    Somebody re-printing a cancelled payment is usually doing so BECAUSE it was
    cancelled. A sheet that silently omitted that would be worse than none.
  */
  it("still prints a cancelled payment, marked", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        payments: [paymentRow({ isVoided: true, voidReason: "Salah faktur" })],
      }),
    );

    renderPage();
    const dialog = await openReceipt();

    expect(dialog.getByText(/PEMBAYARAN INI DIBATALKAN/)).toBeInTheDocument();
  });
});

describe("InvoicePaymentDetail — the ledger reference", () => {
  it("shows the entry NUMBER, linked to the entry itself", async () => {
    renderPage();

    const link = await screen.findByRole("link", { name: "JE-2026-08-0412" });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/keuangan/journal-entries/je-pay1",
    );
    expect(screen.queryByText("je-pay1")).not.toBeInTheDocument();
  });

  it("links the reversing entry too, on a cancelled payment", async () => {
    asMock(customerInvoiceService.getById).mockResolvedValue(
      detail({
        payments: [
          paymentRow({
            isVoided: true,
            voidReason: "Dobel input",
            reversalJournalEntryId: "je-rev1",
            reversalJournalEntryNumber: "JE-2026-08-0498",
          }),
        ],
      }),
    );

    renderPage();

    expect(
      await screen.findByRole("link", { name: "JE-2026-08-0498" }),
    ).toHaveAttribute("href", "/dashboard/keuangan/journal-entries/je-rev1");
  });

  it("shows the number as plain text without `journalEntries:read`", async () => {
    renderPage({
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
      detail({ payments: [paymentRow({ journalEntryNumber: null })] }),
    );

    renderPage();

    expect(await screen.findByRole("link", { name: "je-pay1" })).toBeInTheDocument();
  });
});
