import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  ChartOfAccountsScreen,
  JournalEntriesScreen,
  JournalEntryDetail,
} from "@/features/accounting";
import { DUMMY_ENTRIES } from "@/features/accounting/data/dummy";

/**
 * Mount tests for the two accounting screens, which still read fixtures rather
 * than the API.
 *
 * WHAT IS WORTH ASSERTING ON A PROTOTYPE. Not the fixture values — those change
 * with the demo data and a test that pins them is a test that has to be edited
 * every time somebody adds an example row. What is pinned here is the behaviour
 * the screens exist to demonstrate, and each of these is a real bug if it
 * breaks: the COA renders as a hierarchy and not a flat list, a search keeps a
 * match's ancestors so it never reads as a root account, the ledger's two totals
 * balance, and a reversed entry says so before anyone reads its amounts.
 */
describe("ChartOfAccountsScreen", () => {
  it("renders the chart as a tree, parents before their children", () => {
    render(<ChartOfAccountsScreen />);

    const codes = screen
      .getAllByRole("row")
      // Skip the header row, which has no account code in it.
      .slice(1)
      .map((row) => row.textContent ?? "");

    const parent = codes.findIndex((text) => text.includes("1100"));
    const child = codes.findIndex((text) => text.includes("1101"));

    expect(parent).toBeGreaterThanOrEqual(0);
    expect(child).toBeGreaterThan(parent);
  });

  it("keeps a match's ancestors so it is not shown as a root account", async () => {
    render(<ChartOfAccountsScreen />);

    await userEvent.type(screen.getByLabelText("Cari akun"), "PPN Masukan");

    // Scoped to the table: "Aset" is also the label of a summary tile above it.
    const table = within(screen.getByRole("table"));

    // The match itself…
    expect(table.getByText("PPN Masukan")).toBeInTheDocument();
    // …and the two accounts it hangs from, dragged along for context.
    expect(table.getByText("Pajak Dibayar di Muka")).toBeInTheDocument();
    // The root, matched by code: "Aset" on its own also names the account-type
    // badge that every asset row carries.
    expect(table.getByText("1000")).toBeInTheDocument();
    // But nothing from an unrelated branch.
    expect(table.queryByText("Utang Supplier")).not.toBeInTheDocument();
  });

  it("hides deactivated accounts until the toggle asks for them", async () => {
    render(<ChartOfAccountsScreen />);

    expect(screen.queryByText("Beban Penyusutan")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch"));

    expect(screen.getByText("Beban Penyusutan")).toBeInTheDocument();
    expect(screen.getByText("nonaktif")).toBeInTheDocument();
  });

  it("collapses a branch when its chevron is pressed", async () => {
    render(<ChartOfAccountsScreen />);

    expect(screen.getByText("Kas")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Tutup sub-akun 1100" }),
    );

    expect(screen.queryByText("Kas")).not.toBeInTheDocument();
    // The parent stays, so the branch can be opened again.
    expect(screen.getByText("Aset Lancar")).toBeInTheDocument();
  });
});

describe("JournalEntriesScreen", () => {
  it("groups the ledger by month", () => {
    render(<JournalEntriesScreen />);

    expect(screen.getByText("Agustus 2026")).toBeInTheDocument();
    expect(screen.getByText("Juli 2026")).toBeInTheDocument();
  });

  it("filters by source, so only manual entries remain", async () => {
    render(<JournalEntriesScreen />);

    // Two POS sales in the fixtures, hence getAllBy — the point is that they
    // are there before the filter and gone after it.
    expect(screen.getAllByText(/Penjualan POS/).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByLabelText("Filter sumber entri"));
    await userEvent.click(screen.getByRole("option", { name: "Manual" }));

    expect(screen.queryByText(/Penjualan POS/)).not.toBeInTheDocument();
    expect(screen.getByText(/Beban sewa ruko Kemang/)).toBeInTheDocument();
  });

  it("says so when a date range matches nothing", async () => {
    render(<JournalEntriesScreen />);

    await userEvent.type(
      screen.getByLabelText("Tanggal transaksi dari"),
      "2027-01-01",
    );

    expect(screen.getByText("Tidak ada entri di filter ini")).toBeInTheDocument();
  });
});

describe("JournalEntryDetail", () => {
  /** Σdebit === Σcredit is what makes a row a journal entry. */
  it("shows every fixture as balanced", () => {
    for (const entry of DUMMY_ENTRIES) {
      const { unmount } = render(<JournalEntryDetail entryId={entry._id} />);
      expect(screen.getByText("✓ seimbang")).toBeInTheDocument();
      unmount();
    }
  });

  it("warns that a reversed entry no longer counts, and links the correction", () => {
    const reversed = DUMMY_ENTRIES.find((entry) => entry.reversedByEntryId);
    expect(reversed).toBeDefined();

    render(<JournalEntryDetail entryId={reversed!._id} />);

    const banner = screen.getByText(/Entri ini sudah dibalik/).closest("div")!;
    expect(
      within(banner).getByRole("link", { name: /JE-/ }),
    ).toHaveAttribute(
      "href",
      `/dashboard/keuangan/journal-entries/${reversed!.reversedByEntryId}`,
    );
  });

  it("offers no reverse action on an entry already reversed", () => {
    const reversed = DUMMY_ENTRIES.find((entry) => entry.reversedByEntryId)!;
    render(<JournalEntryDetail entryId={reversed._id} />);

    expect(
      screen.queryByRole("button", { name: "Balik entri" }),
    ).not.toBeInTheDocument();
  });

  it("explains an unknown id instead of rendering an empty page", () => {
    render(<JournalEntryDetail entryId="je-tidak-ada" />);

    expect(screen.getByText("Entri tidak ditemukan")).toBeInTheDocument();
  });
});
