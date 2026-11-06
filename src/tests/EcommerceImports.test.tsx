import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HistoryDetailDialog } from "@/features/ecommerce/components/HistoryDetailDialog";
import { OrderImportDialog } from "@/features/ecommerce/components/OrderImportDialog";
import { SettlementImportDialog } from "@/features/ecommerce/components/SettlementImportDialog";
import { marketplaceService } from "@/services/marketplace.service";
import type { MarketplaceHistoryEntry, MarketplaceStore } from "@/types/marketplace";

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
        { orderNo: "A1", category: "new", status: "Selesai", reason: null, paidAt: null, total: 56700, lineCount: 2, items: [{ productName: "Prama Dog Snack", variationName: "Bacon", qty: 1 }, { productName: "Prama Dog Snack", variationName: "Beef", qty: 1 }], unboundSkus: [], invoiceNumber: null },
        { orderNo: "A2", category: "held", status: "Selesai", reason: "SKU belum terikat", paidAt: null, total: 1000, lineCount: 1, items: [], unboundSkus: ["Foodie:AmericanBacon"], invoiceNumber: null },
        { orderNo: "A3", category: "skipped", status: "Batal", reason: "Status Batal tidak diimpor", paidAt: null, total: 0, lineCount: 1, items: [], unboundSkus: [], invoiceNumber: null },
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
    expect(screen.getByText("Prama Dog Snack · Bacon × 1, +1 barang lain")).toBeInTheDocument();
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
          deductions: 11173,
          pph22: 284,
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

    expect(await screen.findByText(/Total yang Dilepas di file/)).toBeInTheDocument();
    expect(screen.getByText("Rp11.173")).toBeInTheDocument();
    expect(screen.getByText("Jurnal yang akan dibuat")).toBeInTheDocument();
    // Debit and credit totals agree.
    expect(screen.getAllByText("Rp56.700").length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole("button", { name: "Lunasi 1 faktur" }));
    expect(await screen.findByText("1 faktur lunas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PMT/SHP/2610/0001" })).toHaveAttribute(
      "href",
      "/dashboard/ecommerce-sync/settlements/set1",
    );
    expect(screen.getByText("Potongan marketplace")).toBeInTheDocument();
  });
});

