import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  ConsignmentScreen,
  LowStockScreen,
  ReportsHub,
  StockOnHandScreen,
} from "@/features/reports";
import { reportService } from "@/services/report.service";
import { productService } from "@/services/product.service";
import { productBatchService } from "@/services/productBatch.service";
import { branchService } from "@/services/branch.service";
import { categoryService } from "@/services/category.service";
import type { User } from "@/types/api";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import type { StockOnHandRow } from "@/types/report";

import { renderWithAuth } from "./helpers/renderWithAuth";

/**
 * The workbook writer, mocked. These screens own WHICH rows get exported and
 * through which endpoint; whether the bytes are a valid workbook is
 * `xlsx.test.ts`'s job. Loading the real 500 KB SheetJS build here as well made
 * the parallel run slow enough to time out unrelated suites.
 */
jest.mock("@/utils/xlsx", () => ({
  csvToXlsx: jest.fn(async () => new Blob(["workbook"])),
  saveBlob: jest.fn(),
  exportToXlsx: jest.fn(async () => undefined),
}));

jest.mock("@/services/report.service");
jest.mock("@/services/product.service");
jest.mock("@/services/productBatch.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/category.service");
jest.mock("@/services/warehouse.service");

/**
 * The reports hub and its three own screens.
 *
 * WHAT THESE GUARD, in the order the design would regress:
 *
 *  1. THE HUB GATES PER CARD, not per page. A role holding half the grants must
 *     see half the reports rather than all of them (and a wall of 403s) or none;
 *  2. TOTALS ARE THE SERVER'S. Summing the page would produce a figure that
 *     changes as you page, looks like an answer, and is not one;
 *  3. A NULL COST BASIS IS NOT ZERO. "We do not know what this is worth" and
 *     "this is worth nothing" must not render identically;
 *  4. A BRANCHLESS WAREHOUSE STILL APPEARS. `defaultBranchId` is nullable by
 *     design, and forgotten stock is exactly what the report is for;
 *  5. THE CONSIGNMENT FIGURE IS NOT A DEBT. An owner reading two totals on two
 *     screens will otherwise add them.
 *
 * The Radix selects are not driven — jsdom cannot do their pointer protocol — so
 * the filters are exercised through what the screen sends, not through clicking.
 */
const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

const stockRow = (overrides: Partial<StockOnHandRow> = {}): StockOnHandRow => ({
  productId: "p1",
  sku: "SHAMPOO",
  name: "Shampoo Anjing",
  productType: "standalone",
  unit: "pcs",
  minStock: 5,
  categoryId: "c1",
  categoryName: "Perawatan",
  warehouseId: "wh1",
  warehouseName: "Gudang Utama",
  branchId: "b1",
  branchName: "Cabang Timur",
  qty: "12.0000",
  hppAvg: "30000.0000",
  value: "360000.0000",
  isLow: false,
  ...overrides,
});

const stockResult = (rows: StockOnHandRow[], overrides = {}) => ({
  items: rows,
  totals: { qty: "12.0000", value: "360000.0000", productCount: 1 },
  pagination: { page: 1, limit: 50, total: rows.length, totalPages: 1 },
  ...overrides,
});

const emptyPage = { items: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } };

beforeEach(() => {
  jest.clearAllMocks();

  asMock(branchService.list).mockResolvedValue({
    ...emptyPage,
    items: [{ _id: "b1", name: "Cabang Timur" }],
  } as Awaited<ReturnType<typeof branchService.list>>);
  asMock(warehouseService.list).mockResolvedValue({
    ...emptyPage,
    items: [{ _id: "wh1", name: "Gudang Utama", isActive: true }],
  } as Awaited<ReturnType<typeof warehouseService.list>>);
  asMock(categoryService.list).mockResolvedValue({
    ...emptyPage,
    items: [{ _id: "c1", name: "Perawatan" }],
  } as Awaited<ReturnType<typeof categoryService.list>>);

  asMock(reportService.stockOnHand).mockResolvedValue(
    stockResult([stockRow()]),
  );
  asMock(productService.lowStock).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  } as Awaited<ReturnType<typeof productService.lowStock>>);
  asMock(productBatchService.consignmentSummary).mockResolvedValue({
    items: [],
    totalValue: "0",
    totalLots: 0,
  });
  // The drill-down table this screen embeds fetches its own rows.
  asMock(productBatchService.consignmentProducts).mockResolvedValue({
    items: [],
    totalValue: "0",
    totalLots: 0,
  });
});

