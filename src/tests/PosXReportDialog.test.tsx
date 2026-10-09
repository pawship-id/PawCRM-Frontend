import { render, screen } from "@testing-library/react";

import { PosXReportDialog } from "@/features/pos/components/PosXReportDialog";
import { posService } from "@/services/pos.service";
import type { PosXReport } from "@/types/api";

jest.mock("@/services/pos.service", () => ({
  posService: { xReport: jest.fn() },
}));

const report = (overrides: Partial<PosXReport> = {}) =>
  ({
    shift: { openingCash: "500000.0000" },
    transactionCount: 3,
    breakdown: [
      {
        channelId: "c1",
        channelType: "cash",
        channelName: "Kas Toko",
        count: 2,
        amount: "300000.0000",
        change: "0.0000",
        net: "300000.0000",
        refunded: "68700.0000",
        netAfterRefunds: "231300.0000",
      },
    ],
    refunds: {
      count: 1,
      cashRefunds: "68700.0000",
      returnCount: 1,
      total: "68700.0000",
      nonCash: "0.0000",
    },
    totals: {
      takings: "300000.0000",
      netSales: "231300.0000",
      cashTakings: "231300.0000",
      expectedCash: "731300.0000",
    },
    ...overrides,
  }) as PosXReport;

describe("PosXReportDialog — the way a till report reads", () => {
  it("shows gross, the returns, and the net, with each method after refunds", async () => {
    (posService.xReport as jest.Mock).mockResolvedValue(report());

    render(<PosXReportDialog shiftId="s1" onOpenChange={jest.fn()} />);

    expect(await screen.findByText("Penjualan kotor")).toBeInTheDocument();
    expect(screen.getByText("Retur (1)")).toBeInTheDocument();
    expect(screen.getByText("Penjualan bersih")).toBeInTheDocument();
    // The method line carries the net of the refund, with the working beneath.
    expect(screen.getByText(/− retur/)).toBeInTheDocument();
  });

  it("draws no return line when nothing was returned", async () => {
    (posService.xReport as jest.Mock).mockResolvedValue(
      report({
        refunds: { count: 0, cashRefunds: "0.0000", total: "0.0000" },
      }),
    );

    render(<PosXReportDialog shiftId="s1" onOpenChange={jest.fn()} />);

    await screen.findByText("Penjualan kotor");
    expect(screen.queryByText(/^Retur \(/)).toBeNull();
  });
});
