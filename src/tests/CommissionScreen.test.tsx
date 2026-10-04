import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CommissionScreen } from "@/features/commissions";
import { nextStatuses } from "@/features/commissions/labels";
import { swalToast } from "@/lib/swal";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { reportService } from "@/services/report.service";
import type { CommissionRow, CommissionRowsResult } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/report.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => mockPush(href) }),
  usePathname: () => "/dashboard/keuangan/komisi",
}));

const reports = reportService as jest.Mocked<typeof reportService>;
const branches = branchService as jest.Mocked<typeof branchService>;
const lines = businessLineService as jest.Mocked<typeof businessLineService>;
const accounts = chartOfAccountsService as jest.Mocked<typeof chartOfAccountsService>;

const NOW = "2026-09-14T03:00:00.000Z";

const row = (overrides: Partial<CommissionRow> = {}): CommissionRow => ({
  key: "bk-1:sari",
  bookingId: "bk-1",
  groomerUserId: "sari",
  groomerName: "Sari",
  branchId: "branch-1",
  branchName: "Pawship Barat",
  bookingNumber: "BK-0910-014",
  bookingDate: "2026-09-10T03:00:00.000Z",
  petName: "Bruno",
  serviceName: "Full Grooming",
  invoiceId: "inv-1",
  invoiceNumber: "INV/BRT/2609/0001",
  basisAmount: "320000.0000",
  amount: "57600.0000",
  computedAmount: "57600.0000",
  overridden: false,
  status: "pending",
  ...overrides,
});

const PENDING = row();
const APPROVED = row({
  key: "bk-2:dedi",
  bookingId: "bk-2",
  groomerUserId: "dedi",
  groomerName: "Dedi",
  bookingNumber: "BK-0911-009",
  amount: "46800.0000",
  status: "approved",
});
const PAID = row({
  key: "bk-3:rina",
  bookingId: "bk-3",
  groomerUserId: "rina",
  groomerName: "Rina",
  bookingNumber: "BK-0909-003",
  amount: "70000.0000",
  computedAmount: "74000.0000",
  overridden: true,
  status: "paid",
});

const page = (rows: CommissionRow[]): CommissionRowsResult => ({
  rows,
  page: 1,
  limit: 10,
  total: rows.length,
  cards: { total: "331800.0000", paid: "131600.0000", pending: "200200.0000" },
});

const MANAGER = [
  { feature: "users", actions: ["read"] },
  { feature: "journalEntries", actions: ["read", "create"] },
] as never;