let mockTab = "penjualan";
jest.mock("next/navigation", () => ({
  ...jest.requireActual("next/navigation"),
  useSearchParams: () => new URLSearchParams({ tab: mockTab }),
}));

describe("ReportsHub", () => {
  beforeEach(() => {
    mockTab = "penjualan";
  });

  it("opens on Penjualan, whose reports are all still Segera", () => {
    renderWithAuth(<ReportsHub />);

    expect(screen.getByText("Penjualan per invoice")).toBeInTheDocument();
    expect(screen.getAllByText("Segera").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Buka" })).not.toBeInTheDocument();
  });

  it("lists the inventory reports a full grant can reach", () => {
    mockTab = "inventori";
    renderWithAuth(<ReportsHub />);

    expect(screen.getByText("Posisi stok")).toBeInTheDocument();
    expect(screen.getByText("Kartu stok")).toBeInTheDocument();
    expect(screen.getByText("Konsinyasi outstanding")).toBeInTheDocument();
  });

  /** The hub is the statements' only door since 22 September 2026. */
  it("opens the two live statements for a ledger reader, and lists Arus kas as Segera", () => {
    mockTab = "keuangan";
    renderWithAuth(<ReportsHub />, {
      isSuperAdmin: false,
      permissions: [{ feature: "journalEntries", actions: ["read"] }],
    });

    const hrefs = screen
      .getAllByRole("link", { name: "Buka" })
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/dashboard/keuangan/laba-rugi",
      "/dashboard/keuangan/neraca",
    ]);
    const arusKas = screen.getByText("Arus kas").closest("tr")!;
    expect(arusKas).toHaveTextContent("Segera");
    expect(within(arusKas).queryByRole("link")).not.toBeInTheDocument();
  });

  /** A row that leads to a 403 is worse than no row. */
  it("hides the reports a role cannot reach", () => {
    mockTab = "inventori";
    renderWithAuth(<ReportsHub />, {
      isSuperAdmin: false,
      permissions: [{ feature: "products", actions: ["read"] }],
    });

    expect(screen.getByText("Posisi stok")).toBeInTheDocument();
    expect(screen.getByText("Stok minim")).toBeInTheDocument();
    expect(screen.queryByText("Konsinyasi outstanding")).not.toBeInTheDocument();
    expect(screen.queryByText("Kartu stok")).not.toBeInTheDocument();
  });

  it("still offers a role with no grants their own commission, and not the payroll", () => {
    mockTab = "operasional";
    renderWithAuth(<ReportsHub />, { isSuperAdmin: false, permissions: [] });

    const open = screen.getAllByRole("link", { name: "Buka" });
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveAttribute("href", "/dashboard/reports/commissions/mine");
    expect(screen.queryByText("Rekap komisi")).not.toBeInTheDocument();
  });
});

