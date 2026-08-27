import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReceiptDialog } from "@/features/pos/components/ReceiptDialog";
import { ReceiptPreview } from "@/features/pos/components/ReceiptPreview";
import { posService } from "@/services/pos.service";
import type { PosReceipt } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/pos.service");

const mockedPos = posService as jest.Mocked<typeof posService>;

const SALE_ID = "5a7f1f77bcf86cd7994390e1";

const receipt = (overrides: Partial<PosReceipt> = {}): PosReceipt => ({
  header: {
    tenantName: "Buloo Petshop",
    branchName: "Toko Pusat",
    address: "Jl. Melati 12",
    phone: "081234567890",
    receiptFooter: "Terima kasih",
  },
  transactionNumber: "POS-20260825-0001",
  paidAt: "2026-08-25T03:00:00.000Z",
  status: "paid",
  cashierUserId: "u1",
  cashierName: "Salwa",
  customerName: null,
  items: [
    {
      kind: "product",
      name: "Royal Canin Adult 2kg",
      sku: "RC-ADULT-2KG",
      qty: "1.0000",
      unitPrice: "300000.0000",
      lineTotal: "300000.0000",
      discount: null,
      petName: null,
      groomerName: null,
    },
  ],
  otherCharges: [],
  totals: {
    subtotal: "300000.0000",
    itemDiscount: "0.0000",
    cartDiscount: "0.0000",
    otherCharges: "0.0000",
    dpp: "270270.2703",
    tax: "29729.7297",
    grandTotal: "300000.0000",
    credit: "0.0000",
  },
  payments: [
    {
      channelId: "c1",
      channelType: "cash",
      channelName: "Kas Toko",
      amount: "350000.0000",
      change: "50000.0000",
      reference: null,
    },
  ],
  credit: null,
  note: null,
  ...overrides,
});

describe("ReceiptPreview — FR-8", () => {
  it("prints the shop from the sale's branch", () => {
    renderWithAuth(<ReceiptPreview receipt={receipt()} size="80" />);

    expect(screen.getByText("Buloo Petshop")).toBeInTheDocument();
    expect(screen.getByText("Jl. Melati 12")).toBeInTheDocument();
  });

  it("omits a line the shop never filled in, rather than printing a blank", () => {
    renderWithAuth(
      <ReceiptPreview
        receipt={receipt({
          header: {
            tenantName: "Buloo Petshop",
            branchName: "Toko Pusat",
            address: "",
            phone: "",
            receiptFooter: "",
          },
        })}
        size="80"
      />,
    );

    // `undefined` on a thermal print is how a shop finds out its own data is
    // thin, in front of a customer.
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it("shows the pet and groomer sub-line", () => {
    renderWithAuth(
      <ReceiptPreview
        receipt={receipt({
          items: [
            {
              kind: "service",
              name: "Grooming Full",
              sku: null,
              qty: "1.0000",
              unitPrice: "200000.0000",
              lineTotal: "200000.0000",
              discount: null,
              petName: "Bruno",
              groomerName: "Rina",
            },
          ],
        })}
        size="80"
      />,
    );

    expect(screen.getByText("Bruno · Rina")).toBeInTheDocument();
  });

  it("says so on a voided sale", () => {
    renderWithAuth(
      <ReceiptPreview receipt={receipt({ status: "void" })} size="80" />,
    );

    // A reprint that looked identical to a live sale is a refund waiting to
    // happen.
    expect(screen.getByText(/dibatalkan/i)).toBeInTheDocument();
  });

  it("carries the paper size on the sheet, which is what the print CSS reads", () => {
    const { container } = renderWithAuth(
      <ReceiptPreview receipt={receipt()} size="58" />,
    );

    expect(
      container.querySelector('[data-receipt-sheet="58"]'),
    ).toBeInTheDocument();
  });

  it("prints the change on a cash payment", () => {
    renderWithAuth(<ReceiptPreview receipt={receipt()} size="80" />);

    expect(screen.getByText(/kembalian/i)).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?50.000/)).toBeInTheDocument();
  });
});

