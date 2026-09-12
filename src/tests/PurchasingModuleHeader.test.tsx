import { screen } from "@testing-library/react";

import { PurchasingModuleHeader } from "@/features/purchasing";

import { renderWithAuth } from "./helpers/renderWithAuth";

const pathname = jest.fn(() => "/dashboard/purchasing");
jest.mock("next/navigation", () => ({
  usePathname: () => pathname(),
}));

/**
 * The head of the Pembelian module — the six-tab row that replaced the rail's
 * submenu.
 *
 * SIX TABS ON FIVE GRANTS, so what matters here is that each one appears for its
 * own grant and no other, and that the hub tab does not sit lit on all six
 * (its href is the prefix of every sibling's).
 */
const ALL_TABS = [
  "Ringkasan",
  "Supplier",
  "Kategori Supplier",
  "Penerimaan Barang",
  "Faktur Pembelian",
  "Retur ke Supplier",
];

function tabNames() {
  return screen
    .getAllByRole("link")
    .map((link) => link.textContent?.trim() ?? "");
}

beforeEach(() => {
  pathname.mockReturnValue("/dashboard/purchasing");
});

describe("PurchasingModuleHeader", () => {
  it("draws all six tabs in the order a purchase unfolds", () => {
    renderWithAuth(<PurchasingModuleHeader />);

    expect(tabNames()).toEqual(ALL_TABS);
    expect(
      screen.getByRole("link", { name: "Faktur Pembelian" }),
    ).toHaveAttribute("href", "/dashboard/purchasing/payables");
  });

  it("marks the hub tab only on the hub itself", () => {
    renderWithAuth(<PurchasingModuleHeader />);
    expect(screen.getByRole("link", { name: "Ringkasan" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Its href is the prefix of all five siblings, so without `exact` it would
    // read as the current page on every screen in the module.
    pathname.mockReturnValue("/dashboard/purchasing/suppliers");
    renderWithAuth(<PurchasingModuleHeader />);
    const [, second] = screen.getAllByRole("link", { name: "Ringkasan" });
    expect(second).not.toHaveAttribute("aria-current");
  });

  it("keeps a tab lit on its own detail routes", () => {
    pathname.mockReturnValue("/dashboard/purchasing/receipts/507f1f");
    renderWithAuth(<PurchasingModuleHeader />);

    expect(
      screen.getByRole("link", { name: "Penerimaan Barang" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("shows a role only the tabs it holds a grant for", () => {
    renderWithAuth(<PurchasingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "purchaseInvoices", actions: ["read"] }],
    });

    // The hub rides along ungated — it gates each of its own cards, so it is
    // exactly as much as the role may read.
    expect(tabNames()).toEqual(["Ringkasan", "Faktur Pembelian"]);
  });

  it("renders the tab's own headline figure in the action slot", () => {
    // The figures belong to the screens — this header only makes room for them.
    renderWithAuth(<PurchasingModuleHeader action={<p>Total sisa utang</p>} />);

    expect(screen.getByText("Total sisa utang")).toBeInTheDocument();
  });
});
