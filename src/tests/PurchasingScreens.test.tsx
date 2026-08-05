import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  PayablesScreen,
  PurchaseReturnForm,
  ReceiptForm,
  ReceiptsScreen,
  SupplierForm,
  SuppliersScreen,
} from "@/features/purchasing";
import * as demo from "@/features/inventory/data/demoStore";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
}));

/**
 * Mount tests for the four purchasing screens.
 *
 * Deep on the things a reviewer would otherwise have to discover by clicking:
 * that the receipt form changes meaning between outright and consigned, that
 * the HPP arithmetic appears before saving, and that a return refuses to be
 * entered free-hand.
 */
beforeEach(() => {
  demo.resetState();
  push.mockClear();
});

describe("SuppliersScreen", () => {
  it("lists the seeded suppliers with their terms", () => {
    render(<SuppliersScreen />);

    expect(screen.getByText("PT Sumber Pakan Sejahtera")).toBeInTheDocument();
    expect(screen.getByText("CV Anugerah Petshop")).toBeInTheDocument();
    expect(screen.getAllByText("30 hari").length).toBeGreaterThan(0);
  });

  it("marks a consignment supplier distinctly", () => {
    // Consigned goods look like owned stock on every other screen; the badge is
    // the one cue that they are not.
    render(<SuppliersScreen />);

    expect(screen.getByText("konsinyasi")).toBeInTheDocument();
  });

  it("filters by name", async () => {
    const user = userEvent.setup();
    render(<SuppliersScreen />);

    await user.type(screen.getByLabelText("Cari supplier"), "vetindo");

    expect(screen.getByText("PT Vetindo Farma")).toBeInTheDocument();
    expect(screen.queryByText("CV Anugerah Petshop")).not.toBeInTheDocument();
  });
});

describe("SupplierForm", () => {
  it("requires a name", async () => {
    const user = userEvent.setup();
    render(<SupplierForm />);

    await user.click(screen.getByRole("button", { name: "Simpan supplier" }));

    expect(screen.getByText("Nama supplier wajib diisi.")).toBeInTheDocument();
  });

  it("rejects a duplicate name", async () => {
    const user = userEvent.setup();
    render(<SupplierForm />);

    await user.type(screen.getByLabelText(/Nama supplier/), "PT Vetindo Farma");
    await user.click(screen.getByRole("button", { name: "Simpan supplier" }));

    expect(screen.getByText(/Sudah ada supplier dengan nama ini/)).toBeInTheDocument();
  });

  it("explains what the payment term drives", () => {
    render(<SupplierForm />);

    expect(
      screen.getByText(/Hari sampai jatuh tempo\. 0 = bayar saat terima\./),
    ).toBeInTheDocument();
  });

  it("saves and returns to the list", async () => {
    const user = userEvent.setup();
    render(<SupplierForm />);

    await user.type(screen.getByLabelText(/Nama supplier/), "CV Baru Jaya");
    await user.click(screen.getByRole("button", { name: "Simpan supplier" }));

    expect(
      demo.getState().suppliers.some((s) => s.name === "CV Baru Jaya"),
    ).toBe(true);
    expect(push).toHaveBeenCalledWith("/dashboard/purchasing/suppliers");
  });
});

describe("ReceiptForm", () => {
  it("mounts on outright purchase, with invoice fields visible", () => {
    render(<ReceiptForm />);

    expect(screen.getByLabelText(/Nomor faktur supplier/)).toBeInTheDocument();
    expect(screen.getByLabelText("PPN")).toBeInTheDocument();
  });

  it("hides the invoice fields on consignment and says why", async () => {
    const user = userEvent.setup();
    render(<ReceiptForm />);

    await user.click(screen.getByRole("button", { name: /Konsinyasi/ }));

    expect(screen.queryByLabelText("PPN")).not.toBeInTheDocument();
    expect(
      screen.getByText(/tidak membuat faktur utang dan tidak menjurnal/),
    ).toBeInTheDocument();
  });

  it("shows the HPP arithmetic once a line is priced", async () => {
    const user = userEvent.setup();
    render(<ReceiptForm />);

    await user.click(screen.getByLabelText("Tambah barang"));
    await user.click(
      screen.getByRole("option", { name: /Shampoo Petcare Anti Kutu/ }),
    );

    expect(
      screen.getByText(/Perhitungan HPP rata-rata tertimbang/),
    ).toBeInTheDocument();
  });

  it("refuses to save without any goods", async () => {
    render(<ReceiptForm />);

    // Nothing to receive means nothing to record — the button stays disabled
    // rather than producing an empty document.
    expect(
      screen.getByRole("button", { name: /Simpan & terima barang/ }),
    ).toBeDisabled();
  });

  it("records the receipt and lands on its detail page", async () => {
    const user = userEvent.setup();
    render(<ReceiptForm />);

    await user.click(screen.getByLabelText("Tambah barang"));
    await user.click(
      screen.getByRole("option", { name: /Shampoo Petcare Anti Kutu/ }),
    );
    await user.click(screen.getByRole("button", { name: /Simpan & terima barang/ }));

    const receipt = demo.getState().receipts[0];
    expect(receipt).toBeDefined();
    expect(push).toHaveBeenCalledWith(
      `/dashboard/purchasing/receipts/${receipt._id}`,
    );
    // The payable is created by the receipt, not entered separately.
    expect(receipt.invoiceId).not.toBeNull();
  });
});

describe("ReceiptsScreen", () => {
  it("explains that receipts are corrected by returning, not editing", () => {
    render(<ReceiptsScreen />);

    expect(
      screen.getByText(/Penerimaan tidak bisa diedit atau dihapus/),
    ).toBeInTheDocument();
  });

  it("marks a consignment receipt as having no invoice", () => {
    demo.submitReceipt({
      supplierId: "sup_anugerah",
      warehouseId: "wh_utama",
      receiptType: "konsinyasi",
      receiptDate: "2026-08-02",
      items: [
        { productId: "prd_pasir", qty: "5", costPerUnit: "58000", batchCode: "K1" },
      ],
    });

    render(<ReceiptsScreen />);

    expect(screen.getByText("tanpa faktur")).toBeInTheDocument();
  });
});

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
