import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Swal from "sweetalert2";

import { VoidInvoiceDialog } from "@/features/sales/components/VoidInvoiceDialog";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { ApiError } from "@/services/api-error";
import type { CustomerInvoiceDetail } from "@/types/api";

jest.mock("@/services/customerInvoice.service");
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

/**
 * Voiding a whole invoice — a bigger act than cancelling one payment.
 *
 * WHAT THIS SUITE IS REALLY ABOUT is that the dialog SAYS what will happen. The
 * goods go back, two journal entries are reversed, and the invoice is not
 * deleted — none of which is guessable from a button labelled "Void faktur", and
 * all of which somebody is entitled to know before they confirm.
 */
const invoice = (overrides = {}): CustomerInvoiceDetail =>
  ({
    _id: "inv1",
    invoiceNumber: "INV/CBS/2608/0006",
    customerName: "Bu Sari",
    total: "181000.0000",
    status: "unpaid",
    ...overrides,
  }) as unknown as CustomerInvoiceDetail;

const onVoided = jest.fn();
const onOpenChange = jest.fn();

const open = (props = {}) =>
  render(
    <VoidInvoiceDialog
      invoice={invoice()}
      open
      onOpenChange={onOpenChange}
      onVoided={onVoided}
      {...props}
    />,
  );

// The module's word is "batal", not "void" (decided 11 Sep 2026).
const reasonField = () => screen.getByLabelText(/alasan pembatalan/i);
const confirm = () =>
  screen.getByRole("button", { name: /^batalkan faktur$/i });

beforeEach(() => {
  onVoided.mockClear();
  onOpenChange.mockClear();
  (Swal.fire as jest.Mock).mockClear();
  (customerInvoiceService.voidInvoice as jest.Mock).mockResolvedValue(
    invoice({ status: "void" }),
  );
});