describe("ReceiptDialog — sharing", () => {
  beforeEach(() => {
    mockedPos.receipt.mockResolvedValue(receipt());
  });

  it("copies rather than sends", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderWithAuth(
      <ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />,
    );

    await user.click(await screen.findByRole("button", { name: /salin/i }));

    // FR-8: sending a message to a customer's phone from a till is something
    // they agreed to with the shop, not with us.
    expect(writeText).toHaveBeenCalled();
    expect(await screen.findByText(/sudah disalin/i)).toBeInTheDocument();
  });

  it("shows selectable text when the clipboard is blocked", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    renderWithAuth(
      <ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />,
    );

    await user.click(await screen.findByRole("button", { name: /salin/i }));

    // Permission can be denied, and an insecure origin has no clipboard at all.
    expect(await screen.findByLabelText(/teks struk/i)).toBeInTheDocument();
  });

  it("shows the same fallback when there is no clipboard API at all", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    renderWithAuth(
      <ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />,
    );

    await user.click(await screen.findByRole("button", { name: /salin/i }));

    expect(await screen.findByLabelText(/teks struk/i)).toBeInTheDocument();
  });
});

/**
 * A credit sale's slip (FR-7).
 *
 * The most important thing on it is what the customer still owes — and the
 * number they will quote when they come back to pay.
 */
describe("ReceiptPreview — sold on account", () => {
  const CREDIT = {
    invoiceNumber: "INV-2026-0041",
    dueDate: "2026-09-24T10:00:00.000Z",
    total: "300000.0000",
    paidAmount: "100000.0000",
    outstandingAmount: "200000.0000",
    status: "partial" as const,
  };

  it("prints what is owed, when, and under which number", async () => {
    mockedPos.receipt.mockResolvedValue(receipt({ credit: CREDIT }));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    expect(await screen.findByText("Sisa piutang")).toBeInTheDocument();
    expect(screen.getByText("Rp 200.000")).toBeInTheDocument();
    expect(screen.getByText("INV-2026-0041")).toBeInTheDocument();
    expect(screen.getByText("24/09/2026")).toBeInTheDocument();
  });

  /*
    A DAY, NOT A MOMENT. Printing "24/09/2026 17.00" would invite a customer to
    read a deadline into the hour.
  */
  it("prints the due date without a time on it", async () => {
    mockedPos.receipt.mockResolvedValue(receipt({ credit: CREDIT }));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await screen.findByText("Sisa piutang");
    expect(screen.queryByText(/24\/09\/2026 \d/)).not.toBeInTheDocument();
  });

  it("prints nothing about piutang on an ordinary cash sale", async () => {
    mockedPos.receipt.mockResolvedValue(receipt({ credit: null }));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await screen.findByText(/buloo petshop/i);
    // Not "Rp 0" and not a heading with nothing under it — absent entirely.
    expect(screen.queryByText("Sisa piutang")).not.toBeInTheDocument();
    expect(screen.queryByText(/jatuh tempo/i)).not.toBeInTheDocument();
  });
});

/**
 * FR-5: the note prints as a line labelled **"Catatan:"**.
 *
 * Without the label it is one unmarked paragraph between the payment lines and
 * "Terima kasih" — and a customer reading their slip has no way to tell an
 * instruction the cashier typed from part of the shop's boilerplate.
 */
describe("ReceiptPreview — the transaction note", () => {
  it("prints it under a label, not as a loose paragraph", async () => {
    mockedPos.receipt.mockResolvedValue(
      receipt({ note: "Jangan pakai parfum" }),
    );

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    expect(await screen.findByText("Catatan:")).toBeInTheDocument();
    expect(screen.getByText("Jangan pakai parfum")).toBeInTheDocument();
  });

  it("prints nothing at all when there is no note", async () => {
    mockedPos.receipt.mockResolvedValue(receipt({ note: null }));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await screen.findByText(/buloo petshop/i);
    // Not an empty "Catatan:" heading with nothing under it.
    expect(screen.queryByText("Catatan:")).not.toBeInTheDocument();
  });
});

