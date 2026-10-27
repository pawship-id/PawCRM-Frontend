import { screen } from "@testing-library/react";

import { AccountingModuleHeader } from "@/features/accounting";

import { renderWithAuth } from "./helpers/renderWithAuth";

const pathname = jest.fn(() => "/dashboard/finance");
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
  pathname.mockReturnValue("/dashboard/finance");
});

describe("AccountingModuleHeader", () => {
  it("draws the mockup's tabs, with Kas & Bank beside Ringkasan", () => {
    renderWithAuth(<AccountingModuleHeader />);

    // Transaksi is NOT among them: it became the first sub-tab of Kas & Bank,
    // because a list of movements is only readable next to the accounts they
    // moved through.
    // Daftar Akun is NOT among them either: it moved to Pengaturan on 20
    // September 2026, per the mockup, and is reached from the sidebar and from
    // Ringkasan's card list.
    expect(tabNames()).toEqual([
      "Ringkasan",
      "Kas & Bank",
      "Komisi",
      "Jurnal",
    ]);
    expect(screen.getByRole("link", { name: "Kas & Bank" })).toHaveAttribute(
      "href",
      "/dashboard/finance/cash-bank",
    );
    // Komisi moved under Keuangan; its old /dashboard/reports address redirects.
    expect(screen.getByRole("link", { name: "Komisi" })).toHaveAttribute(
      "href",
      "/dashboard/finance/commissions",
    );
  });

  it("does not leave the hub tab lit on the tabs nested under it", () => {
    pathname.mockReturnValue("/dashboard/finance/journal-entries");
    renderWithAuth(<AccountingModuleHeader />);

    expect(screen.getByRole("link", { name: "Jurnal" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Ringkasan" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  /*
    EACH TAB ANSWERS TO ITS OWN "LIHAT" since 14 October 2026 — Ringkasan too,
    so it is no longer shown to every role that reaches the module.
  */
  it("gives the Komisi grant the Komisi tab and nothing else", () => {
    renderWithAuth(<AccountingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "commissionReports", actions: ["read"] }],
    });

    expect(tabNames()).toEqual(["Komisi"]);
  });

  it("no longer opens Komisi on the staff register alone", () => {
    renderWithAuth(<AccountingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "users", actions: ["read"] }],
    });

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("gives a bookkeeper the ledger without the payroll", () => {
    renderWithAuth(<AccountingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "journalEntries", actions: ["read"] }],
    });

    expect(tabNames()).toEqual(["Jurnal"]);
  });

  it("shows Ringkasan only to its own grant", () => {
    renderWithAuth(<AccountingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "financeSummary", actions: ["read"] }],
    });

    expect(tabNames()).toEqual(["Ringkasan"]);
  });

  it("opens Kas & Bank on either of its sub-tabs, not on the channel list", () => {
    renderWithAuth(<AccountingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "fixedCosts", actions: ["read"] }],
    });
    expect(tabNames()).toEqual(["Kas & Bank"]);
  });

  it("gives the channel grant no tab — the channel list is in Pengaturan", () => {
    renderWithAuth(<AccountingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "paymentChannels", actions: ["read"] }],
    });

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
