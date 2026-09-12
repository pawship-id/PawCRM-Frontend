import { screen } from "@testing-library/react";

import { AccountingModuleHeader } from "@/features/accounting";

import { renderWithAuth } from "./helpers/renderWithAuth";

const pathname = jest.fn(() => "/dashboard/keuangan");
jest.mock("next/navigation", () => ({
  usePathname: () => pathname(),
}));

/**
 * The head of the Keuangan module — the mockup's four tabs plus Transaksi,
 * gated on four different features, over a module that used to be seven rail
 * rows.
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
  it("draws the mockup's four tabs, with Transaksi beside Ringkasan", () => {
    renderWithAuth(<AccountingModuleHeader />);

    expect(tabNames()).toEqual([
      "Ringkasan",
      "Transaksi",
      "Kas & Bank",
      "Komisi",
      "Daftar Akun",
      "Jurnal",
    ]);
    expect(screen.getByRole("link", { name: "Daftar Akun" })).toHaveAttribute(
      "href",
      "/dashboard/keuangan/chart-of-accounts",
    );
    expect(screen.getByRole("link", { name: "Transaksi" })).toHaveAttribute(
      "href",
      "/dashboard/keuangan/transaksi",
    );
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

  it("gives the chart-of-accounts grant the Daftar Akun tab and nothing else", () => {
    renderWithAuth(<AccountingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "chartOfAccounts", actions: ["read"] }],
    });

    expect(tabNames()).toEqual(["Ringkasan", "Daftar Akun"]);
  });

  it("keeps Daftar Akun lit on the form nested under it", () => {
    pathname.mockReturnValue("/dashboard/keuangan/chart-of-accounts/new");
    renderWithAuth(<AccountingModuleHeader />);

    expect(
      screen.getByRole("link", { name: "Daftar Akun" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("gives the cash-transaction grant the Transaksi tab and nothing else", () => {
    renderWithAuth(<AccountingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "cashTransactions", actions: ["read"] }],
    });

    expect(tabNames()).toEqual(["Ringkasan", "Transaksi"]);
  });
});
