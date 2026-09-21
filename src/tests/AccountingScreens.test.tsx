import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import {
  ChartOfAccountCreateForm,
  ChartOfAccountEditForm,
  ChartOfAccountsScreen,
  JournalEntriesScreen,
  JournalEntryCreateForm,
  JournalEntryDetail,
} from "@/features/accounting";
import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { journalEntryService } from "@/services/journalEntry.service";
import type {
  AccountCategory,
  ChartOfAccountNode,
  JournalEntry,
  JournalLine,
} from "@/types/accounting";
import { accountTypeOf } from "@/types/accounting";
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

/**
 * The module header — the title and the four-tab row — is stubbed out. It needs
 * a router this suite has no reason to stand up, and its own behaviour has its
 * own suite (AccountingModuleHeader.test.tsx). The `action` slot is rendered so
 * anything a screen puts INTO the header still reaches these assertions.
 */
jest.mock("@/features/accounting/components/AccountingModuleHeader", () => ({
  AccountingModuleHeader: ({ action }: { action?: React.ReactNode }) =>
    action ?? null,
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
  /**
   * THE CATEGORY, and the class is derived from it exactly as the server does.
   * Passing both would let a fixture claim a combination the API cannot produce,
   * and the screen groups on the category while the badge tone reads the class —
   * so a mismatched pair would make one of the two assertions meaningless.
   */
  accountCategory: AccountCategory,
  {
    children = [],
    isActive = true,
    isDefault = false,
    parentAccountId = null,
    allocations = [],
  }: Partial<ChartOfAccountNode> = {},
): ChartOfAccountNode {
  return {
    _id: code,
    code,
    name,
    accountCategory,
    accountType: accountTypeOf(accountCategory),
    parentAccountId,
    allocations,
    isDefault,
    isActive,
    children: children.map((child) => ({ ...child, parentAccountId: code })),
  };
}

/**
 * A chart shaped like a real one: three levels under one category, two more
 * categories to prove a search does not drag unrelated branches in, and one
 * deactivated account for the toggle.
 *
 * EVERY BRANCH IS ONE CATEGORY THROUGHOUT, because that is now the rule a child
 * must satisfy — a fixture mixing categories down a branch would be a chart the
 * API would refuse to have produced.
 */
function chart(): ChartOfAccountNode[] {
  return [
    node("1000", "Aset", "aset_lancar_lainnya", {
      children: [
        node("1100", "Aset Lancar", "aset_lancar_lainnya", {
          children: [
            node("1101", "Kas", "aset_lancar_lainnya", { isDefault: true }),
          ],
        }),
        node("1300", "Pajak Dibayar di Muka", "aset_lancar_lainnya", {
          children: [
            node("1301", "PPN Masukan", "aset_lancar_lainnya", {
              isDefault: true,
            }),
          ],
        }),
      ],
    }),
    node("2000", "Kewajiban", "hutang_dagang", {
      children: [node("2101", "Utang Usaha", "hutang_dagang")],
    }),
    node("5000", "Beban", "biaya", {
      children: [
        node("5401", "Beban Penyusutan", "biaya", { isActive: false }),
      ],
    }),
    // A mapped expense, so the Aturan Alokasi column has all three of its states
    // on one screen: this one, the unmapped 5000/5401 above, and the neraca
    // accounts that can never have any.
    node("5101", "Beban Gaji", "biaya", {
      allocations: [
        {
          _id: "alloc-groom",
          name: "Gaji - Grooming",
          allocationType: "direct",
          businessLineId: "bl-grooming",
          branchId: null,
          isActive: true,
        },
        {
          _id: "alloc-admin",
          name: "Gaji - Admin",
          allocationType: "shared_overall",
          businessLineId: null,
          branchId: null,
          isActive: true,
        },
      ],
    }),
  ];
}

/** Stubs the one request the screen makes on mount. */
function mockTree(roots: ChartOfAccountNode[] = chart()) {
  return jest.spyOn(chartOfAccountsService, "tree").mockResolvedValue(roots);
}

/** The lines an allocation rule can point at. */
const GROOMING = {
  _id: "bl-grooming",
  name: "Grooming",
  color: "#1A2B4C",
  branchIds: [],
};
const RETAIL = {
  _id: "bl-retail",
  name: "Retail",
  color: "#B96A05",
  branchIds: [],
};

/** …and the branches. */
const PUSAT = { _id: "br-pusat", name: "Pusat" };
const BARAT = { _id: "br-barat", name: "Barat" };

/**
 * Both accounting screens read `/business-lines` now. Stubbed rather than left
 * to reject: the read fails softly in production, so an unmocked rejection would
 * exercise the degraded screen and never notice the picker breaking.
 */
function mockLines(items = [GROOMING, RETAIL]) {
  return jest.spyOn(businessLineService, "list").mockResolvedValue({
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  });
}

/**
 * The branches, and this one is not optional dressing.
 *
 * `useAllocationTargets` counts the lines AND the branches to decide whether the
 * tenant has anything to allocate at all — one of each and the whole Aturan
 * Alokasi column collapses to "Tidak perlu alokasi". A suite that left this
 * unmocked would get an empty list from the swallowed rejection and silently
 * assert the degraded screen.
 */
function mockBranches(items: Array<{ _id: string; name: string }> = [PUSAT, BARAT]) {
  return jest.spyOn(branchService, "list").mockResolvedValue({
    items: items as never,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  });
}

/** Mounts the screen and waits for the first response to land. */
async function renderChart(roots?: ChartOfAccountNode[]) {
  mockTree(roots);
  mockLines();
  mockBranches();
  renderWithAuth(<ChartOfAccountsScreen />);
  await screen.findByRole("table");
  // The second read settles a tick after the chart does, and the Aturan Alokasi
  // column cannot be read until it has — without this every allocation
  // assertion races a tenant that momentarily looks like it has no lines.
  await screen.findByText(/Cara kerja Aturan Alokasi/);
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

/**
 * Picks a category in the account form.
 *
 * The options are grouped by class (`SelectGroup`), which changes nothing for a
 * query by option name — the group label is not an option.
 */
/**
 * Picks a category by its PLAIN name.
 *
 * The option itself reads "110 - Cash & Bank" — BO's reference number leads it —
 * so the match has to be a substring. Callers pass the name because that is what
 * the test is about; pinning the number belongs in the one test below that is
 * about the number.
 */
async function pickCategory(label: string) {
  await userEvent.click(screen.getByRole("combobox", { name: "Kategori akun" }));
  await userEvent.click(
    screen.getByRole("option", { name: new RegExp(`\\d+ - ${label}$`) }),
  );
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

  /**
   * THE LIST IS FLAT NOW, and a search returns matches alone.
   *
   * It used to drag each match's ancestors along, because the screen drew a tree
   * and a hit rendered at the root would have implied it was a top-level
   * account. There is no tree to be misread any more — the hierarchy survives as
   * an indent — so the ancestors would be rows nobody asked for.
   */
  it("searches code and name, and shows only what matched", async () => {
    await renderChart();

    await userEvent.type(screen.getByLabelText("Cari akun"), "PPN Masukan");

    const table = within(screen.getByRole("table"));

    expect(table.getByText("PPN Masukan")).toBeInTheDocument();
    expect(table.queryByText("Utang Usaha")).not.toBeInTheDocument();
    expect(table.queryByText("Pajak Dibayar di Muka")).not.toBeInTheDocument();
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

  /**
   * SORTED FROM THE HEADERS, not from a field in the filter panel — the one
   * screen in the app that does, recorded as an exception in ui-rules §8.
   *
   * First click orders ascending, second flips it. Ascending first because every
   * column here reads that way, so one click gives the ordering somebody meant.
   */
  it("orders the whole list from a column header, and flips on a second click", async () => {
    await renderChart();

    const codesNow = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent ?? "");

    // Opens by code ascending, so 1101 is already above 2101.
    expect(codesNow().findIndex((t) => t.includes("1101"))).toBeLessThan(
      codesNow().findIndex((t) => t.includes("2101")),
    );

    await userEvent.click(screen.getByRole("button", { name: /^Kode/ }));

    const flipped = codesNow();
    expect(flipped.findIndex((t) => t.includes("2101"))).toBeLessThan(
      flipped.findIndex((t) => t.includes("1101")),
    );
  });

  /**
   * THE CATEGORY COLUMN SORTS ALPHABETICALLY, by the word on the badge.
   *
   * By the stored KEY it would read `aset_lancar_lainnya, aset_tetap, biaya, …`
   * — close enough to look right, and wrong wherever key and label part company:
   * "hpp" sorts between "hutang_lainnya" and "investasi…", while the label it
   * shows, "Harga Pokok Penjualan", belongs near the front.
   */
  it("orders the Kategori column by the word on the badge", async () => {
    await renderChart();

    await userEvent.click(screen.getByRole("button", { name: /^Kategori/ }));

    const rows = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent ?? "");

    // Aset Lancar Lainnya · Biaya · Hutang Dagang.
    expect(rows.findIndex((t) => t.includes("1101"))).toBeLessThan(
      rows.findIndex((t) => t.includes("5101")),
    );
    expect(rows.findIndex((t) => t.includes("5101"))).toBeLessThan(
      rows.findIndex((t) => t.includes("2101")),
    );
  });

  /**
   * THE CLASS SORTS ALPHABETICALLY, BY THE VISIBLE WORD — Aset, Beban, Ekuitas,
   * Kewajiban, Pendapatan.
   *
   * Sorting the stored KEYS would give `asset, equity, expense, income,
   * liability`, which on screen reads Aset, Ekuitas, Beban, Pendapatan,
   * Kewajiban — alphabetical in a language nobody is looking at. That is the
   * mistake this pins.
   */
  it("orders the Tipe akun column by the word on screen, not the stored key", async () => {
    await renderChart();

    await userEvent.click(screen.getByRole("button", { name: /^Tipe akun/ }));

    const rows = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent ?? "");

    // 1101 Aset · 5101 Beban · 2101 Kewajiban.
    expect(rows.findIndex((t) => t.includes("1101"))).toBeLessThan(
      rows.findIndex((t) => t.includes("5101")),
    );
    expect(rows.findIndex((t) => t.includes("5101"))).toBeLessThan(
      rows.findIndex((t) => t.includes("2101")),
    );
  });

  /**
   * THE CLASS IS PLAIN TEXT BESIDE THE CATEGORY BADGE. Two badges on one row
   * would read as two statuses of equal weight, and they are not: the category
   * is what the tenant chose, the class is derived from it.
   */
  it("shows the class of each account beside its category", async () => {
    await renderChart();

    const rowOf = (code: string) =>
      within(
        screen.getAllByRole("row").find((row) => row.textContent?.includes(code))!,
      );

    expect(rowOf("1101").getByText("Aset Lancar Lainnya")).toBeInTheDocument();
    expect(rowOf("1101").getByText("Aset")).toBeInTheDocument();
    expect(rowOf("2101").getByText("Kewajiban")).toBeInTheDocument();
    expect(rowOf("5101").getByText("Beban")).toBeInTheDocument();
  });

  /**
   * THE CLASS FILTER, and the thing that makes it safe to sit beside the
   * category one: the two are NOT independent — every category belongs to
   * exactly one class — so the category picker narrows to whatever class is
   * chosen. Offering "Cash & Bank" under a chosen "Beban" would be offering a
   * pair no row can ever satisfy.
   */
  it("narrows the category picker to the class chosen above it", async () => {
    await renderChart();
    const panel = await openFilters();

    await userEvent.click(within(panel).getByLabelText("Filter tipe akun"));
    await userEvent.click(screen.getByRole("option", { name: /^Beban/ }));

    await userEvent.click(within(panel).getByLabelText("Filter kategori akun"));

    // Read as a list: "Biaya" and "Biaya Lainnya" are both real options, so a
    // prefix matcher would find two and say nothing about either.
    const offered = screen
      .getAllByRole("option")
      .map((option) => option.textContent ?? "");

    expect(offered.some((text) => text.includes("Biaya Lainnya"))).toBe(true);
    expect(offered.some((text) => text.includes("Harga Pokok"))).toBe(true);
    // Every asset category is gone — the class above cannot hold them.
    expect(offered.some((text) => text.includes("Cash & Bank"))).toBe(false);
    expect(offered.some((text) => text.includes("Persediaan"))).toBe(false);
  });

  it("filters the table by the class, and counts it on the trigger", async () => {
    await renderChart();

    const panel = await openFilters();
    await userEvent.click(within(panel).getByLabelText("Filter tipe akun"));
    await userEvent.click(screen.getByRole("option", { name: /^Kewajiban/ }));
    await applyFilters();

    const table = within(screen.getByRole("table"));
    expect(table.getByText("Utang Usaha")).toBeInTheDocument();
    expect(table.queryByText("Kas")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
  });

  /** The panel stopped offering an ordering when the headers took it over. */
  it("no longer offers Urutkan in the filter panel", async () => {
    await renderChart();
    const panel = await openFilters();

    expect(within(panel).queryByLabelText("Urutkan")).not.toBeInTheDocument();
  });

  /**
   * THE THREE STATES OF THE ALLOCATION COLUMN, on one screen, because the whole
   * feature turns on telling them apart. Two of them look alike — a grey phrase,
   * no chevron — and mean completely different things.
   */
  it("says which accounts can be mapped, which cannot, and which nobody has", async () => {
    await renderChart();

    const rowOf = (code: string) =>
      within(
        screen.getAllByRole("row").find((row) => row.textContent?.includes(code))!,
      );

    // A neraca account can never carry a line.
    expect(rowOf("1101").getByText("Tidak berlaku")).toBeInTheDocument();
    // A P&L account nobody has mapped — the one state with work attached.
    expect(rowOf("5000").getByText("Belum dipetakan")).toBeInTheDocument();
    // …and one that is mapped twice over, summarised rather than listed.
    expect(rowOf("5101").getByText("2 aturan")).toBeInTheDocument();
  });

  it("opens an account's Detil Akun from its row", async () => {
    await renderChart();

    expect(screen.queryByText("Gaji - Grooming")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("2 aturan"));

    expect(
      await screen.findByDisplayValue("Gaji - Grooming"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Gaji - Admin")).toBeInTheDocument();
  });

  /**
   * Retiring an account is the commonest edit anybody makes here, and it used to
   * need a page load, a form and a save.
   */
  /**
   * FROM THE KEBAB, NOT FROM THE BADGE. The badge was briefly the button — one
   * click, and the wrong one: a badge that acts cannot be told apart from a
   * badge that only reports, so reading down the Status column became something
   * you could do damage with.
   */
  it("retires an account from the row's action menu, not from its badge", async () => {
    await renderChart();
    const update = jest
      .spyOn(chartOfAccountsService, "update")
      .mockResolvedValue({} as never);

    const row = screen
      .getAllByRole("row")
      .find((candidate) => candidate.textContent?.includes("1101"))!;

    // The status reads, and does nothing else.
    expect(
      within(row).queryByRole("button", { name: "Aktif" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(row).getByRole("button", { name: "Aksi untuk 1101 Kas" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Nonaktifkan akun" }),
    );

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("1101", { isActive: false }),
    );
  });

  /**
   * THE TRAP THIS EXISTS TO STOP. Inactive accounts are hidden by default, so
   * deactivating from the row used to make that row vanish at the instant it was
   * pressed — carrying off the only way to undo it, with nothing on screen
   * saying the filter was why. An action must not hide its own undo.
   */
  it("keeps a just-deactivated account on screen so it can be reactivated", async () => {
    await renderChart();
    jest
      .spyOn(chartOfAccountsService, "update")
      .mockImplementation(async (id, patch) => {
        // The refetch after the toggle has to answer with the NEW state, or the
        // reactivate badge below would be the stale one.
        mockTree(
          chart().map((root) =>
            root.code === "1000"
              ? {
                  ...root,
                  children: root.children.map((child) =>
                    child.code === "1100"
                      ? {
                          ...child,
                          children: child.children.map((leaf) =>
                            leaf.code === id
                              ? { ...leaf, ...(patch as object) }
                              : leaf,
                          ),
                        }
                      : child,
                  ),
                }
              : root,
          ),
        );
        return {} as never;
      });

    const rowOf = (code: string) =>
      screen
        .getAllByRole("row")
        .find((candidate) => candidate.textContent?.includes(code))!;

    await userEvent.click(
      within(rowOf("1101")).getByRole("button", { name: "Aksi untuk 1101 Kas" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Nonaktifkan akun" }),
    );

    // Still there, now reading Nonaktif.
    await waitFor(() =>
      expect(within(rowOf("1101")).getByText("Nonaktif")).toBeInTheDocument(),
    );

    // The filter really was switched on, and the badge says so rather than the
    // list quietly widening. Asserted BEFORE the menu is reopened: an open Radix
    // menu aria-hides the rest of the page, so nothing outside it is findable.
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );

    // …and the same menu now offers the way back.
    await userEvent.click(
      within(rowOf("1101")).getByRole("button", { name: "Aksi untuk 1101 Kas" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Aktifkan akun" }),
    ).toBeInTheDocument();
  });

  it("narrows to one category from the panel, carrying each category's count", async () => {
    await renderChart();

    const panel = await openFilters();
    await userEvent.click(within(panel).getByLabelText("Filter kategori akun"));

    // The count the tile row used to show, now on the option itself — two
    // Hutang Dagang accounts in the fixture, 2000 and the 2101 under it.
    const option = screen.getByRole("option", { name: /Hutang Dagang/ });
    expect(option).toHaveTextContent("2");

    await userEvent.click(option);
    await applyFilters();

    expect(screen.queryByText("Kas")).not.toBeInTheDocument();
    expect(screen.getByText("Utang Usaha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
  });

  /**
   * ONE PANEL AT A TIME. Each holds an unsaved draft, so two open rows are two
   * drafts somebody can forget about — and the second Simpan would look like it
   * saved both.
   */
  it("closes the open Detil Akun when another row is opened", async () => {
    await renderChart();

    await userEvent.click(screen.getByText("2 aturan"));
    expect(await screen.findByDisplayValue("Gaji - Grooming")).toBeInTheDocument();

    await userEvent.click(screen.getAllByText("Belum dipetakan")[0]);

    await waitFor(() =>
      expect(screen.queryByDisplayValue("Gaji - Grooming")).not.toBeInTheDocument(),
    );
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

    // Named rather than "the only menuitem" — the menu holds two rows now, Edit
    // and the status change.
    expect(
      within(screen.getByRole("menu")).getByRole("menuitem", {
        name: "Edit akun",
      }),
    ).toHaveAttribute(
      "href",
      "/dashboard/pengaturan/daftar-akun/1101/edit",
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
   * THE CATEGORY'S OWN REFERENCE NUMBER, in front of its name — BO's chart,
   * matching Jubelio's.
   *
   * The number leads because somebody filing an account is usually reading a
   * chart on paper and scanning DOWN a column of numbers; it is also what makes
   * "Hutang Lainnya" and "Hutang Jangka Panjang" tellable apart at a glance.
   */
  it("numbers each category in the picker, number first", async () => {
    await renderCreateForm();

    await userEvent.click(
      screen.getByRole("combobox", { name: "Kategori akun" }),
    );

    expect(
      screen.getByRole("option", { name: "110 - Cash & Bank" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "550 - Harga Pokok Penjualan" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "880 - Biaya Lainnya" }),
    ).toBeInTheDocument();
  });

  /**
   * THE MAPPING IS NOT MADE HERE ANY MORE, and it is asserted as an absence
   * because that is what it is.
   *
   * There used to be one "Lini bisnis" select on this form, which could say
   * "everything landing in this account is grooming's" and nothing else. An
   * account now carries a LIST of Detil Akun, validated against each other and
   * against the tenant's lines — a second thing to get wrong while creating the
   * account itself — so it is edited in the list, inside the account's own row,
   * and a new P&L account is born "Belum Dipetakan".
   */
  it("offers no business-line control — the mapping moved to the list", async () => {
    await renderCreateForm();

    expect(
      screen.queryByRole("combobox", { name: "Lini bisnis" }),
    ).not.toBeInTheDocument();
  });

  /**
   * THE JENIS ONLY EXISTS FOR KAS & BANK. It is what decides BKM/BKK against
   * BBM/BBK, and no other category has a cash side to ask about.
   */
  it("asks kas or bank only for a Kas & Bank account", async () => {
    await renderCreateForm();

    expect(screen.queryByLabelText("Jenis")).not.toBeInTheDocument();

    await pickCategory("Cash & Bank");
    expect(await screen.findByLabelText("Jenis")).toBeInTheDocument();

    await pickCategory("Biaya");
    await waitFor(() =>
      expect(screen.queryByLabelText("Jenis")).not.toBeInTheDocument(),
    );
  });

  it("creates an account from what was typed, uppercasing the code", async () => {
    await renderCreateForm();
    const create = jest
      .spyOn(chartOfAccountsService, "create")
      .mockResolvedValue({} as never);

    await userEvent.type(screen.getByLabelText(/Kode akun/), "1102a");
    await userEvent.type(screen.getByLabelText(/Nama akun/), "Bank BCA");
    await pickCategory("Cash & Bank");
    await userEvent.click(screen.getByRole("button", { name: "Buat akun" }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        code: "1102A",
        name: "Bank BCA",
        // THE CATEGORY, AND NO CLASS. The server derives `accountType` from
        // this; sending one would be stripped, so it is not on the payload type
        // and must not be on the request.
        accountCategory: "cash_bank",
        // The jenis rides along for this category only, and defaults to Bank —
        // the server never guesses it from the name.
        cashType: "bank",
        parentAccountId: null,
      }),
    );
    // Back to the list once it lands — the page's job, where the dialog used to
    // just close itself.
    expect(push).toHaveBeenCalledWith("/dashboard/pengaturan/daftar-akun");
  });

  /**
   * THE CLASS IS NOT ON THE FORM ANY MORE — the change BO asked for, asserted
   * as an absence because that is what it is. Before this, a select labelled
   * "Tipe akun" offered five free choices and nothing refused a wrong one.
   */
  it("offers no control for the account type", async () => {
    await renderCreateForm();

    expect(
      screen.queryByRole("combobox", { name: "Tipe akun" }),
    ).not.toBeInTheDocument();
    // It is still READ on screen, so a mis-picked category is visible before
    // the account is saved rather than after a report comes out wrong.
    expect(
      screen.getByText(/Mengikuti kategori yang dipilih/),
    ).toBeInTheDocument();
  });

  it("shows the class and the normal balance the chosen category implies", async () => {
    await renderCreateForm();

    await pickCategory("Biaya Lainnya");

    expect(screen.getByText(/Beban · saldo normal Debit/)).toBeInTheDocument();
  });

  it("refuses to submit without a category, naming the field", async () => {
    await renderCreateForm();
    const create = jest.spyOn(chartOfAccountsService, "create");

    await userEvent.type(screen.getByLabelText(/Kode akun/), "1102");
    await userEvent.type(screen.getByLabelText(/Nama akun/), "Bank BCA");
    await userEvent.click(screen.getByRole("button", { name: "Buat akun" }));

    expect(
      await screen.findByText("Kategori akun wajib dipilih."),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("puts a taken code on the field, not in a banner", async () => {
    await renderCreateForm();
    jest
      .spyOn(chartOfAccountsService, "create")
      .mockRejectedValue(
        new ApiError("Account code '1101' already exists", 409),
      );

    await userEvent.type(screen.getByLabelText(/Kode akun/), "1101");
    await userEvent.type(screen.getByLabelText(/Nama akun/), "Kas Kecil");
    await pickCategory("Cash & Bank");
    await userEvent.click(screen.getByRole("button", { name: "Buat akun" }));

    expect(
      await screen.findByText(/sudah dipakai akun lain/),
    ).toBeInTheDocument();
    // And the user stays on the form, with what they typed still in it.
    expect(push).not.toHaveBeenCalled();
  });

  it("freezes the code and the category of a seeded account", async () => {
    await renderEditForm("1101");

    // The two fields every posting resolves against — the server answers 403.
    expect(screen.getByLabelText(/Kode akun/)).toBeDisabled();
    expect(screen.getByLabelText("Kategori akun")).toBeDisabled();
    // The name is still editable, because relabelling moves no money.
    expect(screen.getByLabelText(/Nama akun/)).toBeEnabled();
    expect(screen.getByText(/kodenya dipakai modul lain/)).toBeInTheDocument();
  });

  it("freezes only the category of an account that has sub-accounts", async () => {
    await renderEditForm("1100");

    expect(screen.getByLabelText(/Kode akun/)).toBeEnabled();
    expect(screen.getByLabelText("Kategori akun")).toBeDisabled();
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
    const options = screen
      .getAllByRole("option")
      .map((o) => o.textContent ?? "");

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
function line(accountId: string, debit: string, credit: string): JournalLine {
  return {
    accountId,
    businessLineId: null,
    // Null because the account carries no Detil Akun to pick from — which is
    // what every entry written before allocation existed looks like.
    allocationId: null,
    debit,
    credit,
    memo: null,
  };
}

/**
 * A balanced entry with the fields the two ledger screens read.
 *
 * Balanced by default because that is what the backend refuses a posting over —
 * an unbalanced fixture would be testing a state the API cannot produce.
 */
function entry(
  overrides: Partial<JournalEntry> & { _id: string },
): JournalEntry {
  return {
    entryNumber: `JE-2026-08-${overrides._id}`,
    date: "2026-08-07T00:00:00.000Z",
    description: "Penjualan POS",
    branchId: "b1",
    branchName: "Cabang Kemang",
    source: { type: "pos", id: null, reference: null, document: null },
    total: null,
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
  jest.spyOn(branchService, "list").mockResolvedValue({
    items: [{ _id: "b1", name: "Cabang Kemang" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
  jest.spyOn(businessLineService, "list").mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  } as never);
  jest
    .spyOn(chartOfAccountsService, "tree")
    .mockResolvedValue([
      node("1101", "Kas", "cash_bank"),
      node("4101", "Pendapatan Penjualan", "pendapatan"),
    ]);
}

/** The server's clock, as the page passes it — the period pills are dates. */
const NOW = "2026-08-20T03:00:00.000Z";

describe("JournalEntriesScreen", () => {
  afterEach(() => jest.restoreAllMocks());

  /** Mounts the ledger over one page of entries and waits for it to land. */
  async function renderLedger(
    items: JournalEntry[],
    auth?: Parameters<typeof renderWithAuth>[1],
  ) {
    mockLedgerLookups();
    const list = jest
      .spyOn(journalEntryService, "list")
      .mockResolvedValue(ledgerPage(items));

    renderWithAuth(<JournalEntriesScreen now={NOW} />, auth);
    await waitFor(() => expect(list).toHaveBeenCalled());

    return list;
  }

  /**
   * The ledger's ONE writable action, in the page head where the mockup puts
   * it, named for what it makes. Asserted as a LINK: a button that reads right
   * and goes nowhere is the state this once was.
   */
  it("offers Tambah jurnal manual, gated on create", async () => {
    await renderLedger([entry({ _id: "1" })]);

    expect(
      await screen.findByRole("link", { name: /Tambah jurnal manual/ }),
    ).toHaveAttribute("href", "/dashboard/keuangan/journal-entries/new");
  });

  /** Paging the ledger is not the same privilege as adding to it. */
  it("hides the new-entry action from a read-only role", async () => {
    await renderLedger([entry({ _id: "1" })], {
      isSuperAdmin: false,
      permissions: [{ feature: "journalEntries", actions: ["read"] }],
    });
    await screen.findByText("Penjualan POS");

    expect(
      screen.queryByRole("link", { name: /Tambah jurnal manual/ }),
    ).not.toBeInTheDocument();
  });

  /**
   * The mockup's list: no month group headers and no total tiles. Their
   * subtotals could only ever cover the page they were on.
   */
  it("lists entries flat, without month headers or total tiles", async () => {
    await renderLedger([
      entry({ _id: "1", date: "2026-08-07T00:00:00.000Z" }),
      entry({ _id: "2", date: "2026-07-30T00:00:00.000Z" }),
    ]);

    expect(await screen.findAllByText("Penjualan POS")).toHaveLength(2);
    expect(screen.queryByText("Agustus 2026")).not.toBeInTheDocument();
    expect(screen.queryByText("Total debit")).not.toBeInTheDocument();
    expect(journalEntryService.totals).not.toHaveBeenCalled();
  });

  /**
   * The filter goes to the SERVER. Narrowing a page in the browser would
   * answer "manual entries" with "the manual entries that were on page 1".
   */
  it("asks the server for the source the panel picked", async () => {
    const list = await renderLedger([entry({ _id: "1" })]);
    await screen.findByText("Penjualan POS");

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await userEvent.click(within(panel).getByLabelText("Filter sumber entri"));
    await userEvent.click(
      screen.getByRole("option", { name: "Jurnal manual" }),
    );

    // A panel's fields wait for Terapkan — picking one sends nothing yet.
    expect(list).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sourceType: "manual", page: 1 }),
      ),
    );
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
  });

  /** Urutkan left the panel for the column headers (mockup). */
  it("no longer offers Urutkan in the filter panel", async () => {
    await renderLedger([entry({ _id: "1" })]);
    await screen.findByText("Penjualan POS");

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");

    expect(within(panel).queryByLabelText("Urutkan")).not.toBeInTheDocument();
  });

  /**
   * The headers order the list ON THE SERVER — reordering the rows that
   * arrived would sort one page and call it the list. Nilai takes the largest
   * first, and a second click flips it.
   */
  it("orders from the column headers, largest amount first", async () => {
    const list = await renderLedger([entry({ _id: "1" })]);
    await screen.findByText("Penjualan POS");

    // Every list starts ordered — the default is sent, not left implicit.
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "newest" }),
    );

    await userEvent.click(screen.getByRole("button", { name: /^Nilai/ }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "totalDesc", page: 1 }),
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: /^Nilai/ }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "totalAsc" }),
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: /^Cabang/ }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "branchAsc" }),
      ),
    );
  });

  /**
   * Sumber shows a label while the server could only sort by the code behind
   * it, so its header does not invite the click.
   */
  it("does not make Sumber sortable", async () => {
    await renderLedger([entry({ _id: "1" })]);
    await screen.findByText("Penjualan POS");

    expect(
      screen.queryByRole("button", { name: /^Sumber/ }),
    ).not.toBeInTheDocument();
    // Its neighbours are buttons — the header row is sortable, just not here.
    expect(
      screen.getByRole("button", { name: /^Cabang/ }),
    ).toBeInTheDocument();
  });

  /** Cabang lives on the module's context bar now, not in the panel. */
  it("narrows to a branch from the context bar", async () => {
    const list = await renderLedger([entry({ _id: "1" })]);
    await screen.findByText("Penjualan POS");

    await userEvent.click(screen.getByLabelText("Filter cabang"));
    await userEvent.click(
      screen.getByRole("option", { name: "Cabang Kemang" }),
    );

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ branchId: "b1", page: 1 }),
      ),
    );
  });

  /** The footer's page size is Kas & Bank's, and it starts at 25. */
  it("asks for a page of 25 by default", async () => {
    const list = await renderLedger([entry({ _id: "1" })]);

    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 25 }),
    );
  });

  /**
   * Nilai prints the stored total when there is one — it is what the column
   * sorts by — and the lines' own sum for an entry the backfill has not
   * reached.
   */
  it("prints the stored total, falling back to the lines", async () => {
    await renderLedger([
      entry({ _id: "1", total: "275000.0000" }),
      entry({ _id: "2", description: "Belum di-backfill" }),
    ]);

    expect(await screen.findByText("Rp 275.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 150.000")).toBeInTheDocument();
  });

  /** The whole row opens the entry, as the mockup's does. */
  it("opens the entry from its row", async () => {
    await renderLedger([entry({ _id: "1" })]);

    await userEvent.click(await screen.findByText("Penjualan POS"));

    expect(push).toHaveBeenCalledWith("/dashboard/keuangan/journal-entries/1");
  });

  it("distinguishes an empty book from an empty filter", async () => {
    const list = await renderLedger([]);

    expect(
      await screen.findByText("Belum ada entri jurnal."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await userEvent.click(within(panel).getByLabelText("Filter sumber entri"));
    await userEvent.click(
      screen.getByRole("option", { name: "Jurnal manual" }),
    );
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

    renderWithAuth(<JournalEntriesScreen now={NOW} />);
    await screen.findByText("Server sedang sibuk");

    await userEvent.click(screen.getByRole("button", { name: /Coba lagi/ }));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Penjualan POS")).toBeInTheDocument();
    expect(screen.queryByText("Server sedang sibuk")).not.toBeInTheDocument();
  });

  /**
   * The Status column stays though the mockup has none: "dibalik" is the row's
   * most important word — its amounts reach no report.
   */
  it("marks a reversed entry before anyone reads its amount", async () => {
    await renderLedger([entry({ _id: "1", reversedByEntryId: "2" })]);

    expect(await screen.findByText("dibalik")).toBeInTheDocument();
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

  /** The mockup's head: the number in the title, and the way back. */
  it("names the entry in its heading, with the way back to the list", async () => {
    mockBook([entry({ _id: "1" })]);
    renderWithAuth(<JournalEntryDetail entryId="1" />);

    expect(
      await screen.findByRole("heading", { name: "Jurnal — JE-2026-08-1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Kembali ke Jurnal/ }),
    ).toHaveAttribute("href", "/dashboard/keuangan/journal-entries");
  });

  /**
   * The source document opens from the entry — by the DOCUMENT's id, which for
   * a cash transaction is not `source.id`.
   */
  it("links the source document it came from", async () => {
    mockBook([
      entry({
        _id: "1",
        source: {
          type: "expense",
          id: "ref-1",
          reference: "BKK/PST/2609/0001",
          document: { kind: "cash_transaction", id: "tx-1" },
        },
      }),
    ]);
    renderWithAuth(<JournalEntryDetail entryId="1" />);

    expect(
      await screen.findByRole("link", { name: /Buka BKK\/PST\/2609\/0001/ }),
    ).toHaveAttribute("href", "/dashboard/keuangan/kas-bank/transaksi/tx-1");
  });

  it("says a manual entry has no source document", async () => {
    mockBook([
      entry({
        _id: "1",
        source: { type: "manual", id: null, reference: null, document: null },
      }),
    ]);
    renderWithAuth(<JournalEntryDetail entryId="1" />);

    expect(
      await screen.findByText("Tidak ada dokumen sumber"),
    ).toBeInTheDocument();
  });

  /** A document with no page of its own gets a sentence, not a dead link. */
  it("draws no link for a document that has no page", async () => {
    mockBook([
      entry({
        _id: "1",
        source: {
          type: "return",
          id: "rtn-1",
          reference: "RTN-001",
          document: { kind: "pos_return", id: "rtn-1" },
        },
      }),
    ]);
    renderWithAuth(<JournalEntryDetail entryId="1" />);

    expect(
      await screen.findByText(/belum punya halaman/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Buka RTN-001/ }),
    ).not.toBeInTheDocument();
  });

  /** Σdebit === Σcredit is what makes a row a journal entry. */
  it("checks the balance against the lines the API sent", async () => {
    mockBook([entry({ _id: "1" })]);
    renderWithAuth(<JournalEntryDetail entryId="1" />);

    expect(await screen.findByText("✓ seimbang")).toBeInTheDocument();
  });

  /**
   * The credit column carries the credit. The API writes an unused side as
   * `"0.0000"`, and a `!== "0"` check once put every credit in the debit column.
   */
  it("prints a credit as a credit rather than as a zero debit", async () => {
    mockBook([entry({ _id: "1" })]);
    renderWithAuth(<JournalEntryDetail entryId="1" />);

    const creditRow = (await screen.findByText("Pendapatan Penjualan")).closest(
      "tr",
    )!;
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

    const banner = (await screen.findByText(/Entri ini sudah dibalik/)).closest(
      "div",
    )!;

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

describe("JournalEntryCreateForm", () => {
  afterEach(() => jest.restoreAllMocks());

  /**
   * A chart with the two accounts the stock-awal correction moves value
   * between, one retired account and one Kas & Bank account — the picker must
   * offer neither of the last two.
   */
  function ledgerChart(): ChartOfAccountNode[] {
    return [
      node("1000", "Aset", "persediaan", {
        children: [node("1201", "Persediaan Barang", "persediaan")],
      }),
      node("1100", "Kas & Bank", "cash_bank", {
        children: [node("1101", "Kas", "cash_bank")],
      }),
      node("3000", "Ekuitas", "modal", {
        children: [node("3101", "Modal Disetor", "modal")],
      }),
      node("5000", "Beban", "biaya_lainnya", {
        children: [
          node("5201", "Kerugian Persediaan", "biaya_lainnya"),
          node("5401", "Beban Penyusutan", "biaya_lainnya", { isActive: false }),
        ],
      }),
    ];
  }

  const BRANCHES = [
    { _id: "b1", name: "Cabang Kemang" },
    { _id: "b2", name: "Cabang Bogor" },
  ];

  async function renderForm(roots: ChartOfAccountNode[] = ledgerChart()) {
    mockTree(roots);
    jest.spyOn(branchService, "list").mockResolvedValue({
      items: BRANCHES,
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    } as never);
    renderWithAuth(<JournalEntryCreateForm />);
    await screen.findByLabelText(/^Keterangan/, { selector: "textarea" });
    // The session's branch is picked once the branch list lands.
    await waitFor(() =>
      expect(screen.getByLabelText("Cabang")).toHaveTextContent(
        "Cabang Kemang",
      ),
    );
  }

  const description = () =>
    screen.getByLabelText(/^Keterangan/, { selector: "textarea" });
  const debits = () => screen.getAllByLabelText(/^Debit baris/);
  const credits = () => screen.getAllByLabelText(/^Kredit baris/);

  /** Picks an account on one line through the searchable popover. */
  async function pickAccount(line: number, label: RegExp) {
    await userEvent.click(screen.getByLabelText(`Akun baris ${line}`));
    await userEvent.click(await screen.findByRole("option", { name: label }));
  }

  /** Fills a balanced two-line correction, ready to save. */
  async function fillBalanced(amount = "1000") {
    await userEvent.type(description(), "Koreksi");
    await pickAccount(1, /5201 · Kerugian Persediaan/);
    await pickAccount(2, /3101 · Modal/);
    await userEvent.type(debits()[0], amount);
    await userEvent.type(credits()[1], amount);
  }

  /**
   * NON-CASH ONLY (21 September 2026). Money that moves is a Tambah transaksi
   * with a bukti kas number; the server refuses Kas & Bank on a manual entry,
   * and the picker never offers it, so nobody types an entry that cannot post.
   */
  it("does not offer Kas & Bank accounts", async () => {
    await renderForm();

    await userEvent.click(screen.getByLabelText("Akun baris 1"));

    expect(
      await screen.findByRole("option", { name: /5201 · Kerugian Persediaan/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /1101 · Kas/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Untuk penyesuaian non-kas saja/)).toBeInTheDocument();
  });

  /** The picker groups accounts under their category, as the mockup does. */
  it("groups the accounts by category", async () => {
    await renderForm();

    await userEvent.click(screen.getByLabelText("Akun baris 1"));

    const group = await screen.findByRole("group", { name: "Modal" });
    expect(
      within(group).getByRole("option", { name: /3101 · Modal Disetor/ }),
    ).toBeInTheDocument();
  });

  /**
   * The branch is asked for now, starting where the session stands, and it is
   * SENT — the server no longer has to guess it from the session.
   */
  it("sends the branch picked in the form", async () => {
    await renderForm();
    const create = jest
      .spyOn(journalEntryService, "create")
      .mockResolvedValue({ _id: "je1", entryNumber: "JE-1" } as never);

    await userEvent.click(screen.getByLabelText("Cabang"));
    await userEvent.click(
      screen.getByRole("option", { name: "Cabang Bogor" }),
    );
    await fillBalanced();
    await userEvent.click(screen.getByRole("button", { name: /Simpan jurnal/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: "b2" }),
      ),
    );
  });

  /**
   * A MANUAL ENTRY CAN NAME A DETIL AKUN, and the field appears only where the
   * account has rules — an empty control on every line is one people skip.
   */
  it("offers the Detil Akun only on an account that has one, and sends it", async () => {
    const mapped = ledgerChart();
    mapped[3].children[0] = node(
      "5201",
      "Kerugian Persediaan",
      "biaya_lainnya",
      {
        allocations: [
          {
            _id: "alloc-susut",
            name: "Susut - Grooming",
            allocationType: "direct",
            businessLineId: "bl-grooming",
            branchId: null,
            isActive: true,
          },
          {
            _id: "alloc-retired",
            name: "Susut - lama",
            allocationType: "shared_overall",
            businessLineId: null,
            branchId: null,
            isActive: false,
          },
        ],
      },
    );

    await renderForm(mapped);
    const create = jest
      .spyOn(journalEntryService, "create")
      .mockResolvedValue({ _id: "je1", entryNumber: "JE-1" } as never);

    // Nothing picked yet, so there is no account to have rules.
    expect(screen.queryByLabelText("Detil akun baris 1")).not.toBeInTheDocument();

    await pickAccount(1, /5201 · Kerugian Persediaan/);

    // One ACTIVE rule, so it is pre-picked, and the retired one is not offered.
    const detil = await screen.findByLabelText("Detil akun baris 1");
    expect(detil).toHaveTextContent("Susut - Grooming");
    await userEvent.click(detil);
    expect(
      screen.queryByRole("option", { name: "Susut - lama" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    // The second line's account has no rules, so it gets no field.
    await pickAccount(2, /3101 · Modal/);
    expect(screen.queryByLabelText("Detil akun baris 2")).not.toBeInTheDocument();

    await userEvent.type(description(), "Koreksi");
    await userEvent.type(debits()[0], "100000");
    await userEvent.type(credits()[1], "100000");
    await userEvent.click(screen.getByRole("button", { name: /Simpan jurnal/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({
              accountId: "5201",
              allocationId: "alloc-susut",
            }),
          ]),
        }),
      ),
    );
    expect(create.mock.calls[0][0].lines[1]).not.toHaveProperty("allocationId");
  });

  /** An inactive account is refused by code AFTER the whole entry was typed. */
  it("does not offer accounts that have been retired", async () => {
    await renderForm();

    await userEvent.click(screen.getByLabelText("Akun baris 1"));

    expect(
      await screen.findByRole("option", { name: /5201 · Kerugian Persediaan/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /5401 · Beban Penyusutan/ }),
    ).not.toBeInTheDocument();
  });

  /** ONE SIDE PER LINE, enforced by the fields rather than an error message. */
  it("clears the credit when a debit is typed on the same line", async () => {
    await renderForm();

    const credit = credits()[0];
    await userEvent.type(credit, "50000");
    expect(credit).toHaveValue("50000");

    await userEvent.type(debits()[0], "70000");
    expect(credit).toHaveValue("");
  });

  /**
   * Σdebit === Σcredit is the invariant the server refuses on. The button reads
   * the same result, and the note under the totals says by how much.
   */
  it("refuses to submit while the two sides disagree", async () => {
    await renderForm();
    const create = jest.spyOn(journalEntryService, "create");

    await userEvent.type(description(), "Koreksi");
    await pickAccount(1, /5201 · Kerugian Persediaan/);
    await pickAccount(2, /3101 · Modal/);
    await userEvent.type(debits()[0], "100000");
    await userEvent.type(credits()[1], "60000");

    expect(
      screen.getByRole("button", { name: /Simpan jurnal/ }),
    ).toBeDisabled();
    expect(screen.getByText("Belum seimbang")).toBeInTheDocument();
    expect(screen.getByText(/Selisih Rp 40\.000/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("says so once the two sides meet", async () => {
    await renderForm();
    await fillBalanced("250000");

    expect(screen.getByText("✓ Seimbang")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Simpan jurnal/ }),
    ).toBeEnabled();
  });

  /**
   * ONLY THE SIDE THAT CARRIES A VALUE IS SENT. Both keys default to "0" on the
   * server, so a credit-only line omits `debit` entirely.
   */
  it("sends each line with only the side it carries", async () => {
    await renderForm();
    const create = jest
      .spyOn(journalEntryService, "create")
      .mockResolvedValue({ _id: "je-1", entryNumber: "JE-1" } as never);

    await fillBalanced("5000000");
    await userEvent.click(
      screen.getByRole("button", { name: /Simpan jurnal/ }),
    );

    await waitFor(() => expect(create).toHaveBeenCalled());
    const sent = create.mock.calls[0][0];
    expect(sent.lines).toEqual([
      expect.objectContaining({ debit: "5000000" }),
      expect.objectContaining({ credit: "5000000" }),
    ]);
    expect(sent.lines[0]).not.toHaveProperty("credit");
    expect(sent.lines[1]).not.toHaveProperty("debit");
    expect(push).toHaveBeenCalledWith("/dashboard/keuangan/journal-entries/je-1");
  });

  /**
   * The shortcut supplies the ACCOUNTS AND THE DIRECTION and deliberately no
   * amounts: only the tenant knows what its opening stock was worth.
   */
  it("prefills the stok-awal correction without inventing an amount", async () => {
    await renderForm();

    await userEvent.click(
      screen.getByRole("button", { name: /Isi contohnya/ }),
    );

    expect(screen.getByLabelText("Akun baris 1")).toHaveTextContent(
      /Kerugian Persediaan/,
    );
    expect(screen.getByLabelText("Akun baris 2")).toHaveTextContent(/Modal/);
    for (const input of [...debits(), ...credits()]) {
      expect(input).toHaveValue("");
    }
  });

  /** The hint sits on the field being typed into, not in a note above the row. */
  it("says which column each prefilled line is waiting for", async () => {
    await renderForm();
    await userEvent.click(
      screen.getByRole("button", { name: /Isi contohnya/ }),
    );

    // Line 1 (5201) takes the debit; line 2 (3101) takes the credit.
    expect(debits()[0]).toHaveAccessibleDescription(/Isi di sini/);
    expect(credits()[1]).toHaveAccessibleDescription(/Isi di sini/);
    expect(credits()[0]).not.toHaveAccessibleDescription(/Isi di sini/);
    expect(debits()[1]).not.toHaveAccessibleDescription(/Isi di sini/);
  });

  /** Scaffolding, not a fact about the entry: it goes once the line is filled. */
  it("drops the column hint once that line carries an amount", async () => {
    await renderForm();
    await userEvent.click(
      screen.getByRole("button", { name: /Isi contohnya/ }),
    );

    expect(debits()[0]).toHaveAccessibleDescription(/Isi di sini/);

    await userEvent.type(debits()[0], "5000000");
    expect(debits()[0]).not.toHaveAccessibleDescription(/Isi di sini/);
  });

  /** THE MEMO IS LEDGER TEXT, read months later — never form instructions. */
  it("keeps the prefilled memos free of form instructions", async () => {
    await renderForm();
    await userEvent.click(
      screen.getByRole("button", { name: /Isi contohnya/ }),
    );

    const memos = screen
      .getAllByLabelText(/^Keterangan baris/)
      .map((field) => (field as HTMLInputElement).value);

    for (const memo of memos) {
      expect(memo).not.toMatch(/kolom|isi di/i);
    }
    expect(memos[0]).toBe(
      "Membatalkan kredit yang salah di Kerugian Persediaan",
    );
    expect(memos[1]).toBe("Pengakuan stok awal sebagai modal pemilik");
  });

  /** Posted a month late, the correction moves the mistake instead of undoing it. */
  it("warns about the date and where the amount comes from", async () => {
    await renderForm();

    expect(
      screen.queryByText(/Dua hal sebelum menyimpan/),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Isi contohnya/ }),
    );

    expect(screen.getByText(/Dua hal sebelum menyimpan/)).toBeInTheDocument();
    expect(screen.getByText(/Stock adjustment/)).toBeInTheDocument();
    expect(screen.getByText(/samakan dengan penyesuaian/)).toBeInTheDocument();
  });

  /** A tenant whose chart lacks either account is not offered the shortcut. */
  it("hides the shortcut when the chart has no 3101", async () => {
    await renderForm([
      node("5000", "Beban", "biaya_lainnya", {
        children: [node("5201", "Kerugian Persediaan", "biaya_lainnya")],
      }),
    ]);

    expect(
      screen.queryByRole("button", { name: /Isi contohnya/ }),
    ).not.toBeInTheDocument();
  });

  /** The server's refusals name what to fix, so they are shown verbatim. */
  it("shows the server's refusal as written", async () => {
    await renderForm();
    jest
      .spyOn(journalEntryService, "create")
      .mockRejectedValue(
        new ApiError(
          "Manual journal entries cannot post to Kas & Bank accounts (1101); record the movement as a cash transaction instead",
          400,
        ),
      );

    await fillBalanced();
    await userEvent.click(
      screen.getByRole("button", { name: /Simpan jurnal/ }),
    );

    expect(
      await screen.findByText(/cannot post to Kas & Bank accounts \(1101\)/),
    ).toBeInTheDocument();
  });
});