/**
 * Who served them (FR-8).
 *
 * "Siapa yang melayani" is the first question asked when somebody comes back
 * unhappy, and until now the slip could not answer it: the id was in the payload
 * and never on the paper.
 */
describe("ReceiptPreview — the cashier", () => {
  it("names them on the slip", async () => {
    mockedPos.receipt.mockResolvedValue(receipt({ cashierName: "Salwa" }));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    expect(await screen.findByText(/Kasir: Salwa/)).toBeInTheDocument();
  });

  /*
    TWO SHAPES OF ONE RECEIPT MUST NOT DISAGREE about who served the customer —
    they would end up holding a slip and a message with different answers to the
    same question.
  */
  it("names them in the copied text too", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    // `navigator.clipboard` is getter-only in jsdom; defineProperty is the way in.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    mockedPos.receipt.mockResolvedValue(receipt({ cashierName: "Salwa" }));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);
    await screen.findByText(/Kasir: Salwa/);

    await user.click(screen.getByRole("button", { name: /salin untuk whatsapp/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("Kasir: Salwa");
  });

  /*
    Null rather than a placeholder — inventing a name for a sale that carries no
    user would hide that it has none.
  */
  it("prints no cashier line when the sale names nobody", async () => {
    mockedPos.receipt.mockResolvedValue(receipt({ cashierName: null }));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await screen.findByText(/buloo petshop/i);
    expect(screen.queryByText(/^Kasir:/)).not.toBeInTheDocument();
  });
});

/**
 * The shop's own closing line (FR-8).
 *
 * It used to be typed into this component, which meant a shop wanting "Barang
 * yang sudah dibeli tidak dapat ditukar" had no way to say so, and one wanting
 * nothing had no way to be quiet.
 */
describe("ReceiptPreview — the footer", () => {
  const withFooter = (receiptFooter: string) =>
    receipt({
      header: {
        tenantName: "Buloo Petshop",
        branchName: "Toko Pusat",
        address: "Jl. Melati 12",
        phone: "081234567890",
        receiptFooter,
      },
    });

  it("prints the branch's own words", async () => {
    mockedPos.receipt.mockResolvedValue(
      withFooter("Barang yang sudah dibeli tidak dapat ditukar."),
    );

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    expect(
      await screen.findByText("Barang yang sudah dibeli tidak dapat ditukar."),
    ).toBeInTheDocument();
  });

  /*
    THE FALLBACK IS THE SERVER'S — a branch that has written nothing arrives here
    already carrying "Terima kasih", so neither this component nor the copied
    text has to remember a default of its own.
  */
  it("prints the standard line for a branch with no words of its own", async () => {
    mockedPos.receipt.mockResolvedValue(
      withFooter("Terima kasih"),
    );

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    expect(
      await screen.findByText("Terima kasih"),
    ).toBeInTheDocument();
  });

  /*
    The component's own rule, not a product one: an empty paragraph is not
    something to draw. The server never sends this today.
  */
  it("draws no paragraph at all for an empty footer", async () => {
    mockedPos.receipt.mockResolvedValue(withFooter(""));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await screen.findByText(/buloo petshop/i);
    expect(screen.queryByText(/terima kasih sudah mampir/i)).not.toBeInTheDocument();
  });

  /*
    TWO SHAPES OF ONE RECEIPT MUST NOT DISAGREE — the same rule the cashier line
    follows.
  */
  it("closes the copied text with the same line", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    mockedPos.receipt.mockResolvedValue(withFooter("Sampai jumpa lagi."));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);
    await screen.findByText("Sampai jumpa lagi.");

    await user.click(screen.getByRole("button", { name: /salin untuk whatsapp/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("Sampai jumpa lagi.");
  });
});
