import { screen } from "@testing-library/react";

import { AccountingModuleHeader } from "@/features/accounting";

import { renderWithAuth } from "./helpers/renderWithAuth";

const pathname = jest.fn(() => "/dashboard/keuangan");
jest.mock("next/navigation", () => ({
  usePathname: () => pathname(),
}));

/**
 * The head of the Keuangan module — the mockup's four tabs, gated on three
 * different features, over a module that used to be seven rail rows.
 */
function tabNames() {
  return screen
    .getAllByRole("link")
    .map((link) => link.textContent?.trim() ?? "");
}

beforeEach(() => {
  pathname.mockReturnValue("/dashboard/keuangan");
});

describe("AccountingModuleHeader", () => {
  it("draws the mockup's four tabs", () => {
    renderWithAuth(<AccountingModuleHeader />);

    expect(tabNames()).toEqual(["Ringkasan", "Kas & Bank", "Komisi", "Jurnal"]);
    // Komisi moved under Keuangan; its old /dashboard/reports address redirects.
    expect(screen.getByRole("link", { name: "Komisi" })).toHaveAttribute(
      "href",
      "/dashboard/keuangan/komisi",
    );
  });

  it("does not leave the hub tab lit on the tabs nested under it", () => {
    pathname.mockReturnValue("/dashboard/keuangan/journal-entries");
    renderWithAuth(<AccountingModuleHeader />);

    expect(screen.getByRole("link", { name: "Jurnal" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Ringkasan" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("gives the payroll grant the Komisi tab and nothing else", () => {
    // The recap names every groomer and what they are owed, so it goes with the
    // staff register rather than with a finance grant. The hub tab is ungated
    // and rides along.
    renderWithAuth(<AccountingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "users", actions: ["read"] }],
    });

    expect(tabNames()).toEqual(["Ringkasan", "Komisi"]);
  });

  it("gives a bookkeeper the ledger without the payroll", () => {
    renderWithAuth(<AccountingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "journalEntries", actions: ["read"] }],
    });

    expect(tabNames()).toEqual(["Ringkasan", "Jurnal"]);
  });
});