describe("what the dialog says will happen", () => {
  /*
    THE NUMBER, NOT "THIS INVOICE". Somebody with three tabs open is about to
    unwind a document that moved stock and posted two entries; seeing its number
    before they type is what stops them unwinding the wrong one.
  */
  it("names the invoice and what it is worth", () => {
    open();

    expect(
      screen.getByRole("heading", { name: "Batalkan INV/CBS/2608/0006?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Rp 181.000")).toBeInTheDocument();
    expect(screen.getByText(/Bu Sari/)).toBeInTheDocument();
  });

  it("says the goods go back and both entries are reversed", () => {
    open();

    expect(screen.getByText(/kembali ke stok/i)).toBeInTheDocument();
    expect(screen.getByText(/dua jurnal pembalik/i)).toBeInTheDocument();
  });

  /*
    THE ONE PEOPLE GET WRONG. A user expecting the row to disappear and finding
    it still there assumes the click failed and does it again.
  */
  it("warns that the invoice is NOT deleted and its number is not reused", () => {
    open();

    const body = screen.getByText(/tidak dihapus/i).closest("li")!;
    expect(body).toHaveTextContent(/nomornya tidak dipakai ulang/i);
  });
});

/*
  "KEMBALI", NOT "BATAL". With "Batalkan faktur" as the confirm button, a "Batal"
  beside it would be two buttons that sound like one act and do opposite things.
*/
it("backs out with Kembali, never a second 'Batal'", async () => {
  open();

  await userEvent.click(screen.getByRole("button", { name: "Kembali" }));

  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(screen.queryByRole("button", { name: "Batal" })).not.toBeInTheDocument();
  expect(customerInvoiceService.voidInvoice).not.toHaveBeenCalled();
});

describe("the reason", () => {
  it("keeps the confirm button disabled until one is typed", () => {
    open();

    expect(confirm()).toBeDisabled();
  });

  it("refuses whitespace, without a round trip", async () => {
    open();
    await userEvent.type(reasonField(), "   ");

    expect(confirm()).toBeDisabled();
    expect(customerInvoiceService.voidInvoice).not.toHaveBeenCalled();
  });

  it("sends the trimmed reason", async () => {
    open();
    await userEvent.type(reasonField(), "  Salah pelanggan  ");
    await userEvent.click(confirm());

    await waitFor(() =>
      expect(customerInvoiceService.voidInvoice).toHaveBeenCalledWith(
        "inv1",
        "Salah pelanggan",
      ),
    );
  });
});

describe("after it succeeds", () => {
  it("hands the updated invoice back and closes", async () => {
    open();
    await userEvent.type(reasonField(), "Salah pelanggan");
    await userEvent.click(confirm());

    await waitFor(() => expect(onVoided).toHaveBeenCalled());
    expect(onVoided.mock.calls[0][0].status).toBe("void");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("when the server refuses", () => {
  /*
    THE REFUSAL THAT MATTERS: money is still on the invoice. The message carries
    an instruction — cancel the payments first — so it gets the longer timer.
  */
  it("toasts the reason for 8 seconds and keeps the dialog open", async () => {
    (customerInvoiceService.voidInvoice as jest.Mock).mockRejectedValue(
      new ApiError("This invoice has payments on it", 409),
    );

    open();
    await userEvent.type(reasonField(), "Salah pelanggan");
    await userEvent.click(confirm());

    await waitFor(() => expect(Swal.fire).toHaveBeenCalled());
    expect((Swal.fire as jest.Mock).mock.calls.at(-1)?.[0]).toMatchObject({
      icon: "error",
      title: "This invoice has payments on it",
      timer: 8000,
    });
    expect(onVoided).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("unlocks the button so it can be retried", async () => {
    (customerInvoiceService.voidInvoice as jest.Mock).mockRejectedValue(
      new ApiError("Server error", 500),
    );

    open();
    await userEvent.type(reasonField(), "Salah pelanggan");
    await userEvent.click(confirm());

    await waitFor(() => expect(confirm()).toBeEnabled());
  });
});

/**
 * WHILE MONEY IS STILL ON THE INVOICE. The server refuses a void then (409), and
 * the menu used to be drawn disabled — a pale row that read as broken. The
 * dialog now opens on the way forward: which payments to cancel first, each a
 * link to the page where that is done.
 */
describe("while a payment still counts", () => {
  const payment = (overrides = {}) => ({
    paymentId: "pay1",
    paymentNumber: "PMT-2026-0001",
    at: "2026-09-11T00:00:00.000Z",
    amount: "46575.0000",
    method: "transfer",
    channelName: "BCA Operasional",
    isVoided: false,
    ...overrides,
  });

  const withPayments = () =>
    open({
      invoice: invoice({
        status: "partial",
        paidAmount: "77625.0000",
        payments: [
          payment({ paymentId: "pay0", paymentNumber: null, amount: "62100.0000", isVoided: true }),
          payment({ paymentId: "pay2", paymentNumber: null, amount: "31050.0000" }),
          payment(),
        ],
      }),
    });

  it("says it cannot be cancelled yet, and how much is still paid", () => {
    withPayments();

    expect(
      screen.getByRole("heading", {
        name: "INV/CBS/2608/0006 belum bisa dibatalkan",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 pembayaran aktif/)).toBeInTheDocument();
    expect(screen.getByText("Rp 77.625")).toBeInTheDocument();
  });

  it("links every ACTIVE payment to the page where it is cancelled", () => {
    withPayments();

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard/sales/inv1/payments/pay2",
      "/dashboard/sales/inv1/payments/pay1",
    ]);
    expect(links[1]).toHaveTextContent("PMT-2026-0001");
    expect(links[1]).toHaveTextContent("Rp 46.575");
    // A payment recorded before numbering still shows up, by its amount.
    expect(links[0]).toHaveTextContent("Rp 31.050");
  });

  it("leaves a cancelled payment off the list — it no longer blocks anything", () => {
    withPayments();

    expect(screen.queryByText("Rp 62.100")).not.toBeInTheDocument();
  });

  it("asks for no reason and offers no confirm, only Kembali", async () => {
    withPayments();

    expect(screen.queryByLabelText(/alasan pembatalan/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^batalkan faktur$/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Kembali" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(customerInvoiceService.voidInvoice).not.toHaveBeenCalled();
  });
});
