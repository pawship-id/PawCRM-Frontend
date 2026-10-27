import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  cashFlowRows,
  membershipRows,
  valuationRows,
  fetchAllLowStock,
  stockLocations,
  stockOnHandRows,
  ledgerRows,
  LowStockScreen,
  ReportsHub,
} from "@/features/reports";
import { reportService } from "@/services/report.service";
import { productService } from "@/services/product.service";
import { productBatchService } from "@/services/productBatch.service";
import { branchService } from "@/services/branch.service";
import { categoryService } from "@/services/category.service";
import type { Branch, User } from "@/types/api";
import type { StockWarehouse } from "@/types/inventory";
import { warehouseService } from "@/services/warehouse.service";
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

const emptyPage = {
  items: [],
  pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
};

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

  it("opens on Penjualan, where every report opens as a dialog", () => {
    renderWithAuth(<ReportsHub />);

    expect(screen.getByText("Penjualan per faktur")).toBeInTheDocument();
    expect(
      screen.getByText("Penjualan per faktur (rincian barang)"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Segera")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Buka" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Unduh" })).toHaveLength(7);
  });

  it("lists the inventory reports a full grant can reach", () => {
    mockTab = "inventori";
    renderWithAuth(<ReportsHub />);

    expect(screen.getByText("Posisi stok")).toBeInTheDocument();
    expect(screen.getByText("Kartu stok")).toBeInTheDocument();
    expect(screen.getByText("Konsinyasi outstanding")).toBeInTheDocument();
  });

  /** The hub is the statements' only door since 22 September 2026. */
  it("opens the two live statements for Laporan Keuangan, and the rest as downloads", () => {
    mockTab = "keuangan";
    renderWithAuth(<ReportsHub />, {
      isSuperAdmin: false,
      permissions: [{ feature: "financeReports", actions: ["read"] }],
    });

    const hrefs = screen
      .getAllByRole("link", { name: "Buka" })
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/dashboard/finance/profit-loss",
      "/dashboard/finance/balance-sheet",
    ]);
    const umur = screen.getByText("Umur piutang & utang").closest("tr")!;
    expect(
      within(umur).getByRole("button", { name: "Unduh" }),
    ).toBeInTheDocument();
    const biaya = screen.getByText("Biaya per kategori").closest("tr")!;
    expect(
      within(biaya).getByRole("button", { name: "Unduh" }),
    ).toBeInTheDocument();
    const saldo = screen.getByText("Saldo per akun").closest("tr")!;
    expect(
      within(saldo).getByRole("button", { name: "Unduh" }),
    ).toBeInTheDocument();
    const arusKas = screen.getByText("Arus kas").closest("tr")!;
    expect(
      within(arusKas).getByRole("button", { name: "Unduh" }),
    ).toBeInTheDocument();
    expect(within(arusKas).queryByRole("link")).not.toBeInTheDocument();
  });

  /** A row that leads to a 403 is worse than no row. */
  it("hides a Laporan tab whose Lihat is not ticked", () => {
    // 14 Oct 2026: the tab answers to its Laporan grant, not the data grant.
    mockTab = "inventori";
    renderWithAuth(<ReportsHub />, {
      isSuperAdmin: false,
      permissions: [{ feature: "products", actions: ["read"] }],
    });

    expect(
      screen.queryByRole("link", { name: "Inventori" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Posisi stok")).not.toBeInTheDocument();
    // Falls back to the one tab every role has: Operasional, with Komisi saya.
    expect(screen.getByText("Komisi saya")).toBeInTheDocument();
  });

  it("opens the stock reports for a role holding only Laporan Stok", () => {
    mockTab = "inventori";
    renderWithAuth(<ReportsHub />, {
      isSuperAdmin: false,
      permissions: [{ feature: "stockReports", actions: ["read"] }],
    });

    expect(screen.getByText("Posisi stok")).toBeInTheDocument();
    expect(screen.getByText("Stok minim")).toBeInTheDocument();
    expect(screen.getByText("Konsinyasi outstanding")).toBeInTheDocument();
    // Kartu stok is the inventory screen itself, not a report — still its own grant.
    expect(screen.queryByText("Kartu stok")).not.toBeInTheDocument();
  });

  it("opens the payroll for a role holding only Rekap Komisi", () => {
    mockTab = "operasional";
    renderWithAuth(<ReportsHub />, {
      isSuperAdmin: false,
      permissions: [{ feature: "commissionReports", actions: ["read"] }],
    });

    expect(screen.getByText("Rekap komisi")).toBeInTheDocument();
    expect(screen.queryByText("Membership")).not.toBeInTheDocument();
  });

  it("still offers a role with no grants their own commission, and not the payroll", () => {
    mockTab = "operasional";
    renderWithAuth(<ReportsHub />, { isSuperAdmin: false, permissions: [] });

    const open = screen.getAllByRole("link", { name: "Buka" });
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveAttribute(
      "href",
      "/dashboard/reports/commissions/mine",
    );
    expect(screen.queryByText("Rekap komisi")).not.toBeInTheDocument();
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
      await screen.findByRole("button", { name: /unduh halaman ini/i }),
    ).toBeInTheDocument();
  });

  /**
   * THE HEADERS SORT ON THE SERVER — the list pages, so re-sorting the rows on
   * screen would order one page while the pager walked another. It opens on
   * the API's default, the emptiest shelf first, and the caption says which
   * order is on screen rather than claiming a fixed one.
   */
  it("opens emptiest-first and asks the server for each header's ordering", async () => {
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
      pagination: { page: 1, limit: 50, total: 120, totalPages: 3 },
    } as unknown as Awaited<ReturnType<typeof productService.lowStock>>);
    const user = userEvent.setup();
    renderWithAuth(<LowStockScreen />);

    await screen.findByText("Shampoo Anjing");
    expect(productService.lowStock).toHaveBeenLastCalledWith({
      page: 1,
      limit: 50,
      sort: "stockAsc",
    });
    expect(
      screen.getByText(/diurutkan dari stok paling sedikit/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /berikutnya/i }));
    await waitFor(() =>
      expect(productService.lowStock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );

    const clicks: Array<[string, string]> = [
      ["SKU", "skuAsc"],
      ["Produk", "nameAsc"],
      ["Stok", "stockAsc"],
      ["Stok", "stockDesc"],
      // The biggest threshold and the biggest gap first.
      ["Batas", "minStockDesc"],
      ["Kurang", "shortageDesc"],
    ];
    for (const [header, sort] of clicks) {
      await user.click(screen.getByRole("button", { name: header }));
      // A new order is a new walk: back to page 1.
      await waitFor(() =>
        expect(productService.lowStock).toHaveBeenLastCalledWith({
          page: 1,
          limit: 50,
          sort,
        }),
      );
    }
    expect(
      screen.getByText(/diurutkan dari kekurangan paling banyak/i),
    ).toBeInTheDocument();
  });
});

