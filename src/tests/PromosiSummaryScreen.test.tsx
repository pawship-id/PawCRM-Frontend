import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PromosiSummaryScreen } from "@/features/promosi";
import { periodRange } from "@/features/promosi/hooks/usePromosiSummary";
import { branchService } from "@/services/branch.service";
import { membershipService } from "@/services/membership.service";
import type { AttentionCard, MembershipAttention } from "@/types/membership";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/membership.service");
jest.mock("@/services/branch.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/promotion/summary",
}));

const mocked = membershipService as jest.Mocked<typeof membershipService>;

const card = (over: Partial<AttentionCard> = {}): AttentionCard => ({
  id: "card-1",
  number: "MBR-2026-0042",
  attachTo: "pet",
  petId: "pet-1",
  petName: "Mochi",
  customerId: "cus-1",
  customerName: "Rina Wijaya",
  customerPhone: "0812-1111-2222",
  planId: "p1",
  planName: "Explorer",
  startDate: "2026-04-16T03:00:00.000Z",
  endDate: "2026-10-25T03:00:00.000Z",
  daysLeft: 9,
  status: "active",
  ...over,
});

function primeAll(attention: MembershipAttention) {
  (branchService.list as jest.Mock).mockResolvedValue({
    items: [{ _id: "b1", name: "Pusat" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });
  mocked.summary.mockResolvedValue({
    range: { dateFrom: null, dateTo: null },
    branchId: null,
    packagesSold: { count: 12, revenue: "5400000.0000", renewals: 3 },
    benefitValue: { amount: "1830000.0000", uses: 41, customers: 18, pets: 22 },
    activeMembers: { count: 64, customers: 51, pets: 58 },
  });
  mocked.attention.mockResolvedValue(attention);
  mocked.recognitionSummary.mockResolvedValue({
    recognition: "immediate",
    unrecognized: "0",
    cards: 0,
  });
  mocked.report.mockResolvedValue({
    summary: { cards: 12, revenue: "5400000.0000", benefitValue: "1830000.0000", margin: "0" },
    plans: [
      {
        planId: "p1",
        name: "Explorer – New Member",
        cards: 9,
        revenue: "4050000.0000",
        benefitsUsed: 30,
        benefitValue: "1200000.0000",
      },
    ],
    benefits: [],
  });
}

describe("PromosiSummaryScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the four tiles, the attention lists and per-plan performance", async () => {
    primeAll({
      withinDays: 14,
      expiring: [card()],
      unusedQuota: [
        {
          card: card({ id: "card-2", petName: null, attachTo: "customer", customerName: "Budi", customerPhone: null }),
          benefit: { id: "ben-1", label: "Grooming", period: "month" },
          used: 0,
          reserved: 1,
          cap: 2,
          remaining: 1,
          periodStart: "2026-09-26T03:00:00.000Z",
          periodEnd: "2026-10-21T03:00:00.000Z",
          daysLeft: 5,
        },
      ],
    });

    renderWithAuth(<PromosiSummaryScreen />);

    expect(await screen.findByText("Rp 5.400.000")).toBeInTheDocument();
    expect(screen.getByText("12 paket terjual")).toBeInTheDocument();
    expect(screen.getByText("Rp 1.830.000")).toBeInTheDocument();
    expect(screen.getByText("dari 18 pelanggan · 22 hewan")).toBeInTheDocument();
    expect(screen.getByText("64")).toBeInTheDocument();
    expect(screen.getByText("dari 51 pelanggan · 58 hewan")).toBeInTheDocument();
    expect(screen.getByText("Perpanjangan")).toBeInTheDocument();
    expect(screen.getByText("25% dari paket terjual")).toBeInTheDocument();

    const expiring = await screen.findByRole("region", { name: "Membership berakhir ≤14 hari" });
    expect(within(expiring).getByText("Mochi · Rina Wijaya")).toBeInTheDocument();
    const offer = within(expiring).getByRole("link", { name: "Tawarkan perpanjang" });
    expect(offer.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/6281211112222\?text=/);
    // One action per row, as in the prototype — the chat link, not a copy button beside it.
    expect(within(expiring).queryByRole("button", { name: "Salin nomor" })).not.toBeInTheDocument();

    const unused = screen.getByRole("region", { name: "Jatah belum terpakai, periode hampir habis" });
    expect(within(unused).getByText("Budi")).toBeInTheDocument();
    expect(within(unused).getByText(/Grooming sisa 1 dari 2 · 1 dipesan · hangus/)).toBeInTheDocument();
    // No phone, no chat to open — said, not a dead button.
    expect(within(unused).getByText("Nomor belum ada")).toBeInTheDocument();

    expect(await screen.findByText("Explorer – New Member")).toBeInTheDocument();
    expect(screen.getByText("Rp 4.050.000")).toBeInTheDocument();
  });

  it("says so when nothing needs doing", async () => {
    primeAll({ withinDays: 14, expiring: [], unusedQuota: [] });
    renderWithAuth(<PromosiSummaryScreen />);

    expect(await screen.findByText("Tidak ada membership yang segera berakhir.")).toBeInTheDocument();
    expect(screen.getByText("Tidak ada jatah yang hampir hangus.")).toBeInTheDocument();
  });

  it("draws the lists that arrive after V1 as Segera", async () => {
    primeAll({ withinDays: 14, expiring: [], unusedQuota: [] });
    renderWithAuth(<PromosiSummaryScreen />);

    for (const title of [
      "Kartu stempel kurang 1 lagi",
      "Reward stempel belum dipakai",
      "Promo berakhir ≤14 hari",
    ]) {
      const region = await screen.findByRole("region", { name: title });
      expect(within(region).getByText("Segera")).toBeInTheDocument();
    }
  });

  it("re-asks the summary for the chosen cabang and periode", async () => {
    primeAll({ withinDays: 14, expiring: [], unusedQuota: [] });
    const user = userEvent.setup();
    renderWithAuth(<PromosiSummaryScreen />);
    await screen.findByText("Rp 5.400.000");

    await user.click(screen.getByRole("button", { name: "Bulan lalu" }));
    await waitFor(() =>
      expect(mocked.summary).toHaveBeenLastCalledWith(expect.objectContaining(periodRange("lastMonth"))),
    );

    await user.click(screen.getByRole("button", { name: "Cabang" }));
    await user.click(await screen.findByRole("option", { name: "Pusat" }));
    await waitFor(() =>
      expect(mocked.summary).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: "b1" })),
    );
    expect(mocked.attention).toHaveBeenLastCalledWith({ branchId: "b1", withinDays: 14 });
  });

  it("shows the unrecognised membership balance once the tenant defers", async () => {
    primeAll({ withinDays: 14, expiring: [], unusedQuota: [] });
    mocked.recognitionSummary.mockResolvedValue({
      recognition: "deferred",
      unrecognized: "1072826.0000",
      cards: 3,
    });
    renderWithAuth(<PromosiSummaryScreen />);

    expect(await screen.findByText("Saldo membership belum diakui")).toBeInTheDocument();
    expect(screen.getByText("dari 3 kartu yang masih berjalan")).toBeInTheDocument();
  });

  it("computes the three windows by calendar day", () => {
    const now = new Date(2026, 9, 16);
    expect(periodRange("thisMonth", now)).toEqual({ dateFrom: "2026-10-01", dateTo: "2026-10-16" });
    expect(periodRange("lastMonth", now)).toEqual({ dateFrom: "2026-09-01", dateTo: "2026-09-30" });
    expect(periodRange("last30", now)).toEqual({ dateFrom: "2026-09-17", dateTo: "2026-10-16" });
  });
});
