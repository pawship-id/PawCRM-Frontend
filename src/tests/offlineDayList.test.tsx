import { screen } from "@testing-library/react";

import { TodayTransactionsDialog } from "@/features/pos/components/TodayTransactionsDialog";
import { PosXReportDialog } from "@/features/pos/components/PosXReportDialog";
import { enqueue, type QueuedSale } from "@/features/pos/offline/queue";
import { setOfflineState } from "@/features/pos/offline/store";
import { posService } from "@/services/pos.service";
import type { PosTransaction, PosXReport } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/pos.service");
const mockedPos = posService as jest.Mocked<typeof posService>;

/**
 * POS OFFLINE MODE (19 October 2026) — what the day's list and the X-Report
 * say about sales still on a device.
 */
function unsent(over: Partial<QueuedSale> = {}): QueuedSale {
  return {
    clientTxnId: "ctx-day-0001",
    tenantId: "t1",
    deviceId: "d1",
    sale: {
      clientTxnId: "ctx-day-0001",
      transactionNumber: "POS-BRT-K1-261019-0004",
      receiptToken: null,
      shiftId: "s1",
      cashierUserId: "u1",
      paidAt: new Date().toISOString(),
      customerId: null,
      items: [],
      payments: [],
      totals: { grandTotal: "75000.0000" },
    },
    priced: { _id: "ctx-day-0001", items: [{}, {}] } as unknown as PosTransaction,
    paymentNames: [],
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    syncedAt: null,
    posTransactionId: null,
    reasons: [],
    flags: [],
    message: null,
    ...over,
  };
}

beforeEach(() => {
  setOfflineState({
    loaded: true,
    tenantId: "t1",
    device: {
      tenantId: "t1",
      deviceId: "d1",
      secret: "s",
      code: "K1",
      name: null,
      branchId: "b1",
      branchCode: "BRT",
      registeredAt: "",
    },
  });
  mockedPos.listTransactions.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
  });
});

describe("Transaksi hari ini — sales still on this device", () => {
  it("lists an unsent sale above the server's, with a word for why", async () => {
    await enqueue(unsent());
    renderWithAuth(
      <TodayTransactionsDialog open onVoid={jest.fn()} onReturn={jest.fn()} onReceipt={jest.fn()} onOpenChange={jest.fn()} />,
    );

    expect(await screen.findByText("POS-BRT-K1-261019-0004")).toBeInTheDocument();
    expect(screen.getByText("Belum terkirim")).toBeInTheDocument();
    expect(screen.queryByText("Belum ada penjualan hari ini.")).toBeNull();
  });

  it("leaves a synced sale to the server's list, so nothing shows twice", async () => {
    await enqueue(unsent({ status: "synced" }));
    renderWithAuth(
      <TodayTransactionsDialog open onVoid={jest.fn()} onReturn={jest.fn()} onReceipt={jest.fn()} onOpenChange={jest.fn()} />,
    );

    expect(await screen.findByText("Belum ada penjualan hari ini.")).toBeInTheDocument();
  });

  it("opens offline on the device's sales alone, without asking the server", async () => {
    await enqueue(unsent());
    renderWithAuth(
      <TodayTransactionsDialog
        open
        offline
        onVoid={jest.fn()}
        onReturn={jest.fn()}
        onReceipt={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    expect(await screen.findByText("POS-BRT-K1-261019-0004")).toBeInTheDocument();
    expect(screen.getByText(/Mode offline: yang tampil hanya/)).toBeInTheDocument();
    expect(mockedPos.listTransactions).not.toHaveBeenCalled();
  });
});

describe("X-Report — a cashier's sales still on another till", () => {
  it("names the till and how many it holds", async () => {
    mockedPos.xReport.mockResolvedValue({
      shift: { _id: "s1" },
      transactionCount: 2,
      breakdown: [],
      refunds: { total: "0", cashRefunds: "0", returnCount: 0, byMethod: [] },
      totals: { takings: "100000", cashTakings: "100000", expectedCash: "600000", net: "100000" },
      offlinePending: [
        { deviceId: "d2", code: "K2", name: "Tablet belakang", count: 3, lastSeenAt: null },
      ],
    } as unknown as PosXReport);

    renderWithAuth(<PosXReportDialog shiftId="s1" onOpenChange={jest.fn()} />);

    expect(await screen.findByText(/Masih ada 3 transaksi offline/)).toBeInTheDocument();
    expect(screen.getByText(/K2 \(Tablet belakang\): 3 transaksi/)).toBeInTheDocument();
  });
});
