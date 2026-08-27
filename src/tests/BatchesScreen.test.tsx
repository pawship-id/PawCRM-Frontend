import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BatchesScreen } from "@/features/inventory";
import { productBatchService } from "@/services/productBatch.service";
import { warehouseService } from "@/services/warehouse.service";
import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";
import type { Branch, PageResult, Warehouse } from "@/types/api";
import type {
  BatchExpirySummary,
  ExpiringBatchesResult,
  ProductBatch,
} from "@/types/inventory";

import { FULL_REACH_USER, renderWithAuth } from "./helpers/renderWithAuth";

/**
 * Batch & Expired, against mocked services.
 *
 * WHAT THESE TESTS GUARD. The screen reads three endpoints that answer three
 * different questions, and the ways it could go wrong are all about picking the
 * wrong one or re-deriving what one of them already said:
 *
 *  1. the tiles come from `/summary`, never from the page on screen — a count
 *     summed from twenty rows grows as the user pages;
 *  2. the horizon uses `/expiring`, "Semua lot" uses `/product-batches`, and a
 *     SEARCH forces the second whatever the horizon says;
 *  3. rows render the labels the API resolved — nothing here may reintroduce a
 *     client-side join against the catalogue;
 *  4. the order is the server's; this screen never re-sorts a page.
 *
 * The Radix selects are not driven — jsdom cannot do their pointer protocol, and
 * what they set is a value that goes straight into the query.
 */
const WAREHOUSE = "wh1";
const BRANCH = "br1";

