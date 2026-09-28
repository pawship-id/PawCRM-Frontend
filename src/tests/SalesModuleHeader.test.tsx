import { screen } from "@testing-library/react";

import { SalesModuleHeader } from "@/features/sales";

import { renderWithAuth } from "./helpers/renderWithAuth";

const pathname = jest.fn(() => "/dashboard/sales");
jest.mock("next/navigation", () => ({
  usePathname: () => pathname(),
}));

/**
 * The head of the Penjualan module — five tabs, two of which open on "belum
 * tersedia", and one of which lives outside the module's own route prefix.
 */
function tabNames() {
  return screen
    .getAllByRole("link")
    .map((link) => link.textContent?.trim() ?? "");
}

beforeEach(() => {
  pathname.mockReturnValue("/dashboard/sales");
});

describe("SalesModuleHeader", () => {
  it("draws the mockup's five tabs, every one of them a route", () => {
    renderWithAuth(<SalesModuleHeader />);

    expect(tabNames()).toEqual([
      "Ringkasan",
      "Faktur",
      "Piutang",
      "E-commerce",
      "Retur",
    ]);
    expect(screen.getByRole("link", { name: "Ringkasan" })).toHaveAttribute(
      "href",
      "/dashboard/sales/ringkasan",
    );
    expect(screen.getByRole("link", { name: "Piutang" })).toHaveAttribute(
      "href",
      "/dashboard/sales/piutang",
    );
    // E-commerce predates this module and keeps its own route, outside the
    // /dashboard/sales prefix — which is why the rail needs a `match` entry.
    expect(screen.getByRole("link", { name: "E-commerce" })).toHaveAttribute(
      "href",
      "/dashboard/ecommerce-sync",
    );
  });

  it("leaves Faktur at the module's landing route, not Ringkasan", () => {
    // Every existing link into Penjualan opens /dashboard/sales; a Ringkasan
    // that took it over would silently redirect all of them.
    renderWithAuth(<SalesModuleHeader />);

    expect(screen.getByRole("link", { name: "Faktur" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Ringkasan" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("does not leave the Faktur tab lit on the tabs nested under it", () => {
    pathname.mockReturnValue("/dashboard/sales/piutang");
    renderWithAuth(<SalesModuleHeader />);

    expect(screen.getByRole("link", { name: "Piutang" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Faktur" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks E-commerce even though it sits outside the module's prefix", () => {
    pathname.mockReturnValue("/dashboard/ecommerce-sync");
    renderWithAuth(<SalesModuleHeader />);

    expect(screen.getByRole("link", { name: "E-commerce" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("hides Ringkasan, Faktur and Piutang from a role that cannot read invoices", () => {
    // Who owes the shop money is the sensitive half of this module; the two
    // ungated placeholders ride along because they hold nothing.
    renderWithAuth(<SalesModuleHeader />, {
      isSuperAdmin: false,
      permissions: [],
    });

    expect(tabNames()).toEqual(["E-commerce", "Retur"]);
  });

  it("renders the tab's own create button in the action slot", () => {
    renderWithAuth(<SalesModuleHeader action={<button>Buat faktur</button>} />);

    expect(
      screen.getByRole("button", { name: "Buat faktur" }),
    ).toBeInTheDocument();
  });
});
