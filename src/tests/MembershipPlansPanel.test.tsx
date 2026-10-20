import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MembershipPlansPanel } from "@/features/memberships";
import { membershipService } from "@/services/membership.service";
import type { MembershipBenefit, MembershipPlan } from "@/types/membership";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/membership.service");

const mocked = membershipService as jest.Mocked<typeof membershipService>;

const benefit = (label: string, perPeriod: number | null): MembershipBenefit => ({
  id: `ben-${label}`,
  label,
  kind: "free_item",
  scope: { target: "service", serviceIds: [], productIds: [], categoryIds: [], serviceKinds: ["grooming"] },
  value: null,
  quota: { perPeriod, period: perPeriod ? "month" : null, total: null },
  options: [],
  summary: "Gratis",
});

function plan(over: Partial<MembershipPlan> = {}): MembershipPlan {
  return {
    id: "p1",
    code: "MSP-0001",
    name: "Explorer – New Member",
    description: null,
    serviceKinds: [],
    price: "450000.0000",
    durationDays: 183,
    durationMonths: 6,
    attachTo: "pet",
    petSpecies: [],
    priceMode: "fixed",
    variantPrices: [],
    eligibility: "new_customer",
    branchIds: [],
    publicDisplay: { visible: false, featured: false, order: 0, badge: null },
    renewalOfferDays: 30,
    isActive: true,
    benefits: [],
    createdAt: null,
    updatedAt: null,
    deletedAt: null,
    ...over,
  };
}

function respond(items: MembershipPlan[]) {
  mocked.listPlans.mockResolvedValue({
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  });
}

describe("MembershipPlansPanel", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists a plan with the V1 columns and short benefit chips", async () => {
    respond([
      plan({
        benefits: [benefit("Grooming", 1), benefit("Mandi", 2), benefit("Add-on", null)],
        publicDisplay: { visible: true, featured: false, order: 1, badge: null },
        activeMembers: 17,
      }),
      plan({
        id: "p2",
        code: "MSP-0002",
        name: "VIP Home",
        attachTo: "customer",
        eligibility: "renewal",
        priceMode: "variant",
        price: "450000.0000",
        variantPrices: [
          { variantKey: "a||", price: "750000.0000" },
          { variantKey: "b||", price: "450000.0000" },
        ],
        isActive: false,
      }),
    ]);

    renderWithAuth(<MembershipPlansPanel />);

    const row = (await screen.findByText("Explorer – New Member")).closest("tr")!;
    for (const header of ["Kode", "Paket", "Melekat ke", "Syarat pembeli", "Durasi", "Harga", "Anggota aktif", "Status"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }

    const cells = within(row);
    expect(cells.getByText("MSP-0001")).toBeInTheDocument();
    expect(cells.getByText("Hewan")).toBeInTheDocument();
    expect(cells.getByText("Pelanggan baru")).toBeInTheDocument();
    expect(cells.getByText("6 bulan")).toBeInTheDocument();
    expect(cells.getByText("Rp 450.000")).toBeInTheDocument();
    expect(cells.getByText("17")).toBeInTheDocument();
    // Two chips, then a count — never the whole list.
    expect(cells.getByText("Grooming 1×")).toBeInTheDocument();
    expect(cells.getByText("Mandi 2×")).toBeInTheDocument();
    expect(cells.getByText("+1")).toBeInTheDocument();
    expect(cells.queryByText("Add-on ∞")).not.toBeInTheDocument();
    expect(cells.getByText("Aktif")).toBeInTheDocument();
    expect(cells.getByText("Website")).toBeInTheDocument();

    const vip = within(screen.getByText("VIP Home").closest("tr")!);
    expect(vip.getByText("Pelanggan")).toBeInTheDocument();
    expect(vip.getByText("Perpanjangan")).toBeInTheDocument();
    expect(vip.getByText("Rp 450.000–750.000")).toBeInTheDocument();
    expect(vip.getByText("Nonaktif")).toBeInTheDocument();
    // A list read without the aggregate says nothing rather than "0".
    expect(vip.getByText("—")).toBeInTheDocument();
    expect(vip.queryByText("Website")).not.toBeInTheDocument();
  });

  it("filters by Melekat ke and Syarat pembeli on the server", async () => {
    respond([plan()]);
    const user = userEvent.setup();
    renderWithAuth(<MembershipPlansPanel />);
    await screen.findByText("Explorer – New Member");

    // Both live in the Filter panel and apply together on Terapkan.
    await user.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("button", { name: "Filter melekat ke" }));
    await user.click(await screen.findByRole("option", { name: "Pelanggan" }));
    await user.click(within(panel).getByRole("button", { name: "Filter syarat pembeli" }));
    await user.click(await screen.findByRole("option", { name: "Lewat referral" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(mocked.listPlans).toHaveBeenLastCalledWith(
        expect.objectContaining({ attachTo: "customer", eligibility: "referral", page: 1 }),
      ),
    );
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent("Filter (2)");
  });

  it("searches by code or name", async () => {
    respond([]);
    renderWithAuth(<MembershipPlansPanel />);
    expect(await screen.findByPlaceholderText("Cari kode atau nama paket")).toBeInTheDocument();
    expect(await screen.findByText(/Belum ada paket membership/)).toBeInTheDocument();
  });
});
