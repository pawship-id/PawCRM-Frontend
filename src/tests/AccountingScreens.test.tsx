import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import {
  ChartOfAccountCreateForm,
  ChartOfAccountEditForm,
  ChartOfAccountsScreen,
  JournalEntriesScreen,
  JournalEntryDetail,
} from "@/features/accounting";
import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { journalEntryService } from "@/services/journalEntry.service";
import type {
  AccountType,
  ChartOfAccountNode,
  JournalEntry,
  JournalLine,
} from "@/types/accounting";
import type { PageResult } from "@/types/api";

// The form toasts on success; mock the library so no real dialog is created.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

// The form navigates back to the list once a save lands, which is the half of
// "it worked" that the dialog never had to do.
const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
}));

beforeEach(() => push.mockClear());

/**
 * Mount tests for the accounting screens.
 *
 * EVERY SCREEN HERE IS DRIVEN THROUGH A STUBBED SERVICE — the COA reads
 * GET /chart-of-accounts/tree, the ledger reads GET /journal-entries and
 * GET /journal-entries/:id. The fixtures are built in this file rather than
 * imported, so a change to the demo data cannot quietly change what a test
 * asserts.
 *
 * WHAT IS WORTH ASSERTING. Behaviour, not values, and each of these is a real
 * bug if it breaks: the COA renders the API's nesting as a hierarchy and not a
 * flat list, a search keeps a match's ancestors so it never reads as a root
 * account, a failed request says so instead of showing an empty chart, the
 * ledger asks the SERVER for the filter it was given rather than narrowing a
 * page in the browser, its two totals balance, and a reversed entry says so
 * before anyone reads its amounts.
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
    businessLineId = null,
  }: Partial<ChartOfAccountNode> = {},
): ChartOfAccountNode {
  return {
    _id: code,
    code,
    name,
    accountType,
    parentAccountId,
    businessLineId,
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

/** The line the chart labels its column with and the form offers in its picker. */
const GROOMING = { _id: "bl-grooming", name: "Grooming", color: "#1A2B4C" };

/**
 * Both accounting screens read `/business-lines` now. Stubbed rather than left
 * to reject: the read fails softly in production, so an unmocked rejection would
 * exercise the degraded screen and never notice the picker breaking.
 */
function mockLines(items = [GROOMING]) {
  return jest.spyOn(businessLineService, "list").mockResolvedValue({
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  });
}