describe("SettlementImportDialog — TikTok", () => {
  const tiktok: MarketplaceStore = {
    ...store,
    _id: "store-2",
    marketplace: "tiktok",
    name: "Pawship",
    shopId: null,
    importStatuses: ["Perlu dikirim", "Menunggu diambil", "Dikirim", "Selesai"],
  };

  it("names TikTok's total, sets cancellations and adjustments apart, and books both", async () => {
    const user = userEvent.setup();
    marketplace.getAccounts.mockResolvedValue([
      {
        role: "saldo",
        label: "Dana cair masuk ke",
        defaultCode: "1106",
        account: { _id: "a", code: "1106-01", name: "Saldo TikTok – Pawship" },
        isDefault: false,
      },
    ]);
    marketplace.previewSettlement.mockResolvedValue({
      batchId: "s2",
      fileName: "income.xlsx",
      username: null,
      periodFrom: "2026-09-30T17:00:00.000Z",
      periodTo: "2026-10-30T17:00:00.000Z",
      totalReleased: 199336,
      settlingReleased: 199336,
      withdrawnTotal: 2851589,
      withdrawalCount: 15,
      warning: null,
      counts: { match: 1, variance: 0, not_found: 0, already_paid: 0, cancelled: 1, adjustment: 1 },
      items: [
        {
          orderNo: "586695372648908184",
          releasedAt: "2026-10-25T17:00:00.000Z",
          category: "match",
          channel: "tokopedia",
          invoiceId: "inv1",
          invoiceNumber: "INV/TTS/2610/0001",
          invoiceValue: 240350,
          comparisonValue: 240350,
          variance: 0,
          deductions: 43311,
          pph22: 1203,
          netReleased: 195836,
          notes: [],
        },
        {
          orderNo: "586799600086451275",
          releasedAt: "2026-10-27T17:00:00.000Z",
          category: "cancelled",
          channel: "tokopedia",
          invoiceId: null,
          invoiceNumber: null,
          invoiceValue: null,
          comparisonValue: 143000,
          variance: 0,
          deductions: 0,
          pph22: 0,
          netReleased: 0,
          notes: ["Pesanan batal, dana dikembalikan penuh ke pembeli"],
        },
        {
          orderNo: "7300000000000000001",
          releasedAt: "2026-10-29T17:00:00.000Z",
          category: "adjustment",
          kindLabel: "Kompensasi",
          invoiceId: null,
          invoiceNumber: null,
          invoiceValue: null,
          comparisonValue: 0,
          variance: 0,
          deductions: 0,
          pph22: 0,
          netReleased: 3500,
          notes: ["Kompensasi · pesanan 586695372648908184"],
        },
      ],
      journal: [
        { role: "saldo", accountCode: "1106-01", accountName: "Saldo TikTok – Pawship", debit: 199336, credit: 0 },
        { role: "admin", accountCode: "6109", accountName: "Biaya Admin Marketplace", debit: 43311, credit: 0 },
        { role: "pph22", accountCode: "1302", accountName: "PPh 22 Dibayar di Muka", debit: 1203, credit: 0 },
        { role: "variance", accountCode: "6111", accountName: "Selisih Pencairan", debit: 0, credit: 3500 },
        { role: "receivable", accountCode: "1105", accountName: "Piutang Marketplace", debit: 0, credit: 240350 },
      ],
    });
    marketplace.commitSettlement.mockResolvedValue({
      batchId: "s2",
      settlementId: "set2",
      number: "PMT/TTS/2610/0001",
      settled: 1,
      adjusted: 1,
      flagged: 0,
    });

    renderWithAuth(
      <SettlementImportDialog stores={[tiktok]} initialStoreId="store-2" onClose={jest.fn()} />,
    );

    expect(await screen.findByText("1106-01 Saldo TikTok – Pawship")).toBeInTheDocument();
    expect(screen.getByText(/TikTok Seller Center › Keuangan › Penghasilan/)).toBeInTheDocument();
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, xlsx("income_20261103223029(UTC+7).xlsx"));
    await user.click(screen.getByRole("button", { name: "Lanjut" }));

    expect(await screen.findByText(/Jumlah penyelesaian pembayaran di file/)).toBeInTheDocument();
    expect(screen.getByText(/Riwayat penarikan 15 transfer/)).toBeInTheDocument();
    expect(screen.getByText("Batal, tanpa faktur")).toBeInTheDocument();
    expect(screen.getAllByText("Penyesuaian").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Pesanan batal, dana dikembalikan penuh ke pembeli")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lunasi 1 faktur + 1 penyesuaian" }));
    await waitFor(() => expect(marketplace.commitSettlement).toHaveBeenCalledWith("store-2", "s2"));
    expect(await screen.findByText("1 faktur lunas · 1 penyesuaian")).toBeInTheDocument();
    expect(screen.getByText("Penyesuaian dicatat")).toBeInTheDocument();
    expect(screen.getByText("Dilewati, batal tanpa faktur")).toBeInTheDocument();
  });
});

describe("HistoryDetailDialog", () => {
  const entry: MarketplaceHistoryEntry = {
    _id: "h1",
    storeId: "store-1",
    process: "orders",
    fileId: "f1",
    fileName: "Order.all.xlsx",
    result: { created: 1, existing: 2, held: 0, skipped: 3 },
    documents: [{ kind: "customer_invoice", id: "inv1", number: "INV/SHP/2610/0038", ref: "A1" }],
    createdBy: "u1",
    createdByName: "Rani",
    createdAt: "2026-10-24T16:40:00.000Z",
  };

  it("shows the run, its result and a way into each invoice", () => {
    renderWithAuth(<HistoryDetailDialog entry={entry} storeName="pawship.id" onClose={jest.fn()} />);

    expect(screen.getByText("Shopee · pawship.id")).toBeInTheDocument();
    expect(screen.getByText("Rani")).toBeInTheDocument();
    expect(screen.getByText("Sudah ada, dilewati")).toBeInTheDocument();
    expect(screen.queryByText("Gagal")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buka" })).toHaveAttribute("href", "/dashboard/sales/invoice/inv1");
    expect(screen.queryByRole("button", { name: "Unduh ulang file" })).not.toBeInTheDocument();
  });

  it("offers the file again on a stock export, and opens a payout's page", () => {
    const { rerender } = renderWithAuth(
      <HistoryDetailDialog
        entry={{ ...entry, process: "stock_export", documents: [], result: { changed: 1, same: 1, unbound: 2 } }}
        storeName="pawship.id"
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Unduh ulang file" })).toBeInTheDocument();

    rerender(
      <HistoryDetailDialog
        entry={{
          ...entry,
          process: "settlement",
          documents: [{ kind: "marketplace_settlement", id: "s1", number: "PMT/SHP/2610/0001", ref: null }],
          result: { settled: 4 },
        }}
        storeName="pawship.id"
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText("Pembayaran dibuat")).toBeInTheDocument();
    expect(screen.getByText("PMT/SHP/2610/0001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buka" })).toHaveAttribute(
      "href",
      "/dashboard/ecommerce-sync/settlements/s1",
    );
  });
});
