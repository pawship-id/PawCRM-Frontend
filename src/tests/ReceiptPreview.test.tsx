import { screen } from "@testing-library/react";
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
  },
  transactionNumber: "POS-20260825-0001",
  paidAt: "2026-08-25T03:00:00.000Z",
  status: "paid",
  cashierUserId: null,
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