describe("stockLocations — the Posisi stok dialog's Cabang and Gudang", () => {
  const branches = [
    { _id: "b1", name: "Cabang Timur" },
    { _id: "b2", name: "Cabang Barat" },
  ] as Branch[];
  const warehouses = [
    { _id: "wh1", name: "Gudang Utama", isActive: true, defaultBranchId: "b1" },
    { _id: "wh2", name: "Gudang Barat", isActive: true, defaultBranchId: "b2" },
    { _id: "wh0", name: "Gudang Pusat", isActive: true, defaultBranchId: null },
  ] as StockWarehouse[];

  const confined = {
    _id: "u2",
    allBranches: false,
    branchAccess: ["b1"],
    warehouseAccess: [
      { branchId: "b1", allWarehouses: true, warehouseIds: [] },
    ],
  } as unknown as User;

  it("offers only the branches the user holds", () => {
    const { branches: offered } = stockLocations(
      confined,
      branches,
      warehouses,
    );
    expect(offered.map((b) => b.name)).toEqual(["Cabang Timur"]);
  });

  it("offers the shared warehouse alongside the user's own, under every cabang", () => {
    // Gudang Pusat belongs to no branch, so it serves every one of them.
    const { warehouses: offered } = stockLocations(
      confined,
      branches,
      warehouses,
    );
    expect(offered.map((w) => [w.name, w.branchIds])).toEqual([
      ["Gudang Utama", ["b1"]],
      ["Gudang Pusat", "all"],
    ]);
  });

  it("leaves an all-branches user every option", () => {
    const owner = {
      ...confined,
      allBranches: true,
      branchAccess: [],
    } as unknown as User;
    const { warehouses: offered } = stockLocations(owner, branches, warehouses);
    expect(offered.map((w) => w.name)).toContain("Gudang Barat");
  });
});

