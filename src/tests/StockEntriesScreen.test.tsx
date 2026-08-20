import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { StockEntriesScreen } from "@/features/inventory";
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
