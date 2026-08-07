import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PurchaseReturnForm } from "@/features/purchasing";
import * as demo from "@/features/inventory/data/demoStore";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
}));

/**
 * Mount tests for the purchasing screens STILL ON THE PROTOTYPE STORE.
 *
 * Deep on the thing a reviewer would otherwise have to discover by clicking:
 * that a return refuses to be entered free-hand.
 */
beforeEach(() => {
  demo.resetState();
  push.mockClear();
});

/*
 * THREE SETS OF SCREENS HAVE LEFT THIS FILE, for the same reason every time:
 * they run against the real API now, so their tests mock services instead of
 * seeding `demoStore`.
 *
 *   suppliers        → SuppliersTable / SupplierCreateForm / SupplierSelect /
 *                      supplier.service test files.
 *   goods receipts   → ReceiptScreens.test.tsx and goodsReceipt.service.test.ts.
 *   payables + hub   → PayablesScreens.test.tsx and purchaseInvoice.service.test.ts.
 *
 * What remains below is what remains on the prototype store: returns to supplier.
 */

describe("PurchaseReturnForm", () => {
  it("refuses to open when nothing has been bought outright", () => {
    render(<PurchaseReturnForm />);

    expect(
      screen.getByText(/Belum ada penerimaan beli putus yang bisa diretur/),
    ).toBeInTheDocument();
  });

  it("shows the reverse-HPP arithmetic once a quantity is entered", async () => {
    const receipt = demo.submitReceipt({
      supplierId: "sup_sps",
      warehouseId: "wh_utama",
      receiptType: "beli_putus",
      receiptDate: "2026-08-02",
      items: [{ productId: "prd_shampoo", qty: "10", costPerUnit: "50000" }],
    });

    const user = userEvent.setup();
    render(<PurchaseReturnForm receiptId={receipt._id} />);

    await user.type(
      screen.getByLabelText(/Qty retur Shampoo Petcare Anti Kutu/),
      "4",
    );

    expect(
      screen.getByText(/HPP dihitung ulang dengan HARGA BELI ASLI/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/HPP\s+sisa stok justru/),
    ).toBeInTheDocument();
  });

  it("caps a line at what has not already been returned", async () => {
    const receipt = demo.submitReceipt({
      supplierId: "sup_sps",
      warehouseId: "wh_utama",
      receiptType: "beli_putus",
      receiptDate: "2026-08-02",
      items: [{ productId: "prd_shampoo", qty: "10", costPerUnit: "50000" }],
    });
    const line = demo.receiptItemsOf(receipt._id)[0];

    demo.submitPurchaseReturn({
      originalReceiptId: receipt._id,
      returnDate: "2026-08-02",
      items: [{ originalReceiptItemId: line._id, qty: "6", reason: "rusak" }],
    });

    render(<PurchaseReturnForm receiptId={receipt._id} />);

    // 10 received, 6 already back → 4 left.
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
