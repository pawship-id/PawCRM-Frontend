import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { DashboardShell } from "@/features/auth/components/DashboardShell";
import type { Tenant } from "@/types/api";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/dashboard",
}));

const useTenant = jest.fn();
jest.mock("@/features/tenant", () => ({
  useTenant: (enabled?: boolean) => useTenant(enabled),
}));

const ANABUL = {
  name: "Anabul Group",
} as Tenant;

beforeEach(() => {
  useTenant.mockReturnValue({
    tenant: ANABUL,
    loading: false,
    error: null,
    refetch: jest.fn(),
  });
});

/**
 * The app chrome: a navy bar across the top, the rail below it, and the page in
 * what is left. The tests are about the two things the bar owns — which business
 * it names, and the rail width it remembers.
 */
describe("DashboardShell", () => {
  it("names the business in the bar", () => {
    renderWithAuth(<DashboardShell>halaman</DashboardShell>);

    expect(screen.getByText("Anabul Group")).toBeInTheDocument();
    // Two words, two letters — the chip is 24 px square.
    expect(screen.getByText("AG")).toBeInTheDocument();
  });

  it("does not ask for the business without the grant", () => {
    // GET /tenants/me needs `tenants:read`, which the seeded Staff role does not
    // hold. Asking anyway would paint a 403 across the chrome of every screen,
    // so the hook is told not to fire and the chip simply is not there.
    useTenant.mockReturnValue({
      tenant: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderWithAuth(<DashboardShell>halaman</DashboardShell>, {
      isSuperAdmin: false,
      permissions: [{ feature: "users", actions: ["read"] }],
    });

    expect(useTenant).toHaveBeenCalledWith(false);
    expect(screen.queryByText("Anabul Group")).not.toBeInTheDocument();
  });

  it("remembers a collapsed rail across a reload", async () => {
    const { unmount } = renderWithAuth(
      <DashboardShell>halaman</DashboardShell>,
    );

    const toggle = screen.getByRole("button", { name: "Ciutkan menu" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);

    expect(
      screen.getByRole("button", { name: "Lebarkan menu" }),
    ).toHaveAttribute("aria-pressed", "true");

    // The point of storing it: a fresh mount is a reload, and the rail used to
    // spring back to full width at every one.
    unmount();
    renderWithAuth(<DashboardShell>halaman</DashboardShell>);
    expect(
      screen.getByRole("button", { name: "Lebarkan menu" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("renders the page it is given", () => {
    renderWithAuth(<DashboardShell>halaman</DashboardShell>);
    expect(screen.getByText("halaman")).toBeInTheDocument();
  });

  it("waits for the /me verdict rather than flashing the chrome", () => {
    renderWithAuth(<DashboardShell>halaman</DashboardShell>, { user: null });

    expect(screen.queryByText("halaman")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Menu utama" }),
    ).not.toBeInTheDocument();
  });
});
