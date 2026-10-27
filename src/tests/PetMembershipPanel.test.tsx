import { screen } from "@testing-library/react";

import { PetMembershipPanel } from "@/features/memberships";
import { membershipService } from "@/services/membership.service";

import { membershipCard } from "./helpers/membershipFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/membership.service");
jest.mock("@/services/pet.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const mocked = membershipService as jest.Mocked<typeof membershipService>;

/**
 * The pet profile's Membership tab. What it protects: the live card leads with
 * its jatah and the Kelola shortcuts, the owner's customer-held card is shown
 * as "Juga berlaku dari pelanggan", and an animal without a card is pointed at
 * the till — manual issue only for whoever may create cards.
 */
describe("pet Membership tab", () => {
  beforeEach(() => jest.clearAllMocks());

  it("leads with the live card, its jatah and the Kelola shortcuts, plus the owner's card", async () => {
    mocked.listForPet.mockResolvedValue({
      petId: "pet-1",
      items: [
        membershipCard(),
        membershipCard({ id: "old", number: "MBR-2025-0001", status: "expired", renewalDue: true }),
      ],
      customerCards: [
        membershipCard({
          id: "cust",
          number: "MBR-2026-0050",
          attachTo: "customer",
          petId: null,
          petName: null,
          plan: { ...membershipCard().plan, name: "Family" },
        }),
      ],
    });

    renderWithAuth(<PetMembershipPanel petId="pet-1" petName="Mochi" customerId="cus-1" />);

    expect(await screen.findByText("Membership · Explorer")).toBeVisible();
    expect(screen.getAllByText("2 tersisa").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Riwayat pemakaian" })).toHaveAttribute(
      "href",
      "/dashboard/promotion/membership/member/card-1",
    );
    expect(screen.getByRole("button", { name: "Ubah masa berlaku" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Koreksi jatah" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Tunda" })).toBeVisible();

    expect(screen.getByText("Juga berlaku dari pelanggan")).toBeVisible();
    expect(screen.getByText(/Mochi ikut memakai kuota yang sama/)).toBeVisible();

    expect(screen.getByText("Membership lain")).toBeVisible();
    expect(screen.getByText(/MBR-2025-0001/)).toBeVisible();
  });

  it("points an animal without a card to the till, and offers manual issue only with the grant", async () => {
    mocked.listForPet.mockResolvedValue({ petId: "pet-1", items: [], customerCards: [] });

    const { unmount } = renderWithAuth(<PetMembershipPanel petId="pet-1" petName="Mochi" />);

    expect(await screen.findByText(/Mochi belum punya membership/)).toBeVisible();
    expect(screen.getByRole("link", { name: /Jual paket di kasir/ })).toHaveAttribute(
      "href",
      "/dashboard/pos",
    );
    expect(screen.getByRole("button", { name: "Terbitkan manual" })).toBeVisible();
    unmount();

    renderWithAuth(<PetMembershipPanel petId="pet-1" petName="Mochi" />, {
      isSuperAdmin: false,
      permissions: [{ feature: "petMemberships", actions: ["read"] }],
    });
    expect(await screen.findByText(/Mochi belum punya membership/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Terbitkan manual" })).not.toBeInTheDocument();
  });

  it("hides the Kelola shortcuts from a reader without the manage grant", async () => {
    mocked.listForPet.mockResolvedValue({ petId: "pet-1", items: [membershipCard()], customerCards: [] });

    renderWithAuth(<PetMembershipPanel petId="pet-1" petName="Mochi" />, {
      isSuperAdmin: false,
      permissions: [{ feature: "petMemberships", actions: ["read"] }],
    });

    expect(await screen.findByText("Membership · Explorer")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Tunda" })).not.toBeInTheDocument();
  });
});
