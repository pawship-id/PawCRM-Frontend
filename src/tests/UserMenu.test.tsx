import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { UserMenu } from "@/features/auth/components/UserMenu";
import type { User } from "@/types/api";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

const signedInUser = {
  fullName: "Jess",
  email: "jess@gmail.com",
} as User;

/**
 * The account dropdown. Its two links are permission-asymmetric — the profile is
 * always the user's own, the business is gated — so the tests are about which
 * entries a given role is offered.
 */
async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: /Jess/ }));
}

describe("UserMenu", () => {
  it("offers Business information to a role with tenants:read", async () => {
    renderWithAuth(<UserMenu />, { user: signedInUser });

    await openMenu();

    expect(
      screen.getByRole("menuitem", { name: "Profil saya" }),
    ).toHaveAttribute("href", "/dashboard/profile");
    expect(
      screen.getByRole("menuitem", { name: "Profil usaha" }),
    ).toHaveAttribute("href", "/dashboard/settings/general");
  });

  it("hides Business information from a role without the grant", async () => {
    renderWithAuth(<UserMenu />, {
      user: signedInUser,
      isSuperAdmin: false,
      permissions: [{ feature: "users", actions: ["read"] }],
    });

    await openMenu();

    // The profile link is never gated — it is this user's own account.
    expect(screen.getByRole("menuitem", { name: "Profil saya" })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Profil usaha" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Keluar" })).toBeInTheDocument();
  });

  it("closes the menu when an item is chosen", async () => {
    renderWithAuth(<UserMenu />, { user: signedInUser });

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Profil usaha" }),
    );

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
