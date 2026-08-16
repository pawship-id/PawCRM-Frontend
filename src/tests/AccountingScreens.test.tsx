import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import {
  ChartOfAccountsScreen,
  JournalEntriesScreen,
  JournalEntryDetail,
} from "@/features/accounting";
import { DUMMY_ENTRIES } from "@/features/accounting/data/dummy";
import { ApiError } from "@/services/api-error";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import type { AccountType, ChartOfAccountNode } from "@/types/accounting";

/**
 * Mount tests for the accounting screens.
 *
 * The COA screen reads GET /chart-of-accounts/tree and is driven here through a
 * stubbed service; the ledger screens still read fixtures.
 *
 * WHAT IS WORTH ASSERTING. Not fixture values — those change with the demo data
 * and a test that pins them is a test that has to be edited every time somebody
 * adds an example row. What is pinned here is behaviour, and each of these is a
 * real bug if it breaks: the COA renders the API's nesting as a hierarchy and
 * not a flat list, a search keeps a match's ancestors so it never reads as a
 * root account, a failed request says so instead of showing an empty chart, the
 * ledger's two totals balance, and a reversed entry says so before anyone reads
 * its amounts.
 */

/** One tree node, with the fields the screen actually reads. */
function node(
  code: string,
  name: string,
  accountType: AccountType,
  {
    children = [],
    isActive = true,
    isDefault = false,
    parentAccountId = null,
  }: Partial<ChartOfAccountNode> = {},
): ChartOfAccountNode {
  return {
    _id: code,
    code,
    name,
    accountType,
    parentAccountId,
    isDefault,
    isActive,
    children: children.map((child) => ({ ...child, parentAccountId: code })),
  };
}

/**
 * A chart shaped like a real one: three levels under Aset, a second class to
 * prove a search does not drag unrelated branches in, and one deactivated
 * account for the toggle.
 */
function chart(): ChartOfAccountNode[] {
  return [
    node("1000", "Aset", "asset", {
      children: [
        node("1100", "Aset Lancar", "asset", {
          children: [node("1101", "Kas", "asset", { isDefault: true })],
        }),
        node("1300", "Pajak Dibayar di Muka", "asset", {
          children: [node("1301", "PPN Masukan", "asset", { isDefault: true })],
        }),
      ],
    }),
    node("2000", "Kewajiban", "liability", {
      children: [node("2101", "Utang Supplier", "liability")],
    }),
    node("5000", "Beban", "expense", {
      children: [node("5401", "Beban Penyusutan", "expense", { isActive: false })],
    }),
  ];
}

/** Stubs the one request the screen makes on mount. */
function mockTree(roots: ChartOfAccountNode[] = chart()) {
  return jest.spyOn(chartOfAccountsService, "tree").mockResolvedValue(roots);
}

/** Mounts the screen and waits for the first response to land. */
async function renderChart(roots?: ChartOfAccountNode[]) {
  mockTree(roots);
  renderWithAuth(<ChartOfAccountsScreen />);
  await screen.findByRole("table");
}

/**
 * Opens the one filter panel and returns it.
 *
 * The ordering and the deactivated-accounts toggle both live inside it — the
 * catalogue's arrangement — so each of those assertions starts here. The
 * trigger's text carries a count (`Filter (1)`); its accessible name does not,
 * so it is found by the stable half.
 */
async function openFilters() {
  await userEvent.click(screen.getByRole("button", { name: "Filter" }));
  return screen.findByRole("dialog");
}

/** Commits the panel's draft, which is what a panel's fields wait for. */
async function applyFilters() {
  await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));
}

