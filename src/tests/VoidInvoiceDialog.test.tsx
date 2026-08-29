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

const reasonField = () => screen.getByLabelText(/alasan void/i);
const confirm = () => screen.getByRole("button", { name: /^void faktur$/i });

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

    expect(screen.getByText(/INV\/CBS\/2608\/0006/)).toBeInTheDocument();
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
