import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CommissionRecapScreen } from "@/features/reports";
import { branchService } from "@/services/branch.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import { reportService } from "@/services/report.service";
import type { CommissionRecap } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/report.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/paymentChannel.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const reports = reportService as jest.Mocked<typeof reportService>;
const branches = branchService as jest.Mocked<typeof branchService>;
const channels = paymentChannelService as jest.Mocked<typeof paymentChannelService>;

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
  reports.outstandingCommissions.mockResolvedValue({
    groomerUserId: "user-1",
    branchId: BRANCH_ID,
    periods: ["2026-09"],
    amount: "300000.0000",
    recordCount: 12,
  });
  reports.payCommissions.mockResolvedValue({
    paymentId: "cp-1",
    journalEntryId: "je-2",
    entryNumber: "JE-261005-002",
    groomerUserId: "user-1",
    groomerName: "Sinta",
    periods: ["2026-09"],
    amount: "300000.0000",
    recordCount: 12,
  });
  channels.list.mockResolvedValue({
    items: [{ _id: "ch-1", name: "Kas Laci" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
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

/**
 * BAYAR KOMISI — the half that makes the accrual honest.
 *
 * Without it, 2102 Utang Komisi only ever grows: a liability the shop appears to
 * owe forever, overstated by every rupiah it has ever actually paid its staff.
 */
describe("CommissionRecapScreen — paying a groomer", () => {
  const LEDGER = [
    { feature: "users", actions: ["read"] },
    { feature: "journalEntries", actions: ["create"] },
  ];

  const open = async () => {
    renderWithAuth(<CommissionRecapScreen />, {
      isSuperAdmin: false,
      permissions: LEDGER as never,
    });
    await screen.findByText("Sinta");
    await userEvent.click(screen.getByRole("button", { name: /^bayar$/i }));
  };

  it("shows what is owed, asked of the server rather than read off the recap", async () => {
    /*
      THE RECAP IS ONE MONTH'S EARNINGS; what is owed is everything closed and
      unpaid, which may span several. Subtracting one from the other on screen
      would be a second way of computing a number the ledger already has.
    */
    await open();

    expect(await screen.findByText(/12 layanan/)).toBeInTheDocument();
    expect(reports.outstandingCommissions).toHaveBeenCalledWith({
      groomerUserId: "user-1",
      branchId: BRANCH_ID,
    });
  });

  it("pays without sending an amount", async () => {
    /*
      THE SERVER PAYS WHAT ITS OWN BOOKS SAY. A figure somebody typed would let a
      mis-key leave a liability matching nothing — and 2102 is what the balance
      sheet reports. There is no amount field at all, and this pins that the
      request carries none.
    */
    await open();
    await screen.findByText(/12 layanan/);

    /* The dialog's confirm: the row buttons behind it are aria-hidden while it
       is open, so this name resolves to one element. */
    await userEvent.click(screen.getByRole("button", { name: /^bayar$/i }));

    await waitFor(() => expect(reports.payCommissions).toHaveBeenCalled());
    expect(reports.payCommissions).toHaveBeenCalledWith({
      groomerUserId: "user-1",
      branchId: BRANCH_ID,
      paymentChannelId: "ch-1",
    });
    expect(await screen.findByText(/JE-261005-002/)).toBeInTheDocument();
  });

  it("says to close the month first when nothing is payable", async () => {
    /*
      THE COMMONEST REASON, SAID PLAINLY. Commission must be taken to the ledger
      by a close before it can be settled against 2102 — paying what was never
      accrued would debit a liability that does not exist and drive the balance
      negative, which reads as the staff owing the shop.
    */
    reports.outstandingCommissions.mockResolvedValue({
      groomerUserId: "user-1",
      branchId: BRANCH_ID,
      periods: [],
      amount: "0.0000",
      recordCount: 0,
    });

    await open();

    expect(
      await screen.findByText(/tutup bulannya dulu/i),
    ).toBeInTheDocument();
  });

  it("offers only channels money may go out of", async () => {
    // The server refuses the wrong one anyway; offering it would be a choice
    // that always fails.
    await open();
    await screen.findByText(/12 layanan/);

    expect(channels.list).toHaveBeenCalledWith(
      expect.objectContaining({ usableFor: "out" }),
    );
  });

  it("offers no Bayar button to somebody who may only read the payroll", async () => {
    renderWithAuth(<CommissionRecapScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "users", actions: ["read"] }] as never,
    });

    await screen.findByText("Sinta");

    expect(
      screen.queryByRole("button", { name: /^bayar$/i }),
    ).not.toBeInTheDocument();
  });
});
