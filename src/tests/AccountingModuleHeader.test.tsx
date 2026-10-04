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
      "/dashboard/keuangan/kas-bank",
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

  /**
   * THE CHART OF ACCOUNTS IS NOT A TAB ANY MORE. It was one from 12 September
   * 2026 as a stopgap — the mockup files it under Pengaturan, and that section
   * did not exist yet. It does now, so the grant that used to earn a tab here
   * earns nothing here.
   *
   * Asserted as an absence rather than dropped, because "this grant no longer
   * opens a finance tab" is the fact the move turns on, and a deleted test would
   * let the tab drift back in unnoticed.
   */
  it("gives the chart-of-accounts grant no tab of its own", () => {
    renderWithAuth(<AccountingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "chartOfAccounts", actions: ["read"] }],
    });

    expect(tabNames()).toEqual(["Ringkasan"]);
  });

  /**
   * THE MOVE MUST NOT TAKE THE LIST AWAY FROM ANYBODY. Transaksi stopped being a
   * tab, so the only way in is now Kas & Bank — and gating that on
   * `paymentChannels` alone would have locked out every role that could read
   * transactions and not channels. Either grant opens it; each half is gated
   * again inside.
   */
  it("still offers a way in to a role that may read transactions but not channels", () => {
    renderWithAuth(<AccountingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "cashTransactions", actions: ["read"] }],
    });

    expect(tabNames()).toEqual(["Ringkasan", "Kas & Bank"]);
  });

  it("gives the channel grant the Kas & Bank tab and nothing else", () => {
    renderWithAuth(<AccountingModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "paymentChannels", actions: ["read"] }],
    });

    expect(tabNames()).toEqual(["Ringkasan", "Kas & Bank"]);
  });
});