describe("stockOnHandRows", () => {
  it("reads the streamed CSV by header, dropping the BOM and trailing blank lines", () => {
    const rows = stockOnHandRows(
      '\uFEFFCabang,Gudang,SKU,Produk,Qty\r\nTimur,Utama,007,"Pakan, 1kg",12\r\n\r\n',
    );
    expect(rows).toEqual([
      {
        Cabang: "Timur",
        Gudang: "Utama",
        SKU: "007",
        Produk: "Pakan, 1kg",
        Qty: "12",
      },
    ]);
  });
});

describe("cashFlowRows", () => {
  it("lays the statement out top to bottom, totals as rows of their own", () => {
    const rows = cashFlowRows({
      range: { fromDate: "2026-09-01", toDate: "2026-09-30" },
      opening: {
        total: "1000000.0000",
        accounts: [{ code: "1101", name: "Kas", balance: "1000000.0000" }],
      },
      sections: [
        {
          type: "operating",
          inflow: "500000.0000",
          outflow: "0.0000",
          net: "500000.0000",
          lines: [
            {
              sourceType: "pos",
              entryCount: 3,
              inflow: "500000.0000",
              outflow: "0.0000",
              net: "500000.0000",
            },
          ],
        },
      ],
      netChange: "500000.0000",
      closing: {
        total: "1500000.0000",
        accounts: [{ code: "1101", name: "Kas", balance: "1500000.0000" }],
      },
    });

    expect(rows.map((r) => [r.section, r.label, r.amount])).toEqual([
      ["Saldo awal", "1101 Kas", "1000000.0000"],
      ["Saldo awal", "Total saldo awal kas & bank", "1000000.0000"],
      ["Operasional", "Kasir", "500000.0000"],
      [
        "Operasional",
        "Arus kas bersih dari aktivitas operasional",
        "500000.0000",
      ],
      ["Perubahan kas", "Kenaikan (penurunan) kas bersih", "500000.0000"],
      ["Saldo akhir", "1101 Kas", "1500000.0000"],
      ["Saldo akhir", "Total saldo akhir kas & bank", "1500000.0000"],
    ]);
  });
});

describe("ledgerRows", () => {
  it("frames each account's lines with its opening and closing", () => {
    const rows = ledgerRows({
      range: { fromDate: "2026-09-01", toDate: "2026-09-30" },
      accounts: [
        {
          code: "1101",
          name: "Kas",
          accountType: "asset",
          accountCategory: "cash_bank",
          normalBalance: "debit",
          opening: "1000000.0000",
          debit: "500000.0000",
          credit: "0.0000",
          closing: "1500000.0000",
          lines: [
            {
              date: "2026-09-05",
              entryNumber: "JU-0001",
              description: "Penjualan",
              memo: null,
              sourceType: "pos",
              branchName: "Pusat",
              debit: "500000.0000",
              credit: "0.0000",
              balance: "1500000.0000",
            },
          ],
        },
      ],
    });

    expect(
      rows.map((r) => [r.date, r.description, r.source, r.balance]),
    ).toEqual([
      ["2026-09-01", "Saldo awal", null, "1000000.0000"],
      ["2026-09-05", "Penjualan", "Kasir", "1500000.0000"],
      ["2026-09-30", "Saldo akhir", null, "1500000.0000"],
    ]);
    expect(rows[2].debit).toBe("500000.0000");
  });
});