function branch(id = BRANCH, name = "Cabang Timur"): Branch {
  return {
    _id: id,
    tenantId: "t1",
    name,
    address: null,
    phone: null,
    receiptFooter: null,
    location: { lat: null, lng: null, source: "manual" },
    isActive: true,
    deletedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

function warehouse(id = WAREHOUSE, name = "Gudang Pusat"): Warehouse {
  return {
    _id: id,
    tenantId: "t1",
    name,
    defaultBranchId: null,
    address: null,
    location: { lat: null, lng: null, source: "manual" },
    picName: null,
    picPhone: null,
    isActive: true,
    isDefault: false,
    deletedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

function lot(overrides: Partial<ProductBatch> = {}): ProductBatch {
  return {
    _id: "b1",
    tenantId: "t1",
    warehouseId: WAREHOUSE,
    productId: "p1",
    receiptId: null,
    batchCode: "WSK-B26-0512",
    supplierBatchCode: null,
    expiryDate: "2026-08-08T00:00:00.000Z",
    initialQty: "10.0000",
    qtyRemaining: "4.0000",
    costPerUnit: "118500.0000",
    isConsignment: false,
    createdBy: null,
    createdAt: "",
    updatedAt: "",
    productName: "Whiskas Adult 1.2kg",
    productSku: "WSK-12",
    productUnit: "pcs",
    warehouseName: "Gudang Pusat",
    ...overrides,
  };
}

function summary(
  overrides: Partial<BatchExpirySummary> = {},
): BatchExpirySummary {
  return {
    expired: { count: 2, value: "150000.0000" },
    critical: { count: 1, value: "50000.0000" },
    soon: { count: 3, value: "300000.0000" },
    atRisk: { count: 6, value: "500000.0000" },
    criticalDays: 7,
    withinDays: 30,
    ...overrides,
  };
}

function page(items: ProductBatch[]): PageResult<ProductBatch> {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  };
}

function expiringPage(items: ProductBatch[]): ExpiringBatchesResult {
  return {
    ...page(items),
    withinDays: 30,
    before: "2026-09-02T00:00:00.000Z",
  };
}

function mockAll(lots: ProductBatch[] = [lot()], warehouses = [warehouse()]) {
  jest
    .spyOn(warehouseService, "list")
    .mockResolvedValue(page([]) as never)
    .mockResolvedValue({
      items: warehouses,
      pagination: {
        page: 1,
        limit: 100,
        total: warehouses.length,
        totalPages: 1,
      },
    } as never);
  // A lot names no branch: the screen walks warehouse → `defaultBranchId` →
  // branch, so both lookups have to be here for the Cabang column to say
  // anything.
  jest.spyOn(branchService, "list").mockResolvedValue({
    items: [branch()],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
  const summaryCall = jest
    .spyOn(productBatchService, "summary")
    .mockResolvedValue(summary());
  const expiringCall = jest
    .spyOn(productBatchService, "expiring")
    .mockResolvedValue(expiringPage(lots));
  const listCall = jest
    .spyOn(productBatchService, "list")
    .mockResolvedValue(page(lots));

  return { summaryCall, expiringCall, listCall };
}

afterEach(() => jest.restoreAllMocks());

/**
 * Opens the one filter panel and returns it.
 *
 * The warehouse, the horizon, the ordering and the spent-lot toggle all live
 * inside it, so every filter assertion starts here. The trigger's text carries a
 * count (`Filter (1)`); its accessible name does not, so it is found by the
 * stable half.
 */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Filter" }));
  return screen.findByRole("dialog");
}

describe("BatchesScreen", () => {
  it("takes the tiles from the summary endpoint, not from the page", async () => {
    const { summaryCall } = mockAll([lot()]);

    renderWithAuth(<BatchesScreen />);

    // One row on screen, six lots at risk. Counting the page would have said 1.
    expect(await screen.findByText("Sudah lewat tanggal")).toBeInTheDocument();
    await waitFor(() => expect(summaryCall).toHaveBeenCalled());
    expect(screen.getByText("Rp 500.000")).toBeInTheDocument();
  });

  it("labels the tiles with the boundaries the API reported", async () => {
    mockAll();

    renderWithAuth(<BatchesScreen />);

    // Not hardcoded: the caption reads back the numbers the buckets were cut at.
    expect(
      await screen.findByText("Kritis — kurang 7 hari"),
    ).toBeInTheDocument();
  });

  it("asks the expiring endpoint while a horizon is selected", async () => {
    const { expiringCall, listCall } = mockAll();

    renderWithAuth(<BatchesScreen />);

    await waitFor(() =>
      expect(expiringCall).toHaveBeenCalledWith(
        expect.objectContaining({ withinDays: 30, page: 1 }),
      ),
    );
    // The alert list and the audit list answer different questions; only one of
    // them was asked.
    expect(listCall).not.toHaveBeenCalled();
  });

  it("switches to the whole collection when a batch code is searched", async () => {
    const { listCall } = mockAll();

    const user = userEvent.setup();
    renderWithAuth(<BatchesScreen />);

    await screen.findByRole("table");
    await user.type(
      screen.getByLabelText("Cari kode batch, kode supplier, nama produk, atau SKU"),
      "WSK",
    );

    // `/expiring` cannot filter by code, and tracing a lot is a question about
    // its whole life — including after it sold out.
    await waitFor(() =>
      expect(listCall).toHaveBeenCalledWith(
        expect.objectContaining({ search: "WSK" }),
      ),
    );
  });

  it("says why the horizon went quiet during a search", async () => {
    mockAll();

    const user = userEvent.setup();
    renderWithAuth(<BatchesScreen />);

    await screen.findByRole("table");
    await user.type(
      screen.getByLabelText("Cari kode batch, kode supplier, nama produk, atau SKU"),
      "WSK",
    );

    // Said twice over, and deliberately: on the bar, where somebody who never
    // opens the panel can still see why their horizon stopped mattering...
    expect(
      await screen.findByText(/rentang\s+kedaluwarsa dinonaktifkan/),
    ).toBeInTheDocument();

    // ...and beside the greyed control itself, which is the only place that
    // explains the control rather than the page.
    const panel = await openFilters(user);
    expect(
      within(panel).getByRole("button", { name: "Rentang kedaluwarsa" }),
    ).toBeDisabled();
    expect(
      within(panel).getByText(/Nonaktif selama kotak pencarian terisi/),
    ).toBeInTheDocument();
  });

  it("offers the exhausted-lot toggle only where it means something", async () => {
    mockAll();

    const user = userEvent.setup();
    renderWithAuth(<BatchesScreen />);

    await screen.findByRole("table");

    // In alert mode an exhausted lot cannot expire into anything, so the
    // endpoint has no opinion to offer and the toggle is not in the panel.
    let panel = await openFilters(user);
    expect(
      within(panel).queryByLabelText(/Tampilkan batch yang sudah habis/),
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.type(
      screen.getByLabelText("Cari kode batch, kode supplier, nama produk, atau SKU"),
      "WSK",
    );
    await screen.findByRole("table");

    panel = await openFilters(user);
    expect(
      within(panel).getByLabelText(/Tampilkan batch yang sudah habis/),
    ).toBeInTheDocument();
  });

  it("asks for live lots only until the toggle says otherwise", async () => {
    const { listCall } = mockAll();

    const user = userEvent.setup();
    renderWithAuth(<BatchesScreen />);

    await screen.findByRole("table");
    await user.type(
      screen.getByLabelText("Cari kode batch, kode supplier, nama produk, atau SKU"),
      "WSK",
    );
    await waitFor(() => expect(listCall).toHaveBeenCalled());

    expect(listCall).toHaveBeenLastCalledWith(
      expect.objectContaining({ hasRemaining: true }),
    );

    const panel = await openFilters(user);
    await user.click(
      within(panel).getByLabelText(/Tampilkan batch yang sudah habis/),
    );
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    // Tri-state: undefined is "both", which is what the toggle asks for.
    await waitFor(() =>
      expect(listCall).toHaveBeenLastCalledWith(
        expect.objectContaining({ hasRemaining: undefined }),
      ),
    );
  });

  it("re-orders both endpoints through one control", async () => {
    const { listCall, expiringCall } = mockAll();

    const user = userEvent.setup();
    renderWithAuth(<BatchesScreen />);
    await screen.findByRole("table");

    // Stated rather than omitted: every page of a walk has to agree, and this
    // screen exists to show what goes bad first.
    expect(expiringCall).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "expirySoonest" }),
    );

    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Urutkan" }));
    await user.click(screen.getByRole("option", { name: "Terbaru diterima" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(expiringCall).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "newest" }),
      ),
    );

    // The ordering SURVIVES the switch to the audit endpoint. A sort that reset
    // itself when a search flipped the screen would be a control that undoes
    // its own last click.
    await user.type(
      screen.getByLabelText("Cari kode batch, kode supplier, nama produk, atau SKU"),
      "WSK",
    );

    await waitFor(() =>
      expect(listCall).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "newest" }),
      ),
    );

    // And the badge counts neither the ordering nor the horizon: both are
    // always set, so a number over an unnarrowed report would be noise. Read
    // with the panel SHUT — Radix hides the trigger from the accessibility
    // tree while its own dialog is up.
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      /^Filter$/,
    );
  });

  it("renders the product and warehouse the API named", async () => {
    mockAll([lot()]);

    renderWithAuth(<BatchesScreen />);

    const table = await screen.findByRole("table");
    // Resolved server-side. A client joining these itself would need the whole
    // catalogue in memory, and one holding part of it would render blanks.
    expect(within(table).getByText("Whiskas Adult 1.2kg")).toBeInTheDocument();
    expect(within(table).getByText("WSK-12")).toBeInTheDocument();
    expect(within(table).getByText("Gudang Pusat")).toBeInTheDocument();
  });

  it("names the branch its warehouse belongs to", async () => {
    // NOT ON THE ROW, unlike the two above. A lot has no branch of its own — it
    // belongs to a warehouse, and the warehouse carries the link — so this is a
    // two-step walk the screen makes across lookups it already holds.
    mockAll([lot()], [{ ...warehouse(), defaultBranchId: BRANCH }]);

    renderWithAuth(<BatchesScreen />);

    const table = await screen.findByRole("table");
    await waitFor(() =>
      expect(within(table).getByText("Cabang Timur")).toBeInTheDocument(),
    );
  });

  it("says a central warehouse belongs to no branch rather than leaving it blank", async () => {
    // `defaultBranchId: null` is a configuration, not missing data: it serves
    // every branch and belongs to none.
    mockAll([lot()]);

    renderWithAuth(<BatchesScreen />);

    const table = await screen.findByRole("table");
    await waitFor(() =>
      expect(within(table).getByText("Tanpa cabang")).toBeInTheDocument(),
    );
  });

  it("does not name a branch the signed-in user has no access to", async () => {
    /**
     * A COURTESY, NOT THE ISOLATION — the server narrows this list on its own
     * (`warehouseScope.js`), so a lot outside the scope never reaches the table.
     * What is asserted here is that the two lookups feeding the Cabang column
     * are narrowed the same way, so the screen cannot label a row with a branch
     * the picker beside it would refuse to offer.
     */
    mockAll([lot()], [{ ...warehouse(), defaultBranchId: BRANCH }]);

    renderWithAuth(<BatchesScreen />, {
      user: {
        ...FULL_REACH_USER,
        allBranches: false,
        // Holds some other shop, not the one this lot's warehouse sits in.
        branchAccess: ["br-other"],
      },
    });

    const table = await screen.findByRole("table");
    await waitFor(() =>
      expect(within(table).queryByText("Cabang Timur")).not.toBeInTheDocument(),
    );
  });

  it("does not claim 'tanpa cabang' when the branch list could not be read", async () => {
    // A role may hold the batch report without `branches:read`. The lot still
    // sits in a branch — this screen just cannot name it, and saying it has none
    // would be a different fact.
    mockAll([lot()], [{ ...warehouse(), defaultBranchId: BRANCH }]);
    jest
      .spyOn(branchService, "list")
      .mockRejectedValue(new ApiError("Forbidden", 403));

    renderWithAuth(<BatchesScreen />);

    const table = await screen.findByRole("table");
    await waitFor(() =>
      expect(within(table).queryByText("Tanpa cabang")).not.toBeInTheDocument(),
    );
    expect(within(table).queryByText("Cabang Timur")).not.toBeInTheDocument();
  });

  it("keeps the server's order rather than re-sorting the page", async () => {
    mockAll([
      lot({ _id: "a", batchCode: "WSK-B26-0512" }),
      lot({
        _id: "b",
        batchCode: "RC-B26-0455",
        expiryDate: "2026-08-27T00:00:00.000Z",
      }),
    ]);

    renderWithAuth(<BatchesScreen />);

    const table = await screen.findByRole("table");
    const codes = within(table)
      .getAllByText(/^(RC|WSK)-B26-/)
      .map((node) => node.textContent);

    // The list is paged server-side, so a client that re-sorted would only be
    // reordering the rows it happens to hold.
    expect(codes[0]).toBe("WSK-B26-0512");
  });

  it("surfaces a failed summary without taking the list down with it", async () => {
    mockAll();
    jest
      .spyOn(productBatchService, "summary")
      .mockRejectedValue(new ApiError("Forbidden", 403));

    renderWithAuth(<BatchesScreen />);

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    // The report still renders — the tiles are context, not the point.
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("tells an empty search apart from an empty horizon", async () => {
    mockAll([]);

    const user = userEvent.setup();
    renderWithAuth(<BatchesScreen />);

    expect(
      await screen.findByText("Tidak ada batch di rentang ini"),
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Cari kode batch, kode supplier, nama produk, atau SKU"),
      "ZZZ",
    );

    expect(
      await screen.findByText("Tidak ada batch yang cocok"),
    ).toBeInTheDocument();
  });

  it("searches lot codes, product names and SKUs through one box", async () => {
    const { listCall } = mockAll();

    const user = userEvent.setup();
    renderWithAuth(<BatchesScreen />);
    await screen.findByRole("table");

    // The term goes to the API as one string — the lot's own code and the
    // product's name and SKU are matched server-side, because a lot carries a
    // productId and no name of its own.
    await user.type(
      screen.getByLabelText("Cari kode batch, kode supplier, nama produk, atau SKU"),
      "Whiskas",
    );

    await waitFor(() =>
      expect(listCall).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "Whiskas" }),
      ),
    );
  });

  describe("the custom expiry range", () => {
    /** Picks "Rentang khusus" in the open panel and returns the panel. */
    async function pickCustom(user: ReturnType<typeof userEvent.setup>) {
      const panel = await openFilters(user);
      await user.click(
        within(panel).getByRole("button", { name: "Rentang kedaluwarsa" }),
      );
      await user.click(screen.getByRole("option", { name: "Rentang khusus" }));
      return panel;
    }

    it("sends a hand-picked window to the audit endpoint", async () => {
      const { listCall, expiringCall } = mockAll();

      const user = userEvent.setup();
      renderWithAuth(<BatchesScreen />);
      await screen.findByRole("table");
      expiringCall.mockClear();

      const panel = await pickCustom(user);
      await user.type(
        within(panel).getByLabelText("Tanggal kedaluwarsa dari"),
        "2026-11-01",
      );
      await user.type(
        within(panel).getByLabelText("Tanggal kedaluwarsa sampai"),
        "2026-11-30",
      );
      await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

      // `/expiring` counts days forward from today and cannot express a window
      // that names its own two ends — so the range switches endpoints, exactly
      // as a search does.
      await waitFor(() =>
        expect(listCall).toHaveBeenLastCalledWith(
          expect.objectContaining({
            expiryFrom: "2026-11-01",
            expiryTo: "2026-11-30",
          }),
        ),
      );
      expect(expiringCall).not.toHaveBeenCalled();
    });

    it("says so rather than pretending an empty window narrowed anything", async () => {
      mockAll();

      const user = userEvent.setup();
      renderWithAuth(<BatchesScreen />);
      await screen.findByRole("table");

      const panel = await pickCustom(user);
      await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

      // The horizon reads "Rentang khusus" while nothing is filled in, which
      // looks like a filter and is not one.
      expect(
        await screen.findByText(/Rentang khusus belum diisi/),
      ).toBeInTheDocument();
    });

    it("hides the dates during a search instead of leaving them inert", async () => {
      mockAll();

      const user = userEvent.setup();
      renderWithAuth(<BatchesScreen />);
      await screen.findByRole("table");

      let panel = await pickCustom(user);
      await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

      await user.type(
        screen.getByLabelText("Cari kode batch, kode supplier, nama produk, atau SKU"),
        "WSK",
      );
      await screen.findByRole("table");

      // A search suspends the whole horizon, and two date inputs that accept
      // typing and change nothing are worse than two that are not there.
      panel = await openFilters(user);
      expect(
        within(panel).queryByLabelText("Tanggal kedaluwarsa dari"),
      ).not.toBeInTheDocument();
      expect(
        within(panel).getByText(/Nonaktif selama kotak pencarian terisi/),
      ).toBeInTheDocument();
    });
  });
});