describe("ChartOfAccountsScreen", () => {
  afterEach(() => jest.restoreAllMocks());

  it("renders the API's nesting as a tree, parents before their children", async () => {
    await renderChart();

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

  it("asks for the whole chart, unfiltered — the tiles count every class", async () => {
    const tree = mockTree();
    renderWithAuth(<ChartOfAccountsScreen />);
    await screen.findByRole("table");

    expect(tree).toHaveBeenCalledTimes(1);
    expect(tree).toHaveBeenCalledWith();
  });

  it("keeps a match's ancestors so it is not shown as a root account", async () => {
    await renderChart();

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

  it("hides deactivated accounts until the panel's toggle asks for them", async () => {
    await renderChart();

    expect(screen.queryByText("Beban Penyusutan")).not.toBeInTheDocument();

    const panel = await openFilters();
    await userEvent.click(
      within(panel).getByLabelText(/Tampilkan akun nonaktif/),
    );
    // A panel's fields wait for Terapkan — ticking it changes nothing yet.
    expect(screen.queryByText("Beban Penyusutan")).not.toBeInTheDocument();

    await applyFilters();

    expect(screen.getByText("Beban Penyusutan")).toBeInTheDocument();
    expect(screen.getByText("Nonaktif")).toBeInTheDocument();
  });

  it("counts the applied filter on the trigger, and Reset clears it at once", async () => {
    await renderChart();

    const panel = await openFilters();
    await userEvent.click(
      within(panel).getByLabelText(/Tampilkan akun nonaktif/),
    );
    await applyFilters();

    // The badge is what makes a collapsed panel safe — see ui-rules §8.
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );

    await openFilters();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));

    // Reset applies immediately, without waiting for Terapkan.
    expect(screen.queryByText("Beban Penyusutan")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter",
    );
  });

  it("reorders siblings without detaching them from their parents", async () => {
    await renderChart();

    const panel = await openFilters();
    await userEvent.click(within(panel).getByLabelText("Urutkan"));
    await userEvent.click(screen.getByRole("option", { name: "Kode 9–0" }));
    await applyFilters();

    const rows = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent ?? "");

    // Siblings flip…
    const ppn = rows.findIndex((text) => text.includes("1301"));
    const kas = rows.findIndex((text) => text.includes("1101"));
    expect(ppn).toBeLessThan(kas);

    // …but 1101 still hangs under 1100, and the classes stay in the order the
    // accounting equation reads them rather than being reordered too.
    const parent = rows.findIndex((text) => text.includes("1100"));
    expect(parent).toBeLessThan(kas);
    expect(rows.findIndex((text) => text.startsWith("Aset"))).toBeLessThan(
      rows.findIndex((text) => text.startsWith("Kewajiban")),
    );
  });

  it("groups the flat seeded chart under its account classes", async () => {
    await renderChart();

    const rows = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent ?? "");

    // The seeded chart has no 1000/2000 header ACCOUNTS — the class heading is
    // the screen's own, and every account of that class follows it.
    const aset = rows.findIndex((text) => text.startsWith("Aset"));
    const kas = rows.findIndex((text) => text.includes("1101"));
    const kewajiban = rows.findIndex((text) => text.startsWith("Kewajiban"));
    const utang = rows.findIndex((text) => text.includes("2101"));

    expect(aset).toBeGreaterThanOrEqual(0);
    expect(kas).toBeGreaterThan(aset);
    expect(kewajiban).toBeGreaterThan(kas);
    expect(utang).toBeGreaterThan(kewajiban);
    // …and the heading counts what is under it, folded or not.
    expect(rows[aset]).toContain("5 akun");
  });

  it("folds a whole class shut from its heading", async () => {
    await renderChart();

    await userEvent.click(
      screen.getByRole("button", { name: "Tutup kelompok Aset" }),
    );

    expect(screen.queryByText("Kas")).not.toBeInTheDocument();
    // The heading stays, so the class can be opened again — and so does the
    // rest of the chart.
    expect(
      screen.getByRole("button", { name: "Buka kelompok Aset" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Utang Supplier")).toBeInTheDocument();
  });

  it("narrows to one class from the panel, carrying each class's count", async () => {
    await renderChart();

    const panel = await openFilters();
    await userEvent.click(within(panel).getByLabelText("Filter tipe akun"));

    // The count the tile row used to show, now on the option itself — two
    // liability accounts in the fixture, 2000 and the 2101 under it.
    const option = screen.getByRole("option", { name: /Kewajiban/ });
    expect(option).toHaveTextContent("2");

    await userEvent.click(option);
    await applyFilters();

    expect(screen.queryByText("Kas")).not.toBeInTheDocument();
    expect(screen.getByText("Utang Supplier")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
  });

  it("collapses a branch when its chevron is pressed", async () => {
    await renderChart();

    expect(screen.getByText("Kas")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Tutup sub-akun 1100" }),
    );

    expect(screen.queryByText("Kas")).not.toBeInTheDocument();
    // The parent stays, so the branch can be opened again.
    expect(screen.getByText("Aset Lancar")).toBeInTheDocument();
  });

  it("reports a failed request instead of rendering an empty chart", async () => {
    jest
      .spyOn(chartOfAccountsService, "tree")
      .mockRejectedValue(new ApiError("Forbidden", 403));

    renderWithAuth(<ChartOfAccountsScreen />);

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("retries from the error banner, which is the only place that offers one", async () => {
    const tree = jest
      .spyOn(chartOfAccountsService, "tree")
      .mockRejectedValueOnce(new ApiError("Server sedang sibuk", 503))
      .mockResolvedValue(chart());

    renderWithAuth(<ChartOfAccountsScreen />);
    await screen.findByText("Server sedang sibuk");

    await userEvent.click(screen.getByRole("button", { name: /Coba lagi/ }));

    await waitFor(() => expect(tree).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    // The banner goes with the failure that put it there.
    expect(screen.queryByText("Server sedang sibuk")).not.toBeInTheDocument();
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