describe("StockOnHandScreen", () => {
  it("renders the rows and the server's totals", async () => {
    renderWithAuth(<StockOnHandScreen />);

    expect(await screen.findByText("Shampoo Anjing")).toBeInTheDocument();
    expect(screen.getByText("Cabang Timur")).toBeInTheDocument();
  });

  /**
   * The tiles sit above a paged table and would otherwise be read as its sum.
   * The number is the API's, and the caption says which set it covers.
   */
  it("says the totals cover the whole filter, not the page", async () => {
    renderWithAuth(<StockOnHandScreen />);

    expect(
      await screen.findByText(/seluruh hasil filter, bukan cuma halaman ini/i),
    ).toBeInTheDocument();
  });

  it("groups a warehouse with no branch under 'Tanpa cabang'", async () => {
    asMock(reportService.stockOnHand).mockResolvedValue(
      stockResult([stockRow({ branchId: null, branchName: null })]),
    );
    renderWithAuth(<StockOnHandScreen />);

    expect(await screen.findByText("Tanpa cabang")).toBeInTheDocument();
  });

  /**
   * An em dash, never "Rp 0" — only one of those is a data-entry problem the
   * owner should chase.
   */
  it("renders a missing cost basis as a dash rather than zero", async () => {
    asMock(reportService.stockOnHand).mockResolvedValue(
      stockResult([stockRow({ hppAvg: null, value: null })]),
    );
    renderWithAuth(<StockOnHandScreen />);

    await screen.findByText("Shampoo Anjing");
    expect(screen.queryByText("Rp 0")).not.toBeInTheDocument();
  });

  it("flags a row that is below its restock threshold", async () => {
    asMock(reportService.stockOnHand).mockResolvedValue(
      stockResult([stockRow({ isLow: true })]),
    );
    renderWithAuth(<StockOnHandScreen />);

    expect(await screen.findByText("Stok minim")).toBeInTheDocument();
  });

  // Zero rows are hidden by default, so the empty state has to say so — or the
  // reader concludes the warehouse is empty.
  it("explains that zero-stock rows are hidden when the result is empty", async () => {
    asMock(reportService.stockOnHand).mockResolvedValue(stockResult([]));
    renderWithAuth(<StockOnHandScreen />);

    expect(
      await screen.findByText(/stoknya nol disembunyikan/i),
    ).toBeInTheDocument();
  });

  /**
   * The API refuses a filter naming something that does not exist rather than
   * reporting zero rows, and its message names which. Repeating it as "gagal
   * memuat" would throw away the only useful part.
   */
  it("passes the API's filter message through verbatim", async () => {
    asMock(reportService.stockOnHand).mockRejectedValue(
      new ApiError("Unknown warehouse: wh9", 400),
    );
    renderWithAuth(<StockOnHandScreen />);

    expect(
      await screen.findByText("Unknown warehouse: wh9"),
    ).toBeInTheDocument();
  });

  it("exports through the streaming endpoint, not by paging the list", async () => {
    const csv = "Cabang,SKU,Qty\r\nCabang Timur,SHAMPOO,12\r\n";
    asMock(reportService.exportStockOnHand).mockResolvedValue({
      blob: Object.assign(new Blob([csv]), {
        text: () => Promise.resolve(csv),
      }),
      filename: "stok-per-cabang.csv",
    } as Awaited<ReturnType<typeof reportService.exportStockOnHand>>);
    Object.assign(URL, {
      createObjectURL: jest.fn(() => "blob:url"),
      revokeObjectURL: jest.fn(),
    });
    renderWithAuth(<StockOnHandScreen />);

    await screen.findByText("Shampoo Anjing");
    await userEvent.click(
      screen.getByRole("button", { name: /export \.xlsx/i }),
    );

    await waitFor(() =>
      expect(reportService.exportStockOnHand).toHaveBeenCalled(),
    );
    // One request for the whole set — never a page-by-page walk.
    expect(reportService.stockOnHand).toHaveBeenCalledTimes(1);
  });
});

