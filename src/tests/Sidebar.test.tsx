import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { Sidebar } from "@/features/dashboard/components/Sidebar";

const pathname = jest.fn(() => "/dashboard");
jest.mock("next/navigation", () => ({
  usePathname: () => pathname(),
}));

/**
 * The rail. Its permission gating is tested against the pure filter in
 * nav.test.ts, so these are about the three things only rendering can answer:
 * which row is marked as the current page, which submenu is unfolded, and
 * whether a section heading ever outlives its rows.
 */
function renderRail(overrides: Parameters<typeof renderWithAuth>[1] = {}) {
  return renderWithAuth(
    <Sidebar
      open
      collapsed={false}
      onClose={jest.fn()}
      onExpand={jest.fn()}
    />,
    overrides,
  );
}

beforeEach(() => {
  pathname.mockReturnValue("/dashboard");
});

describe("Sidebar", () => {
  it("marks the current page and nothing else", () => {
    renderRail();

    expect(screen.getByRole("link", { name: "Beranda" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Kasir" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("unfolds the group that owns the current route", async () => {
    pathname.mockReturnValue("/dashboard/inventory/products");
    renderRail();

    expect(
      screen.getByRole("button", { name: "Inventori" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("link", { name: "Produk & Varian" }),
    ).toHaveAttribute("aria-current", "page");

    // Its neighbours stay folded — one open submenu, not all of them.
    // Pengaturan rather than Pembelian, which is a leaf now: every screen under
    // it is a tab of one row.
    expect(screen.getByRole("button", { name: "Pengaturan" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("leaves the hub unmarked on a screen below it", () => {
    // The hub's href is the prefix of every sibling's, so without `exact` it
    // would read as the current page on all eight screens in the module.
    pathname.mockReturnValue("/dashboard/inventory/products");
    renderRail();

    // Scoped to the group's own list: three submenus have a row called
    // "Ringkasan", which is why each list is named after its group.
    const inventori = screen.getByRole("list", { name: "Inventori" });
    expect(
      within(inventori).getByRole("link", { name: "Ringkasan" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("folds and unfolds a group on click", async () => {
    renderRail();
    const group = screen.getByRole("button", { name: "Pengaturan" });

    expect(group).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "false");
  });

  it("widens the rail rather than opening a submenu with nowhere to go", async () => {
    const onExpand = jest.fn();
    renderWithAuth(
      <Sidebar open collapsed onClose={jest.fn()} onExpand={onExpand} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Inventori" }));

    expect(onExpand).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Inventori" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("closes the mobile drawer when a link is chosen", async () => {
    const onClose = jest.fn();
    renderWithAuth(
      <Sidebar open collapsed={false} onClose={onClose} onExpand={jest.fn()} />,
    );

    await userEvent.click(screen.getByRole("link", { name: "Kasir" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("drops a section heading along with its rows", () => {
    // A role that may read nothing in Transaksi. The heading is a heading over
    // rows; printed over nothing it reads as a menu that failed to load.
    renderRail({
      isSuperAdmin: false,
      permissions: [{ feature: "users", actions: ["read"] }],
    });

    expect(screen.queryByText("Transaksi")).not.toBeInTheDocument();
    // Sistem survives — Pengguna is the one row that grant opens.
    const rail = screen.getByRole("navigation", { name: "Menu utama" });
    expect(within(rail).getByText("Sistem")).toBeInTheDocument();
  });
});
