import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosCloseShiftDialog } from "@/features/pos/components/PosCloseShiftDialog";
import { posService } from "@/services/pos.service";
import type { PosShift, PosTransaction, PosXReport } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/pos.service");
jest.mock("@/features/tenant", () => ({
  ...jest.requireActual("@/features/tenant"),
  useTenant: () => ({ tenant: { name: "Pawship Update" }, loading: false, error: null }),
}));

const mockedPos = posService as jest.Mocked<typeof posService>;

const OPEN_SHIFT = {
  _id: "shift-1",
  tenantId: "t1",
  branchId: "b1",
  warehouseId: "w1",
  shiftNumber: "SHF-2026-11-0011",
  cashierUserId: "auth-user",
  openedAt: "2026-11-17T01:00:00.000Z",
  openingCash: "500000.0000",
  closedAt: null,
  countedCash: null,
  expectedCash: null,
  difference: null,
  channelCounts: [],
  closingNotes: null,
  status: "open",
  createdAt: "2026-11-17T01:00:00.000Z",
  updatedAt: "2026-11-17T01:00:00.000Z",
} as PosShift;

const CLOSED_SHIFT = {
  ...OPEN_SHIFT,
  status: "closed",
  closedAt: "2026-11-17T10:50:00.000Z",
  expectedCash: "630000.0000",
  countedCash: "620000.0000",
  difference: "-10000.0000",
  closingNotes: "Kurang kembalian",
} as PosShift;

const report = (shift: PosShift): PosXReport =>
  ({
    shift,
    offlinePending: [],
    transactionCount: 1,
    breakdown: [
      {
        channelId: "cash-1",
        channelType: "cash",
        channelName: "Kas Barat",
        count: 1,
        amount: "130000.0000",
        change: "0.0000",
        net: "130000.0000",
      },
    ],
    refunds: { count: 0, cashRefunds: "0.0000" },
    totals: {
      takings: "130000.0000",
      cashTakings: "130000.0000",
      expectedCash: "630000.0000",
    },
  }) as PosXReport;

const SALE = {
  _id: "sale-1",
  transactionNumber: "POS-STR002-K2-261117-0001",
  paidAt: "2026-11-17T02:00:00.000Z",
  customer: { _id: "c1", name: "Salwa", phone: null },
  payments: [
    {
      channelId: "cash-1",
      channelType: "cash",
      channelName: "Kas Barat",
      amount: "130000.0000",
      change: "0.0000",
      reference: null,
    },
  ],
} as unknown as PosTransaction;

const page = <T,>(items: T[]) => ({
  items,
  pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
});

beforeEach(() => {
  jest.clearAllMocks();
  window.print = jest.fn();
  mockedPos.xReport.mockImplementation(async () =>
    report(mockedPos.closeShift.mock.calls.length > 0 ? CLOSED_SHIFT : OPEN_SHIFT),
  );
  mockedPos.closeShift.mockResolvedValue(CLOSED_SHIFT);
  mockedPos.listTransactions.mockResolvedValue(page([SALE]) as never);
  mockedPos.listShifts.mockResolvedValue(
    page([{ ...CLOSED_SHIFT, branchName: "Buloo 2", cashierName: "Owner" }]) as never,
  );
});

async function closeTheShift(onClosed = jest.fn()) {
  const user = userEvent.setup();
  renderWithAuth(
    <PosCloseShiftDialog
      shift={OPEN_SHIFT}
      open
      onClosed={onClosed}
      onOpenChange={jest.fn()}
    />,
  );

  await user.click(await screen.findByRole("button", { name: /lihat detail/i }));
  await user.type(
    await screen.findByLabelText("Jumlah Kas dihitung"),
    "620000",
  );
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  await user.click(screen.getByRole("button", { name: "Tutup kasir" }));

  return { user, onClosed };
}

/**
 * Laporan pembayaran kasir (17 November 2026) — offered right after Tutup
 * Kasir, as an A4 printed through the browser ("Simpan sebagai PDF").
 */
describe("Tutup kasir — the payment report", () => {
  it("stays open on a done view instead of handing straight back to the till", async () => {
    const { onClosed } = await closeTheShift();

    expect(await screen.findByText("Kasir sudah ditutup")).toBeInTheDocument();
    // The gap the cashier just counted, said once more before they leave.
    expect(screen.getByText("−Rp 10.000")).toBeInTheDocument();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("prints the shift's report: counted against expected, then the sales", async () => {
    const { user } = await closeTheShift();

    await user.click(
      await screen.findByRole("button", { name: /unduh laporan/i }),
    );

    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));

    const sheet = document.querySelector("[data-print-root]") as HTMLElement;
    expect(sheet).not.toBeNull();
    const inSheet = within(sheet);

    expect(inSheet.getByText("LAPORAN PEMBAYARAN KASIR")).toBeInTheDocument();
    expect(inSheet.getByText("SHF-2026-11-0011")).toBeInTheDocument();
    expect(inSheet.getAllByText("Buloo 2").length).toBeGreaterThan(0);
    // Expected, counted and the gap the shift stored when it closed.
    expect(inSheet.getAllByText("Rp 630.000").length).toBeGreaterThan(0);
    expect(inSheet.getAllByText("Rp 620.000").length).toBeGreaterThan(0);
    expect(inSheet.getAllByText("−Rp 10.000").length).toBeGreaterThan(0);
    expect(inSheet.getByText("Kurang kembalian")).toBeInTheDocument();
    // And the sale behind the cash figure.
    expect(inSheet.getByText("POS-STR002-K2-261117-0001")).toBeInTheDocument();
    expect(document.title).toBe("Laporan Pembayaran SHF-2026-11-0011");
  });

  it("still prints the summary when the sales list cannot be read", async () => {
    mockedPos.listTransactions
      .mockResolvedValueOnce(page([SALE]) as never) // the count view's own list
      .mockRejectedValue(new Error("403"));
    const { user } = await closeTheShift();

    await user.click(
      await screen.findByRole("button", { name: /unduh laporan/i }),
    );

    await waitFor(() => expect(window.print).toHaveBeenCalled());
    const sheet = document.querySelector("[data-print-root]") as HTMLElement;
    expect(
      within(sheet).getByText(/daftar transaksi tidak bisa dimuat/i),
    ).toBeInTheDocument();
  });

  it("goes back to the till on Selesai", async () => {
    const { user, onClosed } = await closeTheShift();

    await user.click(await screen.findByRole("button", { name: "Selesai" }));

    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});