/** Mounts the screen and waits for the first response to land. */
async function renderChart(roots?: ChartOfAccountNode[]) {
  mockTree(roots);
  mockLines();
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

/** Mounts the create form and waits for the chart its parent picker needs. */
async function renderCreateForm(roots?: ChartOfAccountNode[]) {
  mockTree(roots);
  mockLines();
  renderWithAuth(<ChartOfAccountCreateForm />);
  await screen.findByLabelText(/Kode akun/);
}

/** Mounts the edit form for one account and waits for it to be seeded. */
async function renderEditForm(accountId: string, roots?: ChartOfAccountNode[]) {
  mockTree(roots);
  mockLines();
  renderWithAuth(<ChartOfAccountEditForm accountId={accountId} />);
  await screen.findByLabelText(/Kode akun/);
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

  it("opens the edit page from the row's kebab", async () => {
    await renderChart();

    await userEvent.click(
      screen.getByRole("button", { name: "Aksi untuk 1101 Kas" }),
    );

    expect(within(screen.getByRole("menu")).getByRole("menuitem")).toHaveAttribute(
      "href",
      "/dashboard/keuangan/chart-of-accounts/1101/edit",
    );
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

/**
 * The create/edit form.
 *
 * What is pinned here is the half of the form that mirrors a SERVER rule, since
 * that is the half that silently rots when the backend moves: which fields a
 * seeded account may not change, which parents may be offered, that a patch
 * carries only what moved, and that a taken code lands on the field rather than
 * in a banner.
 */
describe("ChartOfAccountForm", () => {
  afterEach(() => jest.restoreAllMocks());

  /**
   * THE MAPPING IS MADE HERE, which is the whole point of the field: a tenant
   * naming the line on "5102 HPP Grooming" says it once for everything that ever
   * lands there, instead of per product or per transaction.
   */
  it("sends the business line the account was given", async () => {
    await renderCreateForm();
    const create = jest
      .spyOn(chartOfAccountsService, "create")
      .mockResolvedValue({} as never);

    await userEvent.type(screen.getByLabelText(/Kode akun/), "5102");
    await userEvent.type(screen.getByLabelText(/Nama akun/), "HPP Grooming");
    await userEvent.click(screen.getByLabelText("Lini bisnis"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Grooming" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Buat akun" }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ businessLineId: "bl-grooming" }),
      ),
    );
  });

  /** A tenant with no lines yet gets an explanation, not an empty dropdown. */
  it("says where to make a line when the tenant has none", async () => {
    mockTree();
    mockLines([]);
    renderWithAuth(<ChartOfAccountCreateForm />);
    await screen.findByLabelText(/Kode akun/);

    expect(
      await screen.findByText(/Keuangan → Lini Bisnis/),
    ).toBeInTheDocument();
  });

  it("creates an account from what was typed, uppercasing the code", async () => {
    await renderCreateForm();
    const create = jest
      .spyOn(chartOfAccountsService, "create")
      .mockResolvedValue({} as never);

    await userEvent.type(screen.getByLabelText(/Kode akun/), "1102a");
    await userEvent.type(screen.getByLabelText(/Nama akun/), "Bank BCA");
    await userEvent.click(screen.getByRole("button", { name: "Buat akun" }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        code: "1102A",
        name: "Bank BCA",
        accountType: "asset",
        parentAccountId: null,
        // Sent explicitly rather than omitted: null is the value that means "no
        // line", the same way it means "no parent" above it.
        businessLineId: null,
      }),
    );
    // Back to the list once it lands — the page's job, where the dialog used to
    // just close itself.
    expect(push).toHaveBeenCalledWith("/dashboard/keuangan/chart-of-accounts");
  });

  it("puts a taken code on the field, not in a banner", async () => {
    await renderCreateForm();
    jest
      .spyOn(chartOfAccountsService, "create")
      .mockRejectedValue(new ApiError("Account code '1101' already exists", 409));

    await userEvent.type(screen.getByLabelText(/Kode akun/), "1101");
    await userEvent.type(screen.getByLabelText(/Nama akun/), "Kas Kecil");
    await userEvent.click(screen.getByRole("button", { name: "Buat akun" }));

    expect(
      await screen.findByText(/sudah dipakai akun lain/),
    ).toBeInTheDocument();
    // And the user stays on the form, with what they typed still in it.
    expect(push).not.toHaveBeenCalled();
  });

  it("freezes the code and the type of a seeded account", async () => {
    await renderEditForm("1101");

    // The two fields every posting resolves against — the server answers 403.
    expect(screen.getByLabelText(/Kode akun/)).toBeDisabled();
    expect(screen.getByLabelText("Tipe akun")).toBeDisabled();
    // The name is still editable, because relabelling moves no money.
    expect(screen.getByLabelText(/Nama akun/)).toBeEnabled();
    expect(screen.getByText(/kodenya dipakai modul lain/)).toBeInTheDocument();
  });

  it("freezes only the type of an account that has sub-accounts", async () => {
    await renderEditForm("1100");

    expect(screen.getByLabelText(/Kode akun/)).toBeEnabled();
    expect(screen.getByLabelText("Tipe akun")).toBeDisabled();
    expect(screen.getByText(/punya sub-akun/)).toBeInTheDocument();
  });

  it("sends only what moved, because an empty patch is a 400", async () => {
    await renderEditForm("1101");
    const update = jest
      .spyOn(chartOfAccountsService, "update")
      .mockResolvedValue({} as never);

    const name = screen.getByLabelText(/Nama akun/);
    await userEvent.clear(name);
    await userEvent.type(name, "Kas Besar");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("1101", { name: "Kas Besar" }),
    );
  });

  it("offers only parents the server would accept", async () => {
    await renderEditForm("1100");

    await userEvent.click(screen.getByLabelText("Induk akun"));
    const options = screen.getAllByRole("option").map((o) => o.textContent ?? "");

    // The asset root is a legal parent…
    expect(options.some((text) => text.includes("1000"))).toBe(true);
    // …itself is not, nor its own child (either would detach the branch)…
    expect(options.some((text) => text.includes("1100"))).toBe(false);
    expect(options.some((text) => text.includes("1101"))).toBe(false);
    // …and neither is an account of another class.
    expect(options.some((text) => text.includes("2000"))).toBe(false);
  });

  it("explains an id that is not in the chart instead of rendering a blank form", async () => {
    mockTree();
    renderWithAuth(<ChartOfAccountEditForm accountId="tidak-ada" />);

    expect(await screen.findByText("Akun tidak ditemukan")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Kode akun/)).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ ledger */

/** One side of one transaction. Exactly one of debit/credit is non-zero. */
/**
 * One journal line, with money shaped the way the API really sends it.
 *
 * FOUR DECIMAL PLACES ON BOTH SIDES, `"0.0000"` INCLUDED. The backend renders
 * every amount at SCALE = 4 (utils/money.js), so the unused side of a line is
 * `"0.0000"` and never `"0"` — and a fixture that wrote the short form let a
 * `line.debit !== "0"` test pass here while calling every credit a debit on the
 * real screen.
 */
function line(
  accountId: string,
  debit: string,
  credit: string,
): JournalLine {
  return { accountId, businessLineId: null, debit, credit, memo: null };
}

/**
 * A balanced entry with the fields the two ledger screens read.
 *
 * Balanced by default because that is what the backend refuses a posting over —
 * an unbalanced fixture would be testing a state the API cannot produce.
 */
function entry(overrides: Partial<JournalEntry> & { _id: string }): JournalEntry {
  return {
    entryNumber: `JE-2026-08-${overrides._id}`,
    date: "2026-08-07T00:00:00.000Z",
    description: "Penjualan POS",
    branchId: "b1",
    branchName: "Cabang Kemang",
    source: { type: "pos", id: null, reference: null },
    lines: [
      line("1101", "150000.0000", "0.0000"),
      line("4101", "0.0000", "150000.0000"),
    ],
    cashflowType: "operating",
    tags: [],
    attachmentUrl: null,
    recurring: { enabled: false, interval: null },
    reversedByEntryId: null,
    reversesEntryId: null,
    createdByName: null,
    createdAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

/** One page of the ledger, shaped as GET /journal-entries answers. */
function ledgerPage(items: JournalEntry[]): PageResult<JournalEntry> {
  return {
    items,
    pagination: {
      page: 1,
      limit: 20,
      total: items.length,
      totalPages: items.length === 0 ? 0 : 1,
    },
  };
}

/**
 * Stubs the lookups both ledger screens make beside their own request.
 *
 * All three are allowed to fail in production and none of them sets an error —
 * they only label a filter or a column — so they are stubbed rather than left to
 * reject, which would leave an unhandled rejection in every test.
 */
function mockLedgerLookups() {
  jest.spyOn(journalEntryService, "totals").mockResolvedValue({
    period: { dateFrom: null, dateTo: null, timezone: "Asia/Jakarta" },
    debit: "300000.0000",
    credit: "300000.0000",
  });
  jest
    .spyOn(branchService, "list")
    .mockResolvedValue({
      items: [{ _id: "b1", name: "Cabang Kemang" }],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    } as never);
  jest.spyOn(businessLineService, "list").mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  } as never);
  jest.spyOn(chartOfAccountsService, "tree").mockResolvedValue([
    node("1101", "Kas", "asset"),
    node("4101", "Pendapatan Penjualan", "income"),
  ]);
}

describe("JournalEntriesScreen", () => {
  afterEach(() => jest.restoreAllMocks());

  /** Mounts the ledger over one page of entries and waits for it to land. */
  async function renderLedger(items: JournalEntry[]) {
    mockLedgerLookups();
    const list = jest
      .spyOn(journalEntryService, "list")
      .mockResolvedValue(ledgerPage(items));

    renderWithAuth(<JournalEntriesScreen />);
    await waitFor(() => expect(list).toHaveBeenCalled());

    return list;
  }

  it("groups the page by month", async () => {
    await renderLedger([
      entry({ _id: "1", date: "2026-08-07T00:00:00.000Z" }),
      entry({ _id: "2", date: "2026-07-30T00:00:00.000Z" }),
    ]);

    expect(await screen.findByText("Agustus 2026")).toBeInTheDocument();
    expect(screen.getByText("Juli 2026")).toBeInTheDocument();
  });

  /**
   * The filter goes to the SERVER, which is the whole difference from the
   * fixture-backed screen this replaced. Narrowing a 20-row page in the browser
   * would silently answer "manual entries" with "the manual entries that
   * happened to be on page 1".
   */
  it("asks the server for the source the panel picked", async () => {
    const list = await renderLedger([entry({ _id: "1" })]);
    await screen.findByText("Agustus 2026");

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await userEvent.click(within(panel).getByLabelText("Filter sumber entri"));
    await userEvent.click(screen.getByRole("option", { name: "Manual" }));

    // A panel's fields wait for Terapkan — picking one sends nothing yet.
    expect(list).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sourceType: "manual", page: 1 }),
      ),
    );
    // And the choice is visible on the trigger, because a hidden filter is one
    // people forget is on and then read the wrong numbers from.
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
  });

  /**
   * The ordering goes to the SERVER too, for the same reason the filters do:
   * reordering in the browser would only reorder the twenty rows that already
   * arrived, which on a paged list is not a sort but a lie.
   */
  it("asks the server to reorder rather than reordering the page", async () => {
    const list = await renderLedger([entry({ _id: "1" })]);
    await screen.findByText("Agustus 2026");

    // Every list starts ordered — the default is sent, not left implicit.
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "newest" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await userEvent.click(within(panel).getByLabelText("Urutkan"));
    await userEvent.click(
      screen.getByRole("option", { name: "Nomor jurnal A–Z" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "numberAsc", page: 1 }),
      ),
    );
  });

  /**
   * §8: the badge pays back what a panel CONCEALS, and it only does that if the
   * number means "this list is narrowed". Every list has an ordering, so counting
   * it would put a standing "(1)" over an unnarrowed ledger and teach people to
   * ignore the one control that tells them a filter is on.
   */
  it("leaves the ordering out of the filter count", async () => {
    await renderLedger([entry({ _id: "1" })]);
    await screen.findByText("Agustus 2026");

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await userEvent.click(within(panel).getByLabelText("Urutkan"));
    await userEvent.click(
      screen.getByRole("option", { name: "Tanggal terlama" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
        "Filter",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Filter" }),
    ).not.toHaveTextContent("(1)");
  });

  /**
   * A total is the same number whichever end of the list you read from, so
   * reordering must not send the server off to re-aggregate the whole book.
   */
  it("does not re-ask for the total when only the ordering changes", async () => {
    mockLedgerLookups();
    const totals = jest.spyOn(journalEntryService, "totals");
    jest
      .spyOn(journalEntryService, "list")
      .mockResolvedValue(ledgerPage([entry({ _id: "1" })]));

    renderWithAuth(<JournalEntriesScreen />);
    await screen.findByText("Agustus 2026");
    await waitFor(() => expect(totals).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await userEvent.click(within(panel).getByLabelText("Urutkan"));
    await userEvent.click(
      screen.getByRole("option", { name: "Tanggal terlama" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(journalEntryService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "oldest" }),
      ),
    );
    expect(totals).toHaveBeenCalledTimes(1);
  });

  it("distinguishes an empty book from an empty filter", async () => {
    const list = await renderLedger([]);

    expect(
      await screen.findByText("Belum ada entri di buku besar."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await userEvent.click(within(panel).getByLabelText("Filter sumber entri"));
    await userEvent.click(screen.getByRole("option", { name: "Manual" }));
    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText("Tidak ada entri di filter ini."),
    ).toBeInTheDocument();
  });

  it("reports a failed request instead of rendering an empty ledger", async () => {
    mockLedgerLookups();
    const list = jest
      .spyOn(journalEntryService, "list")
      .mockRejectedValueOnce(new ApiError("Server sedang sibuk", 503))
      .mockResolvedValue(ledgerPage([entry({ _id: "1" })]));

    renderWithAuth(<JournalEntriesScreen />);
    await screen.findByText("Server sedang sibuk");

    await userEvent.click(screen.getByRole("button", { name: /Coba lagi/ }));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Agustus 2026")).toBeInTheDocument();
    expect(screen.queryByText("Server sedang sibuk")).not.toBeInTheDocument();
  });

  /** "dibalik" is the row's most important word — its amounts reach no report. */
  it("marks a reversed entry before anyone reads its amount", async () => {
    await renderLedger([entry({ _id: "1", reversedByEntryId: "2" })]);

    expect(await screen.findByText("dibalik")).toBeInTheDocument();
  });

  /**
   * The headline total comes from the AGGREGATE endpoint, not from adding up the
   * page. Summing the rows on screen would give 150.000 here and call it the
   * total — a figure that changes with the page while its label does not.
   */
  it("takes the total from the server, not from the rows on screen", async () => {
    await renderLedger([entry({ _id: "1" })]);

    expect(await screen.findByText("Rp 300.000")).toBeInTheDocument();
    expect(screen.getAllByText("seluruh buku besar").length).toBe(2);
  });

  it("re-asks for the total when the filter changes, but not when the page does", async () => {
    mockLedgerLookups();
    const totals = jest.spyOn(journalEntryService, "totals");
    jest.spyOn(journalEntryService, "list").mockResolvedValue({
      items: [entry({ _id: "1" })],
      // Two pages, so the pager renders and can be clicked.
      pagination: { page: 1, limit: 20, total: 40, totalPages: 2 },
    });

    renderWithAuth(<JournalEntriesScreen />);
    await screen.findByText("Agustus 2026");
    await waitFor(() => expect(totals).toHaveBeenCalledTimes(1));

    // Paging asks for rows, not for a figure that cannot have changed.
    await userEvent.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() =>
      expect(journalEntryService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
    expect(totals).toHaveBeenCalledTimes(1);

    // A filter does change it, and it goes with the same narrowing the list got.
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await userEvent.click(within(panel).getByLabelText("Filter sumber entri"));
    await userEvent.click(screen.getByRole("option", { name: "Manual" }));
    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(totals).toHaveBeenLastCalledWith(
        expect.objectContaining({ sourceType: "manual" }),
      ),
    );
    // And it carries no page — a page is not a scope.
    const [sent] = totals.mock.calls.at(-1)!;
    expect(sent).not.toHaveProperty("page");
  });

  /** Rendering 0 would state a fact about the books that was never checked. */
  it("shows an em dash rather than zero when the total could not be read", async () => {
    mockLedgerLookups();
    jest
      .spyOn(journalEntryService, "totals")
      .mockRejectedValue(new ApiError("Forbidden", 403));
    jest
      .spyOn(journalEntryService, "list")
      .mockResolvedValue(ledgerPage([entry({ _id: "1" })]));

    renderWithAuth(<JournalEntriesScreen />);

    // The rows still render — a missing headline figure does not fail the screen.
    expect(await screen.findByText("Agustus 2026")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("Forbidden")).not.toBeInTheDocument();
  });
});

describe("JournalEntryDetail", () => {
  afterEach(() => jest.restoreAllMocks());

  /**
   * Stubs GET /journal-entries/:id over a small book, so the reversal banner's
   * counterpart lookup resolves too.
   */
  function mockBook(entries: JournalEntry[]) {
    mockLedgerLookups();
    return jest
      .spyOn(journalEntryService, "getById")
      .mockImplementation(async (id: string) => {
        const found = entries.find((item) => item._id === id);
        if (!found) throw new ApiError("Journal entry not found", 404);
        return found;
      });
  }

  /** Σdebit === Σcredit is what makes a row a journal entry. */
  it("checks the balance against the lines the API sent", async () => {
    mockBook([entry({ _id: "1" })]);
    renderWithAuth(<JournalEntryDetail entryId="1" />);

    expect(await screen.findByText("✓ seimbang")).toBeInTheDocument();
  });

  /**
   * The credit column carries the credit.
   *
   * Not a tautology: the side was picked with `line.debit !== "0"`, and the API
   * writes an unused side as `"0.0000"`, so every credit landed in the debit
   * column as "Rp 0" while the amount itself was printed nowhere. The totals row
   * sums the decimals properly, so the page went on saying "seimbang" over a
   * table in which no credit had a number.
   */
  it("prints a credit as a credit rather than as a zero debit", async () => {
    mockBook([entry({ _id: "1" })]);
    renderWithAuth(<JournalEntryDetail entryId="1" />);

    const creditRow = (
      await screen.findByText("Pendapatan Penjualan")
    ).closest("tr")!;
    const cells = within(creditRow).getAllByRole("cell");

    // …, Debit, Kredit — the last two.
    expect(cells.at(-2)).toHaveTextContent("—");
    expect(cells.at(-1)).toHaveTextContent("Rp 150.000");
    expect(within(creditRow).queryByText("Rp 0")).not.toBeInTheDocument();
  });

  it("warns that a reversed entry no longer counts, and links the correction", async () => {
    mockBook([
      entry({ _id: "1", reversedByEntryId: "2" }),
      entry({ _id: "2", entryNumber: "JE-2026-08-0002", reversesEntryId: "1" }),
    ]);
    renderWithAuth(<JournalEntryDetail entryId="1" />);

    const banner = (
      await screen.findByText(/Entri ini sudah dibalik/)
    ).closest("div")!;

    // The link's TEXT comes from a second request for the counterpart — the
    // entry itself only carries the id.
    expect(
      await within(banner).findByRole("link", { name: "JE-2026-08-0002" }),
    ).toHaveAttribute("href", "/dashboard/keuangan/journal-entries/2");
  });

  it("offers no reverse action on an entry already reversed", async () => {
    mockBook([entry({ _id: "1", reversedByEntryId: "2" })]);
    renderWithAuth(<JournalEntryDetail entryId="1" />);

    await screen.findByText(/Entri ini sudah dibalik/);
    expect(
      screen.queryByRole("button", { name: "Balik entri" }),
    ).not.toBeInTheDocument();
  });

  /** A 404 is not a failure to retry, so it offers the list rather than a reload. */
  it("explains an unknown id instead of rendering an empty page", async () => {
    mockBook([]);
    renderWithAuth(<JournalEntryDetail entryId="je-tidak-ada" />);

    expect(
      await screen.findByText("Entri tidak ditemukan."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Coba lagi/ }),
    ).not.toBeInTheDocument();
  });
});
