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
      screen.getByRole("menuitem", { name: "My profile" }),
    ).toHaveAttribute("href", "/dashboard/profile");
    expect(
      screen.getByRole("menuitem", { name: "Business information" }),
    ).toHaveAttribute("href", "/dashboard/business");
  });

  it("hides Business information from a role without the grant", async () => {
    renderWithAuth(<UserMenu />, {
      user: signedInUser,
      isSuperAdmin: false,
      permissions: [{ feature: "users", actions: ["read"] }],
    });

    await openMenu();

    // The profile link is never gated — it is this user's own account.
    expect(screen.getByRole("menuitem", { name: "My profile" })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Business information" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Logout" })).toBeInTheDocument();
  });

  it("closes the menu when an item is chosen", async () => {
    renderWithAuth(<UserMenu />, { user: signedInUser });

    await openMenu();
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Business information" }),
    );

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