beforeEach(() => {
  jest.clearAllMocks();
  reports.commissionRecords.mockResolvedValue(page([PENDING, APPROVED, PAID]));
  reports.approveCommissions.mockResolvedValue({ approved: 1, skipped: 0 });
  reports.payCommissions.mockResolvedValue({
    payments: [
      {
        bookingId: "bk-2",
        groomerUserId: "dedi",
        groomerName: "Dedi",
        bookingNumber: "BK-0911-009",
        branchId: "branch-1",
        paymentId: "pay-1",
        number: "BKK/BRT/2609/0001",
        journalEntryId: "je-1",
        entryNumber: "JE-260914-001",
        amount: "46800.0000",
      },
    ],
  });
  branches.list.mockResolvedValue({
    items: [{ _id: "branch-1", name: "Pawship Barat" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
  lines.list.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  } as never);
  accounts.list.mockResolvedValue({
    items: [
      {
        _id: "acc-1",
        code: "1101",
        name: "Kas Pusat",
        isActive: true,
        accountCategory: "cash_bank",
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
});

const rowOf = (text: string) => screen.getByText(text).closest("tr") as HTMLElement;

describe("CommissionScreen — the mockup's list", () => {
  it("shows the three cards and one row per booking × groomer", async () => {
    renderWithAuth(<CommissionScreen now={NOW} />, { permissions: MANAGER, isSuperAdmin: false });

    expect(await screen.findByText("BK-0910-014")).toBeInTheDocument();
    expect(screen.getByText("Rp 331.800")).toBeInTheDocument();
    expect(screen.getByText("Rp 131.600")).toBeInTheDocument();
    expect(screen.getByText("Rp 200.200")).toBeInTheDocument();

    // A hand-set figure is marked, as in the mockup.
    expect(within(rowOf("Rina")).getByText("disesuaikan")).toBeInTheDocument();
  });

  it("asks the server with the context bar's scope, newest booking first", async () => {
    renderWithAuth(<CommissionScreen now={NOW} />, { permissions: MANAGER, isSuperAdmin: false });

    await screen.findByText("BK-0910-014");

    expect(reports.commissionRecords).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "bookingDate", dir: "desc", page: 1 }),
    );
  });

  it("will not let a paid row be ticked", async () => {
    renderWithAuth(<CommissionScreen now={NOW} />, { permissions: MANAGER, isSuperAdmin: false });

    await screen.findByText("BK-0910-014");

    expect(within(rowOf("Rina")).getByRole("checkbox")).toBeDisabled();
    expect(within(rowOf("Sari")).getByRole("checkbox")).toBeEnabled();
  });

  it("opens a row's own page when it is clicked", async () => {
    renderWithAuth(<CommissionScreen now={NOW} />, { permissions: MANAGER, isSuperAdmin: false });

    await screen.findByText("BK-0910-014");
    await userEvent.click(within(rowOf("Sari")).getByText("Rp 320.000"));

    expect(mockPush).toHaveBeenCalledWith("/dashboard/keuangan/komisi/bk-1/sari");
  });
});

describe("CommissionScreen — approving and paying", () => {
  it("approves the pending rows of the selection", async () => {
    renderWithAuth(<CommissionScreen now={NOW} />, { permissions: MANAGER, isSuperAdmin: false });
    await screen.findByText("BK-0910-014");

    await userEvent.click(within(rowOf("Sari")).getByRole("checkbox"));
    await userEvent.click(within(rowOf("Dedi")).getByRole("checkbox"));
    expect(screen.getByText(/2 dipilih · Total Rp 104\.400/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Setujui terpilih" }));

    await waitFor(() =>
      expect(reports.approveCommissions).toHaveBeenCalledWith([
        { bookingId: "bk-1", groomerUserId: "sari" },
      ]),
    );
    expect(swalToast).toHaveBeenCalledWith("1 komisi disetujui.", "success");
  });

  /* The Owner's rule, 21 September 2026: approval first, then payment. */
  it("refuses to pay a selection with nothing approved in it", async () => {
    renderWithAuth(<CommissionScreen now={NOW} />, { permissions: MANAGER, isSuperAdmin: false });
    await screen.findByText("BK-0910-014");

    await userEvent.click(within(rowOf("Sari")).getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Bayar terpilih" }));

    expect(swalToast).toHaveBeenCalledWith("Setujui dulu komisinya sebelum dibayar.", "error");
    expect(screen.queryByText("Konfirmasi bayar")).not.toBeInTheDocument();
  });

  it("pays the approved rows from one account, and says the pending one was left out", async () => {
    renderWithAuth(<CommissionScreen now={NOW} />, { permissions: MANAGER, isSuperAdmin: false });
    await screen.findByText("BK-0910-014");

    await userEvent.click(within(rowOf("Sari")).getByRole("checkbox"));
    await userEvent.click(within(rowOf("Dedi")).getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Bayar terpilih" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/1 komisi yang belum disetujui tidak ikut dibayar/)).toBeInTheDocument();
    // The only account is picked for you.
    await within(dialog).findByText("1101 · Kas Pusat");

    await userEvent.click(within(dialog).getByRole("button", { name: "Konfirmasi bayar" }));

    await waitFor(() =>
      expect(reports.payCommissions).toHaveBeenCalledWith({
        rows: [{ bookingId: "bk-2", groomerUserId: "dedi" }],
        accountId: "acc-1",
      }),
    );
    expect(swalToast).toHaveBeenCalledWith(
      "Komisi dibayar — BKK/BRT/2609/0001, jurnal JE-260914-001.",
      "success",
    );
  });

  it("offers no approving or paying to somebody who may only read the payroll", async () => {
    renderWithAuth(<CommissionScreen now={NOW} />, {
      permissions: [{ feature: "users", actions: ["read"] }] as never,
      isSuperAdmin: false,
    });
    await screen.findByText("BK-0910-014");

    await userEvent.click(within(rowOf("Sari")).getByRole("checkbox"));

    expect(screen.getByRole("button", { name: "Batalkan pilihan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Setujui terpilih" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bayar terpilih" })).not.toBeInTheDocument();
    // A badge, not a control.
    expect(within(rowOf("Sari")).getByText("Menunggu Persetujuan")).toBeInTheDocument();
  });
});

describe("the status control's moves", () => {
  it("offers Dibayar only on an approved row", () => {
    expect(nextStatuses("pending")).toEqual(["pending", "approved"]);
    expect(nextStatuses("approved")).toEqual(["pending", "approved", "paid"]);
    expect(nextStatuses("paid")).toEqual(["paid"]);
    expect(nextStatuses("reversed")).toEqual(["reversed"]);
  });
});
