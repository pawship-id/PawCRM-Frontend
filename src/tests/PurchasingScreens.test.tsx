import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  PayablesScreen,
  PurchaseReturnForm,
  PurchasingHub,
} from "@/features/purchasing";
import * as demo from "@/features/inventory/data/demoStore";

import { renderWithAuth } from "./helpers/renderWithAuth";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
}));

/**
 * Mount tests for the purchasing screens STILL ON THE PROTOTYPE STORE.
 *
 * Deep on the things a reviewer would otherwise have to discover by clicking:
 * that a return refuses to be entered free-hand, and where the payables hub
 * draws the line between late and merely due.
 */
beforeEach(() => {
  demo.resetState();
  push.mockClear();
});

/*
 * TWO SETS OF SCREENS HAVE LEFT THIS FILE, for the same reason both times: they
 * run against the real API now, so their tests mock services instead of seeding
 * `demoStore`.
 *
 *   suppliers        → SuppliersTable / SupplierCreateForm / SupplierSelect /
 *                      supplier.service test files.
 *   goods receipts   → ReceiptScreens.test.tsx and goodsReceipt.service.test.ts.
 *
 * What remains below is what remains on the prototype store: payables, returns
 * and the hub that reads both.
 */

describe("PayablesScreen", () => {
  it("says where invoices come from when there are none", () => {
    render(<PayablesScreen />);

    expect(
      screen.getByText(/Faktur muncul setelah ada penerimaan beli putus/),
    ).toBeInTheDocument();
  });

  it("lists a payable once a receipt has created one", () => {
    demo.submitReceipt({
      supplierId: "sup_sps",
      warehouseId: "wh_utama",
      receiptType: "beli_putus",
      receiptDate: "2026-08-02",
      items: [{ productId: "prd_shampoo", qty: "10", costPerUnit: "50000" }],
    });

    render(<PayablesScreen />);

    expect(screen.getByText("PT Sumber Pakan Sejahtera")).toBeInTheDocument();
    expect(screen.getByText("belum dibayar")).toBeInTheDocument();
  });

  it("offers an overdue filter separate from unpaid", () => {
    // Different questions: one is planning, the other is triage.
    render(<PayablesScreen />);

    expect(screen.getByRole("button", { name: "Belum dibayar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jatuh tempo" })).toBeInTheDocument();
  });
});

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

/**
 * The hub's job is the SPLIT between the two lists, so that is what these
 * assert: an invoice belongs to exactly one of them, and the boundary sits
 * where the due date passes rather than where a status changes.
 *
 * Dates are relative to the run rather than fixed strings — the fixtures seed no
 * invoices, so each test receives goods dated backwards from today and lets the
 * supplier's own 30-day term decide where the resulting invoice lands.
 */
describe("PurchasingHub", () => {
  /** SPS pays in 30 days; a receipt this many days ago is due `30 - n` from now. */
  function receiveDaysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);

    return demo.submitReceipt({
      supplierId: "sup_sps",
      warehouseId: "wh_utama",
      receiptType: "beli_putus",
      receiptDate: date.toISOString().slice(0, 10),
      items: [{ productId: "prd_shampoo", qty: "1", costPerUnit: "50000" }],
    });
  }

  function panel(title: string): HTMLElement {
    return screen.getByText(title).closest("section")!;
  }

  it("offers every section of the module", () => {
    renderWithAuth(<PurchasingHub />);

    expect(screen.getByText("Supplier")).toBeInTheDocument();
    expect(screen.getByText("Penerimaan Barang")).toBeInTheDocument();
    expect(screen.getByText("Utang Supplier")).toBeInTheDocument();
    expect(screen.getByText("Retur ke Supplier")).toBeInTheDocument();
    expect(screen.getByText("3 aktif")).toBeInTheDocument();
  });

  it("says so plainly when nothing is due", () => {
    renderWithAuth(<PurchasingHub />);

    expect(
      screen.getByText("Tidak ada faktur yang lewat jatuh tempo."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tidak ada faktur yang jatuh tempo dalam 7 hari/),
    ).toBeInTheDocument();
  });

  it("puts a late invoice in the overdue list, with how late it is", () => {
    receiveDaysAgo(40); // due 10 days ago

    renderWithAuth(<PurchasingHub />);

    const late = panel("Lewat jatuh tempo");
    expect(within(late).getByText("telat 10 hari")).toBeInTheDocument();
    expect(
      within(late).getByText("PT Sumber Pakan Sejahtera"),
    ).toBeInTheDocument();
  });

  it("puts an invoice due this week in the other list, and only there", () => {
    receiveDaysAgo(27); // due in 3 days

    renderWithAuth(<PurchasingHub />);

    const soon = panel("Jatuh tempo minggu ini");
    expect(within(soon).getByText("3 hari")).toBeInTheDocument();

    // The two lists are read side by side and their totals added up, so an
    // invoice that appeared in both would be counted twice.
    expect(
      within(panel("Lewat jatuh tempo")).queryByText("PT Sumber Pakan Sejahtera"),
    ).not.toBeInTheDocument();
  });

  it("ignores an invoice due beyond the week", () => {
    receiveDaysAgo(10); // due in 20 days

    renderWithAuth(<PurchasingHub />);

    expect(
      screen.getByText(/Tidak ada faktur yang jatuh tempo dalam 7 hari/),
    ).toBeInTheDocument();
  });

  it("drops a paid invoice from both lists", () => {
    const receipt = receiveDaysAgo(40);
    const invoice = demo
      .getState()
      .invoices.find((i) => i.goodsReceiptId === receipt._id)!;

    demo.submitPayment({
      invoiceId: invoice._id,
      amount: invoice.total,
      paymentDate: new Date().toISOString().slice(0, 10),
      method: "transfer",
    });

    renderWithAuth(<PurchasingHub />);

    // Its due date is still in the past — only the settlement takes it off.
    expect(
      screen.getByText("Tidak ada faktur yang lewat jatuh tempo."),
    ).toBeInTheDocument();
  });

  it("hides the debt entirely from a role that may not read invoices", () => {
    receiveDaysAgo(40);

    renderWithAuth(<PurchasingHub />, {
      isSuperAdmin: false,
      permissions: [{ feature: "suppliers", actions: ["read"] }],
    });

    expect(screen.getByText("Supplier")).toBeInTheDocument();
    expect(screen.queryByText("Utang Supplier")).not.toBeInTheDocument();
    expect(screen.queryByText("Lewat jatuh tempo")).not.toBeInTheDocument();
  });
});
