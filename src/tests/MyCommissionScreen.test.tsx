import { screen, waitFor } from "@testing-library/react";

import { MyCommissionScreen } from "@/features/reports";
import { reportService } from "@/services/report.service";
import type { MyCommission } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/report.service");

const reports = reportService as jest.Mocked<typeof reportService>;

const mine = (overrides: Partial<MyCommission> = {}): MyCommission =>
  ({
    period: "2026-09",
    earned: {
      groomerUserId: "user-1",
      groomerName: "Sinta",
      rows: 12,
      reversedRows: 0,
      amount: "300000.0000",
    },
    total: "300000.0000",
    outstanding: {
      groomerUserId: "user-1",
      branchId: "branch-1",
      periods: ["2026-08", "2026-09"],
      amount: "450000.0000",
      recordCount: 18,
    },
    ...overrides,
  }) as MyCommission;

beforeEach(() => {
  jest.clearAllMocks();
  reports.myCommissions.mockResolvedValue(mine());
});

/**
 * KOMISI SAYA — a groomer's own pay, and nobody else's.
 *
 * Rekap Komisi is gated on `users:read` because it names every groomer and what
 * they are owed. A groomer has no business holding that, so until this screen
 * existed they could see EVERYBODY's pay or nobody's — and the second is what
 * actually happened.
 */
describe("MyCommissionScreen", () => {
  it("shows what was earned this month and what is still owed", async () => {
    /*
      TWO NUMBERS ANSWERING DIFFERENT QUESTIONS. Earned is one MONTH's work — a
      payslip question. Outstanding is everything closed and unpaid, which may
      span months, and is what somebody means by "kapan saya dibayar".
    */
    renderWithAuth(<MyCommissionScreen />, { isSuperAdmin: false });

    expect(await screen.findByText("Rp 300.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 450.000")).toBeInTheDocument();
    expect(screen.getByText(/2026-08, 2026-09/)).toBeInTheDocument();
  });

  it("never asks the server about anybody else", async () => {
    /*
      THE RULE THAT MAKES THIS SAFE WITHOUT A GRANT. The person comes from the
      session on the server; a `groomerUserId` on the wire would be the whole
      shop's payroll reachable by anybody who can edit a URL.
    */
    renderWithAuth(<MyCommissionScreen />, { isSuperAdmin: false });

    await waitFor(() => expect(reports.myCommissions).toHaveBeenCalled());
    expect(reports.myCommissions).toHaveBeenCalledWith({
      period: expect.stringMatching(/^\d{4}-\d{2}$/),
    });
    expect(reports.myCommissions).not.toHaveBeenCalledWith(
      expect.objectContaining({ groomerUserId: expect.anything() }),
    );
  });

  it("says 'belum ada' rather than Rp 0 for a month with no work", async () => {
    /*
      "You earned nothing" and "there is nothing here yet" are different
      sentences, and a zero says the first when the second is true.
    */
    reports.myCommissions.mockResolvedValue(
      mine({ earned: null, total: "0.0000" }),
    );

    renderWithAuth(<MyCommissionScreen />, { isSuperAdmin: false });

    expect(
      await screen.findByText(/belum ada komisi di bulan ini/i),
    ).toBeInTheDocument();
  });

  it("explains why the two numbers can disagree", async () => {
    /*
      Work earns the moment it finishes; it becomes a DEBT only when the month is
      closed. Somebody seeing "Bulan ini: Rp 300.000" beside "Belum dibayar: Rp 0"
      would reasonably conclude they had been paid.
    */
    reports.myCommissions.mockResolvedValue(
      mine({
        outstanding: {
          groomerUserId: "user-1",
          branchId: "branch-1",
          periods: [],
          amount: "0.0000",
          recordCount: 0,
        },
      }),
    );

    renderWithAuth(<MyCommissionScreen />, { isSuperAdmin: false });

    /*
      AWAITED ON THE CARD, not on the note below it. The note renders while the
      request is still in flight — awaiting it resolved instantly and the
      assertion below then ran against a spinner.
    */
    expect(
      await screen.findByText(/tidak ada yang menunggu dibayar/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/setelah pemilik menutup bulannya/i),
    ).toBeInTheDocument();
  });

  it("renders for somebody holding no permissions at all", async () => {
    // The point of the screen: a groomer needs no grant to be told their own pay.
    renderWithAuth(<MyCommissionScreen />, {
      isSuperAdmin: false,
      permissions: [],
    });

    expect(await screen.findByText("Rp 300.000")).toBeInTheDocument();
  });
});
