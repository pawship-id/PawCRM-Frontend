import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CommissionRecapScreen } from "@/features/reports";
import { branchService } from "@/services/branch.service";
import { reportService } from "@/services/report.service";
import type { CommissionRecap } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/report.service");
jest.mock("@/services/branch.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const reports = reportService as jest.Mocked<typeof reportService>;
const branches = branchService as jest.Mocked<typeof branchService>;

const BRANCH_ID = "branch-1";

const recap: CommissionRecap = {
  period: "2026-09",
  rows: [
    {
      groomerUserId: "user-1",
      groomerName: "Sinta",
      rows: 4,
      reversedRows: 0,
      amount: "300000.0000",
    },
  ],
  total: "300000.0000",
} as CommissionRecap;

beforeEach(() => {
  jest.clearAllMocks();
  reports.commissions.mockResolvedValue(recap);
  reports.closeCommissions.mockResolvedValue({
    posted: true,
    period: "2026-09",
    entryNumber: "JE-260930-001",
    amount: "300000.0000",
    groomerCount: 1,
    recordCount: 4,
  });
  branches.list.mockResolvedValue({
    items: [{ _id: BRANCH_ID, name: "Cibubur" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
});

/**
 * TUTUP BULAN KOMISI, from the screen — FR-6, the accrual decided 3 September
 * 2026.
 *
 * Reading this recap is a payroll question and rides on `users:read`. POSTING it
 * writes a journal entry that changes the month's reported profit and creates a
 * liability, so the button takes the grant a manual entry takes.
 */
describe("CommissionRecapScreen — closing a month", () => {
  const LEDGER = [{ feature: "journalEntries", actions: ["create"] }];

  it("posts the month after asking, and says what it wrote", async () => {
    renderWithAuth(<CommissionRecapScreen />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "users", actions: ["read"] },
        ...LEDGER,
      ] as never,
    });

    await screen.findByText("Sinta");

    await userEvent.click(screen.getByRole("button", { name: /tutup bulan/i }));

    /*
      ASKED FIRST. It writes to the ledger, which is not something a mis-click
      should do — and the dialog is where the shop-language explanation lives.
    */
    expect(
      await screen.findByText(/utang ke groomer/i),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^bukukan$/i }));

    await waitFor(() => expect(reports.closeCommissions).toHaveBeenCalled());
    expect(reports.closeCommissions).toHaveBeenCalledWith({
      period: expect.stringMatching(/^\d{4}-\d{2}$/),
      branchId: BRANCH_ID,
    });

    /*
      THE ENTRY NUMBER STAYS ON SCREEN, not only in a toast: somebody who posted
      a month's wages should be able to write it down without repeating the
      action to see it again.
    */
    expect(await screen.findByText(/JE-260930-001/)).toBeInTheDocument();
  });

  it("says plainly when there was nothing to close", async () => {
    /*
      NOT AN ERROR. "Nothing to post" is a true answer to "close September" — a
      failure message would send somebody looking for a problem that is not
      there.
    */
    reports.closeCommissions.mockResolvedValue({
      posted: false,
      period: "2026-09",
      reason: "nothing to close",
    });

    renderWithAuth(<CommissionRecapScreen />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "users", actions: ["read"] },
        ...LEDGER,
      ] as never,
    });

    await screen.findByText("Sinta");
    await userEvent.click(screen.getByRole("button", { name: /tutup bulan/i }));
    await userEvent.click(screen.getByRole("button", { name: /^bukukan$/i }));

    expect(
      await screen.findByText(/tidak ada komisi baru/i),
    ).toBeInTheDocument();
  });

  it("offers no button at all to somebody who may only read the payroll", async () => {
    renderWithAuth(<CommissionRecapScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "users", actions: ["read"] }] as never,
    });

    await screen.findByText("Sinta");

    expect(
      screen.queryByRole("button", { name: /tutup bulan/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the button live after a close, because a straggler can still arrive", async () => {
    /*
      NOT DISABLED ONCE CLOSED. A booking completed late writes an `accrued` row
      into a month already closed; the server claims only unclaimed rows, so
      running it again picks up exactly those and nothing twice. A button that
      greyed itself out would hide the only way to collect them.
    */
    renderWithAuth(<CommissionRecapScreen />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "users", actions: ["read"] },
        ...LEDGER,
      ] as never,
    });

    await screen.findByText("Sinta");
    await userEvent.click(screen.getByRole("button", { name: /tutup bulan/i }));
    await userEvent.click(screen.getByRole("button", { name: /^bukukan$/i }));

    await screen.findByText(/JE-260930-001/);
    expect(screen.getByRole("button", { name: /tutup bulan/i })).toBeEnabled();
  });
});
