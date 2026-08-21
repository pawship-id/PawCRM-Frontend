import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { StockEntriesScreen } from "@/features/inventory";
import { excerptAround } from "@/features/inventory/utils/excerpt";
import { stockEntryService } from "@/services/stockEntry.service";
import { branchService } from "@/services/branch.service";
import { warehouseService } from "@/services/warehouse.service";
import type { Branch, PageResult, Warehouse } from "@/types/api";
import type { StockEntry } from "@/types/inventory";

/**
 * The hand-typed stock document list, against mocked services.
 *
 * WHAT THIS IS FOR. The two filters live behind a `Filter (n)` button now, and
 * the failure that put them there is one a panel can reproduce: a select whose
 * trigger merely SAYS "Semua cabang" while its list holds no such row cannot be
 * undone once a branch is picked. So the test picks one and looks for the way
 * back.
 */
const BRANCHES: Branch[] = [
  { _id: "b1", name: "Cabang Timur" } as Branch,
  { _id: "b2", name: "Cabang Barat" } as Branch,
];

/**
 * One per branch plus a shared central one — the shape the scoping rule is
 * about. `defaultBranchId: null` is the central warehouse: it belongs to no
 * branch and serves all of them.
 */
const WAREHOUSES: Warehouse[] = [
  { _id: "w1", name: "Gudang Timur", defaultBranchId: "b1" } as Warehouse,
  { _id: "w2", name: "Gudang Barat", defaultBranchId: "b2" } as Warehouse,
  { _id: "w3", name: "Gudang Pusat", defaultBranchId: null } as Warehouse,
];

function page(items: StockEntry[] = []): PageResult<StockEntry> {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(stockEntryService, "list").mockResolvedValue(page());
  jest.spyOn(branchService, "list").mockResolvedValue({
    items: BRANCHES,
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
  jest.spyOn(warehouseService, "list").mockResolvedValue({
    items: WAREHOUSES,
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
});

/** One row, as the server answers it. */
function entry(overrides: Partial<StockEntry> = {}): StockEntry {
  return {
    _id: "se1",
    kind: "adjustment",
    entryNumber: "ADJ-2026-0006",
    entryDate: "2026-08-20T00:00:00.000Z",
    branchId: { _id: "b1", name: "Cabang Timur" },
    warehouseId: { _id: "w1", name: "Gudang Timur" },
    notes: "Barang rusak kena air",
    lineCount: 3,
    // More movements than lines: FEFO drew one of them off several lots. The
    // list no longer shows this — it only means something beside the lines it is
    // compared against, and those are on the detail.
    movementIds: ["mv1", "mv2", "mv3", "mv4"],
    journalEntryId: null,
    createdBy: { _id: "u1", name: "Rina" },
    createdAt: "",
    updatedAt: "",
    ...overrides,
  } as StockEntry;
}

/**
 * WHAT THE ROW CARRIES. Six columns, and the two that are gone were removed on
 * purpose: a reason truncated to fit a cell is a sentence nobody can act on, and
 * the movement count only means something next to the lines it is compared
 * against — both live on the detail.
 */
it("counts products and offers one way in", async () => {
  jest.spyOn(stockEntryService, "list").mockResolvedValue(page([entry()]));

  renderWithAuth(<StockEntriesScreen kind="adjustment" />);

  const row = (await screen.findByText("ADJ-2026-0006")).closest("tr");
  expect(within(row!).getByText("3")).toBeInTheDocument();
  expect(within(row!).getByRole("link", { name: "Detail" })).toHaveAttribute(
    "href",
    "/dashboard/inventory/adjustments/se1",
  );
});

it("carries the reason, and leaves the author and movement count off", async () => {
  jest.spyOn(stockEntryService, "list").mockResolvedValue(page([entry()]));

  renderWithAuth(<StockEntriesScreen kind="adjustment" />);

  const row = (await screen.findByText("ADJ-2026-0006")).closest("tr");
  expect(within(row!).getByText(/Barang rusak/)).toBeInTheDocument();
  expect(within(row!).queryByText("Rina")).not.toBeInTheDocument();
  expect(within(row!).queryByText("4")).not.toBeInTheDocument();
});

/** Each kind reads its own route, so the way in must follow the screen. */
it("points the opening-stock row at its own detail", async () => {
  jest
    .spyOn(stockEntryService, "list")
    .mockResolvedValue(
      page([entry({ kind: "opening_balance", entryNumber: "OPB-2026-0001" })]),
    );

  renderWithAuth(<StockEntriesScreen kind="opening_balance" />);

  const row = (await screen.findByText("OPB-2026-0001")).closest("tr");
  expect(within(row!).getByRole("link", { name: "Detail" })).toHaveAttribute(
    "href",
    "/dashboard/inventory/opening-stock/se1",
  );
});

/**
 * THE MATCH, MARKED — the number is the only searched field still on screen, so
 * it is where a reader confirms the row in front of them is the one their term
 * found.
 */
it("marks the part of the number the search matched", async () => {
  const user = userEvent.setup();
  jest.spyOn(stockEntryService, "list").mockResolvedValue(page([entry()]));

  renderWithAuth(<StockEntriesScreen kind="adjustment" />);
  await screen.findByText("ADJ-2026-0006");

  await user.type(screen.getByLabelText("Cari dokumen"), "0006");

  const marked = await screen.findByText("0006");
  expect(marked.tagName).toBe("MARK");
});

/**
 * SORTING IS A FIELD IN THE PANEL, not a control of its own — and it leads the
 * stack, because it is the one field always set and the only one that changes
 * what the top of the list is rather than what is in it.
 */
it("asks the server for the ordering the panel picked", async () => {
  const user = await openPanel();

  await user.click(screen.getByLabelText("Urutkan"));
  await user.click(await screen.findByRole("option", { name: "Nomor A–Z" }));
  await user.click(screen.getByRole("button", { name: "Terapkan" }));

  await waitFor(() =>
    expect(stockEntryService.list).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "numberAsc" }),
    ),
  );
});

