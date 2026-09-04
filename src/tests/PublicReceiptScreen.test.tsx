import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";

import { PublicReceiptScreen } from "@/features/pos";
import { posService } from "@/services/pos.service";
import type { PublicReceipt } from "@/types/api";

jest.mock("@/services/pos.service");

const mockedPos = posService as jest.Mocked<typeof posService>;

const TOKEN = "Gv7xQ2pLmN4kRt8wZa1bYQ";

const receipt = (overrides: Partial<PublicReceipt> = {}): PublicReceipt => ({
  header: {
    tenantName: "PawShip",
    branchName: "Cabang Selatan",
    address: "Jl. Melati 12",
    phone: "081234567890",
    receiptFooter: "Terima kasih",
  },
  transactionNumber: "POS-260826-0002",
  receiptToken: TOKEN,
  paidAt: "2026-08-27T06:42:00.000Z",
  status: "paid",
  cashierName: "Jess",
  customerName: null,
  items: [
    {
      kind: "product",
      name: "Tes",
      sku: null,
      qty: "1.0000",
      unitPrice: "170000.0000",
      lineTotal: "170000.0000",
      discount: null,
      petName: null,
      groomerName: null,
    },
  ],
  otherCharges: [],
  totals: {
    subtotal: "170000.0000",
    itemDiscount: "0.0000",
    cartDiscount: "0.0000",
    otherCharges: "0.0000",
    dpp: "170000.0000",
    tax: "0.0000",
    grandTotal: "170000.0000",
    credit: "0.0000",
  },
  payments: [
    {
      channelId: "c1",
      channelType: "cash",
      channelName: "Kas Toko",
      amount: "170000.0000",
      change: "0.0000",
      reference: null,
    },
  ],
  credit: null,
  note: null,
  ...overrides,
});

/**
 * /struk/:token — the receipt a CUSTOMER opens (FR-8).
 *
 * RENDERED WITH PLAIN `render`, not `renderWithAuth`, and that is the test: this
 * page has no session, no permissions and no shift. If it ever grows a
 * dependency on any of them, this file stops compiling rather than the customer
 * finding out.
 */
describe("PublicReceiptScreen", () => {
  it("shows the shop's own receipt", async () => {
    mockedPos.publicReceipt.mockResolvedValue(receipt());

    render(<PublicReceiptScreen token={TOKEN} />);

    expect(await screen.findByText("PawShip")).toBeInTheDocument();
    expect(screen.getByText("Cabang Selatan")).toBeInTheDocument();
    expect(screen.getByText("POS-260826-0002")).toBeInTheDocument();
    expect(screen.getByText("Tes")).toBeInTheDocument();
  });

  it("asks for it by the token in the URL and nothing else", async () => {
    mockedPos.publicReceipt.mockResolvedValue(receipt());

    render(<PublicReceiptScreen token={TOKEN} />);

    await screen.findByText("PawShip");
    expect(mockedPos.publicReceipt).toHaveBeenCalledWith(TOKEN);
    // Never the cashier's own endpoint — that one needs a session.
    expect(mockedPos.receipt).not.toHaveBeenCalled();
  });

  /*
    A CANCELLED SALE READ AS A VALID ONE is worse than the link failing. It stays
    open because whoever holds the original slip may reasonably come back to it
    (FR-11) — but it has to say what it is.
  */
  it("says so when the sale was voided", async () => {
    mockedPos.publicReceipt.mockResolvedValue(receipt({ status: "void" }));

    render(<PublicReceiptScreen token={TOKEN} />);

    expect(
      await screen.findByText(/transaksi ini sudah dibatalkan/i),
    ).toBeInTheDocument();
    // Still shows the receipt beneath it.
    expect(screen.getByText("POS-260826-0002")).toBeInTheDocument();
  });

  /*
    ONE ANSWER FOR EVERY FAILURE, matching what the server sends: a page that
    distinguished "no such receipt" from "not paid for" would turn a guessed
    token into a probe result.
  */
  it("gives a stranger nothing when the token names nothing", async () => {
    mockedPos.publicReceipt.mockRejectedValue(new Error("404"));

    render(<PublicReceiptScreen token="guessed" />);

    expect(
      await screen.findByText(/struk ini tidak ditemukan/i),
    ).toBeInTheDocument();
    // Bahasa, and it tells them what to do next — ui-rules §12.
    expect(screen.getByText(/minta lagi ke petshop-nya/i)).toBeInTheDocument();
  });

  /*
    A CUSTOMER MAY WELL PRINT THEIR OWN RECEIPT, and `print/receipt.css` removes
    every top-level node that is not marked. Without this the page would print
    blank — silently, on somebody else's printer.
  */
  it("is printable by the browser's own print", async () => {
    mockedPos.publicReceipt.mockResolvedValue(receipt());

    const { container } = render(<PublicReceiptScreen token={TOKEN} />);

    await screen.findByText("PawShip");
    const root = container.querySelector("[data-print-root]");
    expect(root).not.toBeNull();
    expect(root?.querySelector("[data-receipt-sheet]")).not.toBeNull();
  });

  it("offers nothing to act on", async () => {
    mockedPos.publicReceipt.mockResolvedValue(receipt());

    render(<PublicReceiptScreen token={TOKEN} />);

    await screen.findByText("PawShip");
    /*
      A DOCUMENT, NOT A SCREEN. The reader is a customer: there is no sale to
      void, no receipt to reprint on the shop's roll, and nothing here should
      suggest otherwise.
    */
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
