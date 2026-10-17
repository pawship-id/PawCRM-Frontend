import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MembershipCardsPanel } from "@/features/memberships";
import { membershipService } from "@/services/membership.service";
import type { PetMembershipListQuery } from "@/types/membership";

import {
  benefitAvailability,
  listPage,
  membershipCard,
} from "./helpers/membershipFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/membership.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/dashboard/promosi/membership/anggota",
}));

const mocked = membershipService as jest.Mocked<typeof membershipService>;

/** Totals per lens, answered to the `limit=1` count requests. */
const COUNTS: Record<string, number> = {
  /* "Aktif" counts active cards NOT ending soon, so none sits under two pills. */
  activeNotExpiring: 12,
  expiringSoon: 3,
  unused: 5,
  expired: 40,
  paused: 0,
  awaiting_payment: 2,
};

function lensOf(query: PetMembershipListQuery): string | null {
  if (query.hasUnusedQuota) return "unused";
  return query.status?.[0] ?? null;
}

const rows = [
  membershipCard({
    benefits: [
      benefitAvailability(),
      benefitAvailability({ id: "b2", label: "Mandi", cap: 2, used: 2, remaining: 0 }),
      benefitAvailability({ id: "b3", label: "Add-on", unlimited: true, cap: null, used: null, remaining: null }),
    ],
  }),
  membershipCard({
    id: "card-2",
    number: "MBR-2026-0050",
    attachTo: "customer",
    petId: null,
    petName: null,
    customerName: "Budi Santoso",
    expiringSoon: true,
    daysLeft: 9,
  }),
];

beforeEach(() => {
  jest.clearAllMocks();
  mocked.listPlans.mockResolvedValue(listPage([]));
  mocked.listMemberships.mockImplementation(async (query = {}) => {
    if (query.limit === 1) return listPage([], COUNTS[lensOf(query) ?? ""] ?? 0);
    return listPage(rows);
  });
});

/**
 * Anggota — every card in the shop. What this suite protects: the pill row is
 * the screen's lens (counts, click to filter, click again to let go), the
 * holder cell says WHO holds the allowance (an animal, or a customer for all
 * their animals), and the jatah chips stay short — two, then "+n".
 */
describe("Anggota list", () => {
  it("draws the lens pills with their counts, adding Belum lunas only because it has cards", async () => {
    renderWithAuth(<MembershipCardsPanel />);

    const pills = screen.getByRole("group", { name: "Status anggota" });
    await waitFor(() => expect(within(pills).getByRole("button", { name: /Aktif\s*12/ })).toBeVisible());
    expect(within(pills).getByRole("button", { name: /Segera berakhir\s*3/ })).toBeVisible();
    expect(within(pills).getByRole("button", { name: /Jatah belum terpakai\s*5/ })).toBeVisible();
    expect(within(pills).getByRole("button", { name: /Berakhir\s*40/ })).toBeVisible();
    expect(within(pills).getByRole("button", { name: /Belum lunas\s*2/ })).toBeVisible();
    expect(within(pills).queryByRole("button", { name: /Ditunda/ })).not.toBeInTheDocument();
  });

  it("asks for activeNotExpiring behind the Aktif pill and searches customers and pets", async () => {
    const user = userEvent.setup();
    renderWithAuth(<MembershipCardsPanel />);
    await screen.findByText("MBR-2026-0042");

    expect(screen.getByPlaceholderText("Cari pelanggan, hewan, atau nomor")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Aktif\s*12/ }));
    await waitFor(() =>
      expect(mocked.listMemberships).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: ["activeNotExpiring"], page: 1 }),
      ),
    );
  });

  it("shows holder, plan, term, short jatah chips and status per row", async () => {
    renderWithAuth(<MembershipCardsPanel />);

    expect(await screen.findByText("MBR-2026-0042")).toBeVisible();
    expect(screen.getByText("Mochi")).toBeVisible();
    expect(screen.getByText("Rina Wijaya · hewan")).toBeVisible();
    expect(screen.getByText("Budi Santoso")).toBeVisible();
    expect(screen.getByText("pelanggan · semua hewan")).toBeVisible();
    expect(screen.getAllByText("bulan ke-1 dari 6").length).toBe(2);
    const first = screen.getByText("MBR-2026-0042").closest("tr") as HTMLElement;
    expect(within(first).getByText("Grooming 1/3")).toBeVisible();
    expect(within(first).getByText("Mandi 2/2")).toBeVisible();
    expect(within(first).getByText("+1")).toBeVisible();
    expect(screen.getByText("Segera berakhir", { selector: "span" })).toBeVisible();
    expect(screen.getByText("9 hari lagi")).toBeVisible();
  });

  it("filters by a pill and lets go when the lit pill is pressed again", async () => {
    const user = userEvent.setup();
    renderWithAuth(<MembershipCardsPanel />);
    await screen.findByText("MBR-2026-0042");

    const pill = screen.getByRole("button", { name: /Jatah belum terpakai/ });
    await user.click(pill);
    await waitFor(() =>
      expect(mocked.listMemberships).toHaveBeenLastCalledWith(
        expect.objectContaining({ hasUnusedQuota: true, status: undefined, page: 1 }),
      ),
    );
    expect(pill).toHaveAttribute("aria-pressed", "true");

    await user.click(pill);
    await waitFor(() =>
      expect(mocked.listMemberships).toHaveBeenLastCalledWith(
        expect.objectContaining({ hasUnusedQuota: undefined, status: undefined }),
      ),
    );
    expect(pill).toHaveAttribute("aria-pressed", "false");
  });

  it("opens the member's detail on a row click", async () => {
    const user = userEvent.setup();
    renderWithAuth(<MembershipCardsPanel />);

    await user.click(await screen.findByText("Rina Wijaya · hewan"));
    expect(push).toHaveBeenCalledWith("/dashboard/promosi/membership/anggota/card-1");
  });
});
