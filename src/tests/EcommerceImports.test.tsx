import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OrderImportDialog } from "@/features/ecommerce/components/OrderImportDialog";
import { SettlementImportDialog } from "@/features/ecommerce/components/SettlementImportDialog";
import { marketplaceService } from "@/services/marketplace.service";
import type { MarketplaceStore } from "@/types/marketplace";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/marketplace.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const marketplace = marketplaceService as jest.Mocked<typeof marketplaceService>;

const store: MarketplaceStore = {
  _id: "store-1",
  marketplace: "shopee",
  name: "pawship.id",
  shopUsername: null,
  shopId: "934421260",
  warehouseId: "wh-1",
  warehouseName: "Gudang Pusat",
  branchId: "br-1",
  branchName: "Pusat",
  stockBuffer: 0,
  isActive: true,
  importStatuses: ["Perlu Dikirim", "Sedang Dikirim", "Telah Dikirim", "Selesai"],
  template: {
    fileId: "f1",
    fileName: "mass_update_sales_info_934421260_1.xlsx",
    stockColumn: "I",
    variantCount: 4953,
    uploadedAt: "2026-10-28T03:00:00.000Z",
    uploadedBy: null,
  },
  lastStockExportAt: null,
  createdAt: "2026-10-28T03:00:00.000Z",
  updatedAt: "2026-10-28T03:00:00.000Z",
};

const xlsx = (name: string) =>
  new File(["x"], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

describe("OrderImportDialog", () => {
  it("previews the file, then saves the new orders as invoices", async () => {
    const user = userEvent.setup();
    marketplace.previewOrders.mockResolvedValue({
      batchId: "b1",
      fileName: "Order.all.xlsx",
      warning: null,
      counts: { new: 1, held: 1, needs_action: 0, existing: 0, skipped: 1 },
      items: [
        { orderNo: "A1", category: "new", status: "Selesai", reason: null, paidAt: null, total: 56700, lineCount: 2, unboundSkus: [], invoiceNumber: null },
        { orderNo: "A2", category: "held", status: "Selesai", reason: "SKU belum terikat", paidAt: null, total: 1000, lineCount: 1, unboundSkus: ["Foodie:AmericanBacon"], invoiceNumber: null },
        { orderNo: "A3", category: "skipped", status: "Batal", reason: "Status Batal tidak diimpor", paidAt: null, total: 0, lineCount: 1, unboundSkus: [], invoiceNumber: null },
      ],
    });
    marketplace.commitOrders.mockResolvedValue({
      batchId: "b1",
      created: [{ orderNo: "A1", invoiceId: "inv1", invoiceNumber: "INV/SHP/2610/0001" }],
      held: 1,
      flagged: 0,
      failed: [],
    });
    const onDone = jest.fn();

    renderWithAuth(
      <OrderImportDialog stores={[store]} initialStoreId="store-1" onClose={jest.fn()} onDone={onDone} />,
    );

    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, xlsx("Order.all.xlsx"));
    await user.click(screen.getByRole("button", { name: "Lanjut" }));

    expect(await screen.findByText("SKU belum terikat: Foodie:AmericanBacon")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Simpan 1 faktur" }));

    await waitFor(() => expect(marketplace.commitOrders).toHaveBeenCalledWith("store-1", "b1"));
    expect(onDone).toHaveBeenCalled();
    expect(await screen.findByText("INV/SHP/2610/0001")).toBeInTheDocument();
  });
});

describe("SettlementImportDialog", () => {
  it("shows the total check and the journal, then settles", async () => {
    const user = userEvent.setup();
    marketplace.getAccounts.mockResolvedValue([
      {
        role: "saldo",
        label: "Dana cair masuk ke",
        defaultCode: "1106",
        account: { _id: "a", code: "1106", name: "Saldo Marketplace" },
        isDefault: true,
      },
    ]);
    marketplace.previewSettlement.mockResolvedValue({
      batchId: "s1",
      fileName: "Income.xlsx",
      username: "pawship.id",
      periodFrom: "2026-10-18T17:00:00.000Z",
      periodTo: "2026-10-24T17:00:00.000Z",
      totalReleased: 45243,
      settlingReleased: 45243,
      counts: { match: 1, variance: 0, not_found: 0, already_paid: 0 },
      items: [
        {
          orderNo: "261023CFCJQP5T",
          releasedAt: null,
          category: "match",
          invoiceId: "inv1",
          invoiceNumber: "INV/SHP/2610/0001",
          invoiceValue: 56700,
          comparisonValue: 56700,
          variance: 0,
          netReleased: 45243,
          notes: [],
        },
      ],
      journal: [
        { role: "saldo", accountCode: "1106", accountName: "Saldo Marketplace", debit: 45243, credit: 0 },
        { role: "admin", accountCode: "6109", accountName: "Biaya Admin Marketplace", debit: 6637, credit: 0 },
        { role: "program", accountCode: "6110", accountName: "Biaya Program Marketplace", debit: 4536, credit: 0 },
        { role: "pph22", accountCode: "1302", accountName: "PPh 22 Dibayar di Muka", debit: 284, credit: 0 },
        { role: "receivable", accountCode: "1105", accountName: "Piutang Marketplace", debit: 0, credit: 56700 },
      ],
    });
    marketplace.commitSettlement.mockResolvedValue({
      batchId: "s1",
      settlementId: "set1",
      number: "PMT/SHP/2610/0001",
      settled: 1,
    });

    renderWithAuth(
      <SettlementImportDialog stores={[store]} initialStoreId="store-1" onClose={jest.fn()} />,
    );

    expect(await screen.findByText("1106 Saldo Marketplace")).toBeInTheDocument();
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, xlsx("Income.sudah dilepas.xlsx"));
    await user.click(screen.getByRole("button", { name: "Lanjut" }));

    expect(await screen.findByText(/Total cocok/)).toBeInTheDocument();
    expect(screen.getByText("Jurnal yang akan dibuat")).toBeInTheDocument();
    // Debit and credit totals agree.
    expect(screen.getAllByText("Rp56.700").length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole("button", { name: "Simpan & lunasi 1 faktur" }));
    expect(await screen.findByText(/PMT\/SHP\/2610\/0001 tersimpan/)).toBeInTheDocument();
  });
});