/**
 * NOT COUNTED IN THE BADGE. Every list has an ordering, so counting it would put
 * a standing number over an unnarrowed list and teach people to ignore the badge
 * — the one thing that makes a collapsed filter safe.
 */
it("leaves the ordering out of the filter count", async () => {
  const user = await openPanel();

  await user.click(screen.getByLabelText("Urutkan"));
  await user.click(await screen.findByRole("option", { name: "Terlama" }));
  await user.click(screen.getByRole("button", { name: "Terapkan" }));

  expect(
    await screen.findByRole("button", { name: "Filter" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Filter \(/ }),
  ).not.toBeInTheDocument();
});

/**
 * THE CUT FOLLOWS THE MATCH.
 *
 * The server searches the reason as well as the number, so a term matching deep
 * in a long sentence must not come back as a row whose reason cell shows the
 * opening words and no mark in them — a result with nothing on it to explain why
 * it is a result.
 */
describe("excerptAround", () => {
  const LONG =
    "Barang rusak kena air saat hujan deras bulan lalu, ditemukan waktu " +
    "beres-beres gudang belakang, sebagian kemasannya sobek";

  it("leaves a short reason alone", () => {
    expect(excerptAround("Barang rusak", "rusak")).toBe("Barang rusak");
  });

  it("cuts from the start when nothing matched", () => {
    const cut = excerptAround(LONG, "");

    expect(cut.startsWith("Barang rusak")).toBe(true);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThan(LONG.length);
  });

  /** The whole point: a match past the cut still arrives on screen. */
  it("windows around a match the opening words would have hidden", () => {
    const cut = excerptAround(LONG, "sobek");

    expect(cut).toContain("sobek");
    expect(cut.startsWith("…")).toBe(true);
  });

  /** A leading ellipsis means "there is more before this", so it must be earned. */
  it("adds no leading ellipsis for a match at the start", () => {
    const cut = excerptAround(LONG, "Barang");

    expect(cut.startsWith("…")).toBe(false);
    expect(cut.endsWith("…")).toBe(true);
  });

  it("matches without regard to case", () => {
    expect(excerptAround(LONG, "SOBEK")).toContain("sobek");
  });
});

/**
 * The cut and the mark have to agree: cut first, mark second, so the mark is
 * always inside what is shown.
 */
it("marks the reason it cut around", async () => {
  const user = userEvent.setup();
  jest.spyOn(stockEntryService, "list").mockResolvedValue(
    page([
      entry({
        notes:
          "Barang rusak kena air saat hujan deras bulan lalu, ditemukan waktu beres-beres gudang belakang, sebagian kemasannya sobek",
      }),
    ]),
  );

  renderWithAuth(<StockEntriesScreen kind="adjustment" />);
  await screen.findByText("ADJ-2026-0006");

  await user.type(screen.getByLabelText("Cari dokumen"), "sobek");

  const marked = await screen.findByText("sobek");
  expect(marked.tagName).toBe("MARK");
});

async function openPanel() {
  const user = userEvent.setup();
  renderWithAuth(<StockEntriesScreen kind="opening_balance" />);
  await waitFor(() => expect(branchService.list).toHaveBeenCalled());
  await user.click(screen.getByRole("button", { name: "Filter" }));
  return user;
}

it("keeps 'Semua cabang' on offer after a branch has been picked", async () => {
  const user = await openPanel();

  await user.click(screen.getByRole("button", { name: "Filter cabang" }));
  await user.click(screen.getByRole("option", { name: "Cabang Timur" }));

  // Re-opened: the row that clears the filter is still in the list, so the
  // choice is reversible without reaching for Reset.
  await user.click(screen.getByRole("button", { name: "Filter cabang" }));
  const list = screen.getByRole("listbox");
  expect(
    within(list).getByRole("option", { name: "Semua cabang" }),
  ).toBeInTheDocument();
});

it("keeps 'Semua gudang' on offer after a warehouse has been picked", async () => {
  const user = await openPanel();

  await user.click(screen.getByRole("button", { name: "Filter gudang" }));
  await user.click(screen.getByRole("option", { name: "Gudang Pusat" }));

  await user.click(screen.getByRole("button", { name: "Filter gudang" }));
  const list = screen.getByRole("listbox");
  expect(
    within(list).getByRole("option", { name: "Semua gudang" }),
  ).toBeInTheDocument();
});

it("clears the filter through that row, and the trigger says so again", async () => {
  const user = await openPanel();

  await user.click(screen.getByRole("button", { name: "Filter cabang" }));
  await user.click(screen.getByRole("option", { name: "Cabang Timur" }));
  await user.click(screen.getByRole("button", { name: "Filter cabang" }));
  await user.click(screen.getByRole("option", { name: "Semua cabang" }));

  expect(
    screen.getByRole("button", { name: "Filter cabang" }),
  ).toHaveTextContent("Semua cabang");
});

it("narrows the warehouse list to the chosen branch, keeping the shared one", async () => {
  const user = await openPanel();

  await user.click(screen.getByRole("button", { name: "Filter cabang" }));
  await user.click(screen.getByRole("option", { name: "Cabang Timur" }));

  await user.click(screen.getByRole("button", { name: "Filter gudang" }));
  const list = screen.getByRole("listbox");

  expect(
    within(list).getByRole("option", { name: "Gudang Timur" }),
  ).toBeInTheDocument();
  // The central warehouse serves every branch, so it survives the narrowing.
  expect(
    within(list).getByRole("option", { name: "Gudang Pusat" }),
  ).toBeInTheDocument();
  // Pinned to the other branch: that pair describes no document.
  expect(
    within(list).queryByRole("option", { name: "Gudang Barat" }),
  ).toBeNull();
  expect(
    within(list).getByRole("option", { name: "Semua gudang" }),
  ).toBeInTheDocument();
});

it("shows every warehouse again under 'Semua cabang'", async () => {
  const user = await openPanel();

  await user.click(screen.getByRole("button", { name: "Filter cabang" }));
  await user.click(screen.getByRole("option", { name: "Cabang Timur" }));
  await user.click(screen.getByRole("button", { name: "Filter cabang" }));
  await user.click(screen.getByRole("option", { name: "Semua cabang" }));

  await user.click(screen.getByRole("button", { name: "Filter gudang" }));
  const list = screen.getByRole("listbox");

  expect(
    within(list).getByRole("option", { name: "Gudang Barat" }),
  ).toBeInTheDocument();
});

it("drops a warehouse the new branch cannot have posted at", async () => {
  const user = await openPanel();

  await user.click(screen.getByRole("button", { name: "Filter gudang" }));
  await user.click(screen.getByRole("option", { name: "Gudang Barat" }));

  await user.click(screen.getByRole("button", { name: "Filter cabang" }));
  await user.click(screen.getByRole("option", { name: "Cabang Timur" }));

  // Cleared rather than left showing a value the picker no longer offers.
  expect(
    screen.getByRole("button", { name: "Filter gudang" }),
  ).toHaveTextContent("Semua gudang");
});

it("keeps the shared warehouse when the branch changes under it", async () => {
  const user = await openPanel();

  await user.click(screen.getByRole("button", { name: "Filter gudang" }));
  await user.click(screen.getByRole("option", { name: "Gudang Pusat" }));

  await user.click(screen.getByRole("button", { name: "Filter cabang" }));
  await user.click(screen.getByRole("option", { name: "Cabang Timur" }));

  expect(
    screen.getByRole("button", { name: "Filter gudang" }),
  ).toHaveTextContent("Gudang Pusat");
});

it("fills the branch in from a warehouse that has only one", async () => {
  const user = await openPanel();

  await user.click(screen.getByRole("button", { name: "Filter gudang" }));
  await user.click(screen.getByRole("option", { name: "Gudang Barat" }));

  // The warehouse answers the branch question, so the field above stops
  // claiming the list is still open to every branch.
  expect(
    screen.getByRole("button", { name: "Filter cabang" }),
  ).toHaveTextContent("Cabang Barat");
});

it("leaves the branch alone when the warehouse is the shared one", async () => {
  const user = await openPanel();

  await user.click(screen.getByRole("button", { name: "Filter gudang" }));
  await user.click(screen.getByRole("option", { name: "Gudang Pusat" }));

  // It serves every branch: there is no single answer to volunteer.
  expect(
    screen.getByRole("button", { name: "Filter cabang" }),
  ).toHaveTextContent("Semua cabang");
});

it("does not undo a branch the user chose when the shared warehouse follows", async () => {
  const user = await openPanel();

  await user.click(screen.getByRole("button", { name: "Filter cabang" }));
  await user.click(screen.getByRole("option", { name: "Cabang Timur" }));
  await user.click(screen.getByRole("button", { name: "Filter gudang" }));
  await user.click(screen.getByRole("option", { name: "Gudang Pusat" }));

  expect(
    screen.getByRole("button", { name: "Filter cabang" }),
  ).toHaveTextContent("Cabang Timur");
});

it("sends the pair the two fields settled on", async () => {
  const user = await openPanel();

  await user.click(screen.getByRole("button", { name: "Filter gudang" }));
  await user.click(screen.getByRole("option", { name: "Gudang Barat" }));
  await user.click(screen.getByRole("button", { name: "Terapkan" }));

  await waitFor(() =>
    expect(stockEntryService.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ branchId: "b2", warehouseId: "w2" }),
    ),
  );
});