describe("fetchAllLowStock", () => {
  it("walks every page of the restock list, in the server's order", async () => {
    const product = (id: string) => ({ _id: id, qtyOnHand: "0" });
    asMock(productService.lowStock)
      .mockResolvedValueOnce({
        items: [product("p1"), product("p2")],
        pagination: { page: 1, limit: 100, total: 3, totalPages: 2 },
      } as unknown as Awaited<ReturnType<typeof productService.lowStock>>)
      .mockResolvedValueOnce({
        items: [product("p3")],
        pagination: { page: 2, limit: 100, total: 3, totalPages: 2 },
      } as unknown as Awaited<ReturnType<typeof productService.lowStock>>);

    const rows = await fetchAllLowStock({ branchIds: ["b1"] });

    expect(rows.map((r) => r._id)).toEqual(["p1", "p2", "p3"]);
    expect(productService.lowStock).toHaveBeenCalledWith({
      branchIds: ["b1"],
      page: 2,
      limit: 100,
    });
  });
});

describe("valuationRows", () => {
  it("adds the total and the check against the Neraca under the shelves", () => {
    const rows = valuationRows({
      asOf: "2026-09-30",
      rows: [
        {
          branchName: "Timur",
          warehouseName: "Gudang Utama",
          sku: "PK-1",
          productName: "Pakan 1kg",
          categoryName: null,
          unit: "pcs",
          qty: "12.0000",
          averageCost: "1300.0000",
          value: "15600.0000",
        },
      ],
      total: "15600.0000",
      reconciliation: {
        accounts: [
          { code: "1201", name: "Persediaan Barang", balance: "15600.0000" },
        ],
        ledgerTotal: "15600.0000",
        difference: "0.0000",
      },
    });

    expect(rows.map((r) => [r.productName, r.value])).toEqual([
      ["Pakan 1kg", "15600.0000"],
      ["Total nilai persediaan menurut stok", "15600.0000"],
      ["Saldo akun 1201 Persediaan Barang (Neraca)", "15600.0000"],
      ["Total saldo akun persediaan di Neraca", "15600.0000"],
      ["Selisih (stok − Neraca)", "0.0000"],
    ]);
  });
});

describe("membershipRows", () => {
  it("lists the packages best-selling first, then each benefit spent, then the total", () => {
    const rows = membershipRows({
      summary: {
        cards: 3,
        revenue: "900000",
        benefitValue: "200000",
        margin: "700000",
      },
      plans: [
        {
          planId: "p1",
          name: "Gold",
          cards: 2,
          revenue: "600000",
          benefitsUsed: 3,
          benefitValue: "150000",
        },
        {
          planId: "p2",
          name: "Silver",
          cards: 1,
          revenue: "300000",
          benefitsUsed: 1,
          benefitValue: "50000",
        },
      ],
      benefits: [
        {
          benefitId: "b1",
          planId: "p1",
          planName: "Gold",
          label: "Mandi gratis",
          used: 3,
          value: "150000",
          lastUsedAt: "2026-09-20T03:00:00.000Z",
        },
      ],
    });

    expect(
      rows.map((r) => [r.section, r.rank, r.planName, r.benefit, r.margin]),
    ).toEqual([
      ["Paket", 1, "Gold", null, "450000"],
      ["Paket", 2, "Silver", null, "250000"],
      ["Benefit", null, "Gold", "Mandi gratis", null],
      ["Total", null, "Semua paket", null, "700000"],
    ]);
    expect(rows[2].lastUsedAt).toBe("2026-09-20");
  });
});
