import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CommissionDetailScreen } from "@/features/commissions";
import { reportService } from "@/services/report.service";
import type { CommissionDetail } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/report.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const reports = reportService as jest.Mocked<typeof reportService>;

const MANAGER = [
  { feature: "users", actions: ["read"] },
  { feature: "journalEntries", actions: ["read", "create"] },
] as never;

const detail = (overrides: Partial<CommissionDetail> = {}): CommissionDetail => ({
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
  basisAmount: "120000.0000",
  amount: "57600.0000",
  computedAmount: "57600.0000",
  overridden: false,
  status: "pending",
  pool: {
    serviceName: "Basic Grooming",
    rateType: "percentage",
    rateValue: 20,
    service: "24000.0000",
    addon: "2000.0000",
    addons: [
      {
        name: "Extra Handling",
        price: "20000.0000",
        rateType: "percentage",
        rateValue: 10,
        commission: "2000.0000",
      },
    ],
    total: "26000.0000",
  },
  stages: [
    {
      recordId: "cr-1",
      sessionName: "Mandi",
      sharePercent: 40,
      crewSize: 1,
      crewSharePercent: 100,
      stagePool: "18200.0000",
      rateType: "percentage",
      rateValue: 15,
      amount: "19200.0000",
      status: "pending",
    },
    {
      recordId: "cr-2",
      sessionName: "Potong & Styling",
      sharePercent: 60,
      crewSize: 1,
      crewSharePercent: 100,
      stagePool: "7800.0000",
      rateType: "percentage",
      rateValue: 20,
      amount: "38400.0000",
      status: "pending",
    },
  ],
  override: null,
  approvedAt: null,
  reversal: null,
  payment: null,
  ...overrides,
});

const open = (permissions = MANAGER) =>
  renderWithAuth(<CommissionDetailScreen bookingId="bk-1" groomerUserId="sari" />, {
    permissions,
    isSuperAdmin: false,
  });

beforeEach(() => {
  jest.clearAllMocks();
  reports.commissionDetail.mockResolvedValue(detail());
});

describe("CommissionDetailScreen", () => {
  /*
    THE TABLE IS THE ARITHMETIC (21 September 2026): pool stated first, then
    each tahapan's part of it and this groomer's share of that part.
  */
  it("shows the pool, each tahapan's part of it, and this groomer's share", async () => {
    open();

    expect(await screen.findByText("Potong & Styling")).toBeInTheDocument();
    // The service first, then its add-on, then the total the tahapan share.
    expect(screen.getByText("Basic Grooming")).toBeInTheDocument();
    expect(screen.getByText("Rp 120.000 × 20%")).toBeInTheDocument();
    expect(screen.getByText("Rp 24.000")).toBeInTheDocument();
    expect(screen.getByText("Extra Handling")).toBeInTheDocument();
    expect(screen.getByText("Rp 20.000 × 10%")).toBeInTheDocument();
    expect(screen.getAllByText("Rp 26.000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rp 7.800").length).toBeGreaterThan(0);
    // Each figure carries its formula: pool × bobot, then × bagian.
    expect(screen.getByText("Rp 26.000 × 60%")).toBeInTheDocument();
    expect(screen.getByText("Rp 7.800 × 100%")).toBeInTheDocument();
    expect(screen.getByText("Rp 38.400")).toBeInTheDocument();
    expect(screen.getByText("Total terhitung")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "INV/BRT/2609/0001" })).toHaveAttribute(
      "href",
      "/dashboard/sales/inv-1",
    );
  });

  it("wants a reason before saving a figure that differs from the computed one", async () => {
    open();
    await screen.findByText("Potong & Styling");

    await userEvent.type(screen.getByLabelText("Nilai komisi"), "50000");
    await userEvent.click(screen.getByRole("button", { name: "Simpan nilai komisi" }));

    expect(await screen.findByText("Tulis alasan penyesuaiannya dulu.")).toBeInTheDocument();
    expect(reports.overrideCommission).not.toHaveBeenCalled();

    reports.overrideCommission.mockResolvedValue(
      detail({ amount: "50000.0000", overridden: true, override: { reason: "Komplain", at: null } }),
    );
    await userEvent.type(screen.getByLabelText(/Alasan penyesuaian/), "Komplain");
    await userEvent.click(screen.getByRole("button", { name: "Simpan nilai komisi" }));

    await waitFor(() =>
      expect(reports.overrideCommission).toHaveBeenCalledWith({
        bookingId: "bk-1",
        groomerUserId: "sari",
        amount: "50000",
        reason: "Komplain",
      }),
    );
  });

  it("shows the payment, with its transaction and journal entry, once paid", async () => {
    reports.commissionDetail.mockResolvedValue(
      detail({
        status: "paid",
        payment: {
          id: "pay-1",
          number: "BKK/BRT/2609/0001",
          at: "2026-09-12T03:00:00.000Z",
          cashAccountName: "Bank BCA",
          journalEntryId: "je-1",
          entryNumber: "JE-260912-001",
        },
      }),
    );

    open();

    expect(await screen.findByRole("link", { name: "BKK/BRT/2609/0001" })).toHaveAttribute(
      "href",
      "/dashboard/keuangan/kas-bank/transaksi/pay-1",
    );
    expect(screen.getByRole("link", { name: "JE-260912-001" })).toBeInTheDocument();
    // Paid: the figure can no longer be changed.
    expect(screen.queryByRole("button", { name: "Simpan nilai komisi" })).not.toBeInTheDocument();
  });

  it("offers nothing to change to somebody who may only read the payroll", async () => {
    open([{ feature: "users", actions: ["read"] }] as never);

    await screen.findByText("Potong & Styling");

    expect(screen.queryByRole("button", { name: "Simpan nilai komisi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Terapkan" })).not.toBeInTheDocument();
  });
});
