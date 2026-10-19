import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosPaymentDialog } from "@/features/pos/components/PosPaymentDialog";
import { paymentChannelService } from "@/services/paymentChannel.service";
import { ApiError } from "@/services/api-error";
import type { PosTransaction } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/paymentChannel.service");

const mockedChannels = paymentChannelService as jest.Mocked<typeof paymentChannelService>;

/**
 * POS OFFLINE MODE (19 October 2026) — the payment dialog when there is no
 * server, and when the server stops answering in the middle of a payment.
 */
const cart = {
  _id: "5a7f1f77bcf86cd7994390e1",
  branchId: "b-offline-test",
  customer: { _id: "c1", name: "Rina", phone: null },
  customerId: "c1",
  items: [],
  otherCharges: [],
  runningTotals: {
    subtotal: "300000.0000",
    itemDiscount: "0.0000",
    cartDiscount: "0.0000",
    otherCharges: "0.0000",
    net: "300000.0000",
  },
} as unknown as PosTransaction;

beforeEach(() => {
  mockedChannels.list.mockResolvedValue({
    items: [
      {
        _id: "cash",
        type: "cash",
        name: "Kas Toko",
        requiresReference: false,
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

describe("PosPaymentDialog — offline", () => {
  it("says QRIS and transfer are recorded by hand, and takes no piutang", async () => {
    renderWithAuth(
      <PosPaymentDialog cart={cart} open offline onPaid={jest.fn()} onOpenChange={jest.fn()} pay={jest.fn()} />,
    );

    expect(await screen.findByText(/QRIS dan transfer dicatat manual/)).toBeInTheDocument();
  });

  it("pays through the till's own payer", async () => {
    const user = userEvent.setup();
    const pay = jest.fn().mockResolvedValue({ ...cart, _id: "ctx-1", status: "paid" });
    const onPaid = jest.fn();
    renderWithAuth(
      <PosPaymentDialog cart={cart} open offline pay={pay} onPaid={onPaid} onOpenChange={jest.fn()} />,
    );

    await user.click(await screen.findByRole("button", { name: "Kas Toko" }));
    await user.click(screen.getByRole("button", { name: /selesaikan/i }));

    expect(pay).toHaveBeenCalledWith({ payments: [{ channelId: "cash", amount: "300000" }] });
    expect(onPaid).toHaveBeenCalledWith(expect.objectContaining({ _id: "ctx-1" }));
  });
});

describe("PosPaymentDialog — the connection drops while paying", () => {
  it("offers to resend, or to finish the same sale offline", async () => {
    const user = userEvent.setup();
    const pay = jest.fn().mockRejectedValue(ApiError.network());
    const saveOffline = jest.fn().mockResolvedValue({ ...cart, _id: "ctx-2", status: "paid" });
    const onPaid = jest.fn();
    renderWithAuth(
      <PosPaymentDialog
        cart={cart}
        open
        pay={pay}
        saveOffline={saveOffline}
        onPaid={onPaid}
        onOpenChange={jest.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Kas Toko" }));
    await user.click(screen.getByRole("button", { name: /selesaikan/i }));

    expect(await screen.findByText(/Koneksi terputus saat membayar/)).toBeInTheDocument();
    expect(onPaid).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /simpan sebagai transaksi offline/i }));

    expect(saveOffline).toHaveBeenCalledWith({ payments: [{ channelId: "cash", amount: "300000" }] });
    expect(onPaid).toHaveBeenCalledWith(expect.objectContaining({ _id: "ctx-2" }));
  });

  it("only offers a resend where the sale cannot be finished offline", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <PosPaymentDialog
        cart={cart}
        open
        pay={jest.fn().mockRejectedValue(ApiError.network())}
        onPaid={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Kas Toko" }));
    await user.click(screen.getByRole("button", { name: /selesaikan/i }));

    expect(await screen.findByText(/kirim ulang/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /simpan sebagai transaksi offline/i })).toBeNull();
  });
});