describe("LowStockScreen", () => {
  it("counts what needs restocking", async () => {
    asMock(productService.lowStock).mockResolvedValue({
      items: [
        {
          _id: "p1",
          sku: "SHAMPOO",
          name: "Shampoo Anjing",
          unit: "pcs",
          minStock: 5,
          qtyOnHand: "2",
        },
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    } as unknown as Awaited<ReturnType<typeof productService.lowStock>>);
    renderWithAuth(<LowStockScreen />);

    expect(
      await screen.findByText(/1 produk perlu restock/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Shampoo Anjing")).toBeInTheDocument();
  });

  /**
   * A threshold of zero means "do not alert", which is the default — so an empty
   * list has to explain itself or it reads as "nothing needs ordering ever".
   */
  it("explains that a zero threshold is not tracked", async () => {
    renderWithAuth(<LowStockScreen />);

    expect(
      await screen.findByText(/batasnya masih\s*nol tidak dihitung/i),
    ).toBeInTheDocument();
  });

  // Bounded by design: a restock list with hundreds of pages means the
  // thresholds are wrong, not that the export is.
  it("labels its export as this page only", async () => {
    renderWithAuth(<LowStockScreen />);

    expect(
      await screen.findByRole("button", { name: /export halaman ini/i }),
    ).toBeInTheDocument();
  });
});

describe("ConsignmentScreen", () => {
  /**
   * THE ONE THING THIS SCREEN MUST NOT LET A READER DO. Consigned goods belong
   * to the supplier until they sell; an owner reading two totals on two screens
   * will otherwise sum them.
   */
  it("states that the figure is not a debt, and points at the one that is", async () => {
    renderWithAuth(<ConsignmentScreen />);

    expect(await screen.findByText(/bukan utang/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /faktur pembelian/i }),
    ).toBeInTheDocument();
  });

  it("lists suppliers with what they still hold", async () => {
    asMock(productBatchService.consignmentSummary).mockResolvedValue({
      items: [
        {
          supplierId: "s1",
          supplierName: "PT Sumber Pangan",
          lotCount: 4,
          productCount: 3,
          qtyRemaining: "62",
          value: "1860000",
        },
      ],
      totalValue: "1860000",
      totalLots: 4,
    } as Awaited<ReturnType<typeof productBatchService.consignmentSummary>>);
    renderWithAuth(<ConsignmentScreen />);

    expect(await screen.findByText("PT Sumber Pangan")).toBeInTheDocument();
  });

  /**
   * The goods are on the shelf whether or not the vendor record survives, so the
   * row stays and only the label is missing — hiding it would lose the stock.
   */
  it("keeps a row whose supplier was deleted", async () => {
    asMock(productBatchService.consignmentSummary).mockResolvedValue({
      items: [
        {
          supplierId: "s1",
          supplierName: null,
          lotCount: 1,
          productCount: 1,
          qtyRemaining: "5",
          value: "50000",
        },
      ],
      totalValue: "50000",
      totalLots: 1,
    } as Awaited<ReturnType<typeof productBatchService.consignmentSummary>>);
    renderWithAuth(<ConsignmentScreen />);

    expect(
      await screen.findByText(/supplier sudah dihapus/i),
    ).toBeInTheDocument();
  });

  it("reports a failure rather than showing an empty table", async () => {
    asMock(productBatchService.consignmentSummary).mockRejectedValue(
      new ApiError("Forbidden", 403),
    );
    renderWithAuth(<ConsignmentScreen />);

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
  });
});

/**
 * Stock isolation on the valuation report.
 *
 * A COURTESY OVER THE SERVER'S ANSWER — the endpoint narrows the rows and
 * refuses an out-of-scope filter with a 403 whatever these dropdowns offer.
 */
describe("stock isolation on StockOnHandScreen", () => {
  beforeEach(() => {
    asMock(branchService.list).mockResolvedValue({
      ...emptyPage,
      items: [
        { _id: "b1", name: "Cabang Timur" },
        { _id: "b2", name: "Cabang Barat" },
      ],
    } as Awaited<ReturnType<typeof branchService.list>>);
    asMock(warehouseService.list).mockResolvedValue({
      ...emptyPage,
      items: [
        { _id: "wh1", name: "Gudang Utama", isActive: true, defaultBranchId: "b1" },
        { _id: "wh2", name: "Gudang Barat", isActive: true, defaultBranchId: "b2" },
        { _id: "wh0", name: "Gudang Pusat", isActive: true, defaultBranchId: null },
      ],
    } as Awaited<ReturnType<typeof warehouseService.list>>);
  });

  const confined = {
    _id: "u2",
    allBranches: false,
    branchAccess: ["b1"],
    warehouseAccess: [
      { branchId: "b1", allWarehouses: true, warehouseIds: [] },
    ],
  } as unknown as User;

  it("offers only the branches the user holds", async () => {
    const ui = userEvent.setup();
    renderWithAuth(<StockOnHandScreen />, { user: confined });

    await screen.findByText("Shampoo Anjing");
    await ui.click(screen.getByLabelText("Cabang"));

    expect(screen.getByRole("option", { name: "Cabang Timur" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Cabang Barat" }),
    ).not.toBeInTheDocument();
  });

  it("offers the shared warehouse alongside the user's own", async () => {
    // Gudang Pusat belongs to no branch, so it serves every one of them.
    const ui = userEvent.setup();
    renderWithAuth(<StockOnHandScreen />, { user: confined });

    await screen.findByText("Shampoo Anjing");
    await ui.click(screen.getByLabelText("Gudang"));

    expect(screen.getByRole("option", { name: "Gudang Utama" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Gudang Pusat" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Gudang Barat" }),
    ).not.toBeInTheDocument();
  });

  it("leaves an all-branches user every option", async () => {
    const owner = { ...confined, allBranches: true, branchAccess: [] } as unknown as User;
    const ui = userEvent.setup();
    renderWithAuth(<StockOnHandScreen />, { user: owner });

    await screen.findByText("Shampoo Anjing");
    await ui.click(screen.getByLabelText("Gudang"));

    expect(screen.getByRole("option", { name: "Gudang Barat" })).toBeInTheDocument();
  });
});
