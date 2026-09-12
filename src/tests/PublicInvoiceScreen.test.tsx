import { render, screen } from "@testing-library/react";

import { PublicInvoiceScreen } from "@/features/sales/components/PublicInvoiceScreen";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import type { PublicCustomerInvoice } from "@/types/api";

jest.mock("@/services/customerInvoice.service");

const mocked = customerInvoiceService as jest.Mocked<
  typeof customerInvoiceService
>;

const TOKEN = "Hq3vR8nLpW2kTz6yXb4cZA";

const invoice = (
  overrides: Partial<PublicCustomerInvoice> = {},
): PublicCustomerInvoice => ({
  invoiceNumber: "INV/CBS/2609/0006",
  status: "partial",
  invoiceDate: "2026-09-01T03:00:00.000Z",
  dueDate: "2026-10-01T03:00:00.000Z",
  customerName: "Bu Sari",
  branchName: "Cabang Selatan",
  items: [
    {
      name: "Grooming Kucing",
      sku: null,
      petName: "Mochi",
      qty: "1.0000",
      unitPrice: "181000.0000",
      lineTotal: "181000.0000",
    },
  ],
  totals: {
    subtotal: "181000.0000",
    itemDiscount: "0.0000",
    invoiceDiscount: "0.0000",
    dpp: "163063.0000",
    tax: "17937.0000",
    grandTotal: "181000.0000",
  },
  otherCharges: [],
  total: "181000.0000",
  paidAmount: "46575.0000",
  outstandingAmount: "134425.0000",
  payments: [
    {
      paymentNumber: "PMT-2026-0001",
      at: "2026-09-05T03:00:00.000Z",
      amount: "46575.0000",
      channelName: "BCA Operasional",
    },
  ],
  notes: null,
  voidReason: null,
  tenant: {
    name: "PawShip",
    invoiceFooterNote: "Transfer ke BCA 123 a.n. PawShip",
  },
  ...overrides,
});

/**
 * /faktur/:token — the faktur a CUSTOMER opens from the shop's WhatsApp message.
 *
 * RENDERED WITH PLAIN `render`, not `renderWithAuth`, and that is the test: this
 * page has no session and no permissions. If it ever grows a dependency on
 * either, this file stops working rather than the customer finding out.
 */
describe("PublicInvoiceScreen", () => {
  it("shows the bill: the shop, the number, the lines and what is still owed", async () => {
    mocked.publicInvoice.mockResolvedValue(invoice());

    render(<PublicInvoiceScreen token={TOKEN} />);

    expect((await screen.findAllByText("PawShip")).length).toBeGreaterThan(0);
    expect(screen.getByText("INV/CBS/2609/0006")).toBeInTheDocument();
    expect(screen.getByText("Bu Sari")).toBeInTheDocument();
    expect(screen.getByText("Grooming Kucing")).toBeInTheDocument();
    expect(screen.getByText("Rp 134.425")).toBeInTheDocument();
    // Where to pay — the shop's own footer note.
    expect(screen.getByText(/Transfer ke BCA 123/)).toBeInTheDocument();
  });

  it("asks for it by the token in the URL and nothing else", async () => {
    mocked.publicInvoice.mockResolvedValue(invoice());

    render(<PublicInvoiceScreen token={TOKEN} />);

    await screen.findByText("INV/CBS/2609/0006");
    expect(mocked.publicInvoice).toHaveBeenCalledWith(TOKEN);
    // Never the shop's own endpoint — that one needs a session.
    expect(mocked.getById).not.toHaveBeenCalled();
  });

  /*
    A CANCELLED FAKTUR READ AS A VALID ONE is a bill somebody could pay against.
    It stays open — the link was sent, and may be opened again — but the sheet
    says what it is, and drops "where to pay".
  */
  it("says so when the faktur was cancelled, and stops saying where to pay", async () => {
    mocked.publicInvoice.mockResolvedValue(
      invoice({ status: "void", voidReason: "Salah pelanggan" }),
    );

    render(<PublicInvoiceScreen token={TOKEN} />);

    expect(
      await screen.findByText(/FAKTUR INI DIBATALKAN/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Transfer ke BCA 123/)).not.toBeInTheDocument();
  });

  it("gives a stranger nothing when the token names nothing", async () => {
    mocked.publicInvoice.mockRejectedValue(new Error("404"));

    render(<PublicInvoiceScreen token="guessed" />);

    expect(
      await screen.findByText(/faktur ini tidak ditemukan/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/minta lagi ke petshop-nya/i)).toBeInTheDocument();
  });

  /*
    A CUSTOMER MAY WELL PRINT OR SAVE THEIR OWN FAKTUR, and `print/receipt.css`
    removes every top-level node that is not marked — without this the page
    would print blank.
  */
  it("is printable by the browser's own print", async () => {
    mocked.publicInvoice.mockResolvedValue(invoice());

    const { container } = render(<PublicInvoiceScreen token={TOKEN} />);

    await screen.findByText("INV/CBS/2609/0006");
    expect(
      container.querySelector("[data-print-root] [data-receipt-sheet]"),
    ).not.toBeNull();
  });

  it("offers nothing to act on", async () => {
    mocked.publicInvoice.mockResolvedValue(invoice());

    render(<PublicInvoiceScreen token={TOKEN} />);

    await screen.findByText("INV/CBS/2609/0006");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
