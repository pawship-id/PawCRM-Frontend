import { screen } from "@testing-library/react";

import { PurchasingModuleHeader } from "@/features/purchasing";

import { renderWithAuth } from "./helpers/renderWithAuth";

const pathname = jest.fn(() => "/dashboard/purchasing");
jest.mock("next/navigation", () => ({
  usePathname: () => pathname(),
}));

/**
 * The head of the Pembelian module — the tab row that replaced the rail's
 * submenu.
 *
 * FIVE TABS ON FOUR GRANTS, so what matters here is that each one appears for
 * its own grant and no other, and that the hub tab does not sit lit on all five
 * (its href is the prefix of every sibling's).
 *
 * KATEGORI SUPPLIER IS DELIBERATELY ABSENT (1 October 2026, corrected the same
 * day from an earlier pass that dropped Supplier instead): the list is opened
 * from a card on Pengaturan › Umum now, and `SupplierCategoriesScreen` wears
 * `SettingsPageHeader` rather than this header. Supplier KEEPS its tab — a
 * "Kategori Supplier" tab reappearing here is a regression, not a fix.
 */
/**
 * THE OTHER FOUR MATCH THE MOCKUP'S OWN LABELS AND ORDER (1 October 2026, on
 * request): Faktur, Penerimaan, Supplier, Retur — not the fuller "Faktur
 * Pembelian" / "Penerimaan Barang" / "Retur ke Supplier" this row used to
 * carry, and not the rail's purchase-order sequencing either (vendor, goods,
 * invoice, return) that an earlier pass had kept instead.
 */
const ALL_TABS = ["Ringkasan", "Faktur", "Penerimaan", "Supplier", "Retur"];

function tabNames() {
  return screen
    .getAllByRole("link")
    .map((link) => link.textContent?.trim() ?? "");
}

beforeEach(() => {
  pathname.mockReturnValue("/dashboard/purchasing");
});

describe("PurchasingModuleHeader", () => {
  it("draws all five tabs in the mockup's own order", () => {
    renderWithAuth(<PurchasingModuleHeader />);

    expect(tabNames()).toEqual(ALL_TABS);
    expect(screen.getByRole("link", { name: "Faktur" })).toHaveAttribute(
      "href",
      "/dashboard/purchasing/payables",
    );
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

    expect(screen.getByRole("link", { name: "Penerimaan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows a role only the tabs it holds a grant for", () => {
    renderWithAuth(<PurchasingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "purchaseInvoices", actions: ["read"] }],
    });

    // The hub rides along ungated — it gates each of its own cards, so it is
    // exactly as much as the role may read.
    expect(tabNames()).toEqual(["Ringkasan", "Faktur"]);
  });

  it("renders the tab's own headline figure in the action slot", () => {
    // The figures belong to the screens — this header only makes room for them.
    renderWithAuth(<PurchasingModuleHeader action={<p>Total sisa utang</p>} />);

    expect(screen.getByText("Total sisa utang")).toBeInTheDocument();
  });

  /**
   * The mockup's own heading: a title, the sentence saying what the module is
   * for, and NO trail — its `crumbs()` draws one only for a page with a parent,
   * and the crumb this header used to carry read "Pembelian" directly above an
   * `h1` reading "Pembelian".
   */
  it("states what the module is for, with no breadcrumb over the title", () => {
    renderWithAuth(<PurchasingModuleHeader />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Pembelian" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Faktur pemasok, penerimaan barang, dan utang."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Breadcrumb" }),
    ).not.toBeInTheDocument();
  });
});
