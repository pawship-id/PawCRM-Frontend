import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InventoryHub } from "@/features/inventory";
import { productService } from "@/services/product.service";
import { productBatchService } from "@/services/productBatch.service";
import { tenantService } from "@/services/tenant.service";
import { reportService } from "@/services/report.service";
import { warehouseService } from "@/services/warehouse.service";
import { serviceService } from "@/services/service.service";
import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";
import type { PageResult } from "@/types/api";
import type {
  ExpiringBatchesResult,
  NegativeStockResult,
  NegativeStockRow,
  Product,
  ProductBatch,
} from "@/types/inventory";
import type { Tenant } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

/**
 * The Inventory hub, against mocked services.
 *
 * WHAT THESE TESTS GUARD. The hub used to compute both its alert lists from an
 * in-memory store, and the ways the wired version could regress are all about
 * re-deriving something the API already said, or asking for something the user
 * may not read:
 *
 *  1. the badge is the SERVER's total, not the number of rows on screen — a
 *     five-of-forty list badged "5" reads as "nearly done";
 *  2. rows render the labels the API resolved; nothing here joins the catalogue;
 *  3. a section the role cannot read is NOT REQUESTED — a landing page must not
 *     open on a 403;
 *  4. one list failing leaves the other one standing.
 */
jest.mock("@/services/product.service");
jest.mock("@/services/productBatch.service");
/*
  The hub asks the tenant one yes/no question — may a till oversell — to decide
  whether its negative-stock section is on screen at all. Unmocked, that is a
  real fetch from jsdom.
*/
jest.mock("@/services/tenant.service");
/*
  THE RINGKASAN TAB'S OWN READS (29 September 2026): the valuation card, the
  per-gudang breakdown, and the two movement lists — plus the service catalogue,
  which the SKU card counts beside the goods.
*/
jest.mock("@/services/report.service");
jest.mock("@/services/warehouse.service");
jest.mock("@/services/service.service");
jest.mock("@/services/branch.service");

const mockedProducts = jest.mocked(productService);
const mockedBatches = jest.mocked(productBatchService);
const mockedTenant = jest.mocked(tenantService);
const mockedReports = jest.mocked(reportService);
const mockedWarehouses = jest.mocked(warehouseService);
const mockedServices = jest.mocked(serviceService);
const mockedBranches = jest.mocked(branchService);

type LowStockRow = Product & { qtyOnHand: string };

function lowStockRow(overrides: Partial<LowStockRow> = {}): LowStockRow {
  return {
    _id: "p1",
    isConsignment: false,
    isPreorder: false,
    sku: "FD-RC-3KG",
    name: "Royal Canin Adult 3kg",
    productType: "standalone",
    parentId: null,
    variantAxes: [],
    variantAttributes: null,
    bundleConfig: null,
    barcode: null,
    minStock: 10,
    hasExpiry: true,
    categoryId: "c1",
    unit: "pcs",
    sellPrice: "250000.00",
    hppAvg: "180000.00",
    isActive: true,
    deletedAt: null,
    stockByWarehouse: [],
    qtyOnHand: "2.0000",
    ...overrides,
  };
}

function lot(overrides: Partial<ProductBatch> = {}): ProductBatch {
  return {
    _id: "b1",
    tenantId: "t1",
    warehouseId: "wh1",
    productId: "p1",
    receiptId: null,
    batchCode: "RC-B26-0455",
    supplierBatchCode: null,
    expiryDate: "2026-08-20T00:00:00.000Z",
    initialQty: "40.0000",
    qtyRemaining: "12.0000",
    costPerUnit: "180000.00",
    isConsignment: false,
    createdBy: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    productName: "Royal Canin Adult 3kg",
    productSku: "FD-RC-3KG",
    productUnit: "pcs",
    warehouseName: "Gudang Pusat",
    ...overrides,
  };
}

function lowStockPage(
  items: LowStockRow[],
  total = items.length,
): PageResult<LowStockRow> {
  return { items, pagination: { page: 1, limit: 5, total, totalPages: 1 } };
}

function expiringPage(
  items: ProductBatch[],
  total = items.length,
): ExpiringBatchesResult {
  return {
    items,
    pagination: { page: 1, limit: 5, total, totalPages: 1 },
    withinDays: 30,
    before: "2026-09-04T00:00:00.000Z",
  };
}

/** One shelf that owes what it has already sold. */
function negativeRow(
  overrides: Partial<NegativeStockRow> = {},
): NegativeStockRow {
  return {
    productId: "p9",
    warehouseId: "w1",
    warehouseName: "Gudang Pusat",
    sku: "FD-RC-3KG",
    name: "Royal Canin Adult 3kg",
    unit: "pcs",
    isActive: true,
    qty: "-3.0000",
    hppAvg: "10000.0000",
    value: "-30000.0000",
    ...overrides,
  };
}

function negativePage(
  items: NegativeStockRow[],
  total = items.length,
  shortfall = "-30000.0000",
): NegativeStockResult {
  return {
    items,
    shortfall,
    pagination: { page: 1, limit: 5, total, totalPages: 1 },
  };
}

/** `allowNegativeStock` absent means allowed — the server's own default. */
const tenantWith = (allowNegativeStock?: boolean) =>
  ({
    _id: "t1",
    name: "Toko Uji",
    settings: { hotelMode: "numbered", ...(allowNegativeStock === undefined ? {} : { allowNegativeStock }) },
  }) as unknown as Tenant;

/** `/reports/stock-on-hand` answered for the totals only — the card reads those. */
const valuation = (value = "94200000.0000", qty = "18400.0000", products = 248) =>
  ({
    items: [],
    totals: { qty, value, productCount: products },
    pagination: { page: 1, limit: 1, total: products, totalPages: products },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockedProducts.lowStock.mockResolvedValue(lowStockPage([lowStockRow()]));
  mockedReports.stockOnHand.mockResolvedValue(valuation());
  mockedReports.productMovement.mockResolvedValue({
    asOf: "2026-09-29T00:00:00.000Z",
    days: 30,
    idleDays: 60,
    topSellers: [
      {
        productId: "p1",
        sku: "RC-ADULT-2KG",
        name: "Royal Canin Adult 2kg",
        unitsSold: "38.0000",
        qtyOnHand: "4.0000",
      },
    ],
    idle: [
      {
        productId: "p8",
        sku: "SHAMPO-250",
        name: "Shampo Anti Kutu 250ml",
        qtyOnHand: "18.0000",
      },
    ],
  });
  mockedWarehouses.list.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  mockedProducts.list.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 1, total: 214, totalPages: 214 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  mockedBranches.list.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  mockedServices.list.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 1, total: 34, totalPages: 34 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  mockedProducts.negativeStock.mockResolvedValue(negativePage([]));
  mockedBatches.expiring.mockResolvedValue(expiringPage([lot()]));
  mockedTenant.me.mockResolvedValue(tenantWith());
});

describe("InventoryHub", () => {
  it("opens with the mockup's five worklists and two figures", async () => {
    renderWithAuth(<InventoryHub />);

    expect(
      screen.getByRole("heading", { name: "Inventori — Ringkasan" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Perlu restock")).toBeInTheDocument();
    expect(screen.getByText("Mendekati kedaluwarsa")).toBeInTheDocument();
    expect(screen.getByText("SKU paling laris (30 hari)")).toBeInTheDocument();
    expect(screen.getByText("SKU tidak laku")).toBeInTheDocument();

    // Labels resolved by the API, not joined here.
    await waitFor(() => {
      expect(screen.getByText("FD-RC-3KG")).toBeInTheDocument();
    });
    expect(screen.getByText("RC-B26-0455")).toBeInTheDocument();

    // The valuation and the catalogue size, both the server's own totals.
    expect(await screen.findByText("Rp 94.200.000")).toBeInTheDocument();
    expect(screen.getByText("248")).toBeInTheDocument();
    expect(screen.getByText("214 barang · 34 jasa")).toBeInTheDocument();
  });

  /*
    A PAGE OF WARNINGS, NOT A MENU (29 September 2026). The eight cards that
    linked to every screen in the module are gone: the rail expands to all of
    them, always visible, and they took the top of the page from the lists
    somebody opens this tab to read.
  */
  it("no longer duplicates the rail's navigation", async () => {
    renderWithAuth(<InventoryHub />);
    await waitFor(() => expect(mockedBatches.expiring).toHaveBeenCalled());

    expect(
      screen.queryByRole("link", { name: /Kategori/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Transfer Stok/i }),
    ).not.toBeInTheDocument();
    // What survives is the two acts a reader starts FROM this page.
    expect(screen.getByRole("link", { name: "Opname" })).toHaveAttribute(
      "href",
      "/dashboard/inventory/opname",
    );
    expect(screen.getByRole("link", { name: "+ Produk" })).toBeInTheDocument();
  });

  it("ranks sellers with what is left beside them, and dates the run-out", async () => {
    renderWithAuth(<InventoryHub />);

    expect(await screen.findByText("38 terjual")).toBeInTheDocument();
    // 4 left against 38 in 30 days — about three days of cover, which is the
    // half of the row that makes it worth acting on.
    expect(
      screen.getByText(/sisa 4 · habis ~3 hari lagi/),
    ).toBeInTheDocument();
  });

  /*
    THE HEADLINE SURVIVES A REFUSED WAREHOUSE. `/reports/stock-on-hand` answers
    403 for a gudang outside the caller's reach, and the picker above the card
    can legitimately list one — it shows what the TENANT has, while the report
    enforces what this ACCOUNT may read. Batched with `Promise.all`, that one
    refusal blanked the valuation: the card read "—" over a shop with stock in
    it, which is the one thing a valuation must never do.
  */
  /*
    THE SAME SCOPE ROW THE RINGKASAN TABS WEAR, with two fields instead of their
    cabang-and-periode: a stock page has no period, because every figure on it is
    a balance as of now.
  */
  it("scopes by cabang as well as gudang, and narrows the gudang list to it", async () => {
    const user = userEvent.setup();
    mockedBranches.list.mockResolvedValue({
      items: [
        { _id: "b1", name: "Cabang Pusat", isActive: true },
        { _id: "b2", name: "Cabang Timur", isActive: true },
      ],
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockedWarehouses.list.mockResolvedValue({
      items: [
        { _id: "w1", name: "Gudang Pusat", isActive: true, defaultBranchId: "b1" },
        { _id: "w2", name: "Gudang Timur", isActive: true, defaultBranchId: "b2" },
      ],
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    renderWithAuth(<InventoryHub />);

    await user.click(await screen.findByRole("button", { name: "Cabang" }));
    await user.click(await screen.findByRole("option", { name: "Cabang Pusat" }));

    // Every list on the page follows it — the cabang says whose shelves.
    await waitFor(() =>
      expect(mockedProducts.lowStock).toHaveBeenLastCalledWith(
        expect.objectContaining({ branchId: "b1" }),
      ),
    );
    expect(mockedReports.productMovement).toHaveBeenLastCalledWith(
      expect.objectContaining({ branchId: "b1" }),
    );

    // And the gudang picker offers only what is filed under it: two controls
    // contradicting each other is the thing this narrowing prevents.
    await user.click(screen.getByRole("button", { name: "Gudang" }));
    expect(
      await screen.findByRole("option", { name: "Gudang Pusat" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Gudang Timur" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the valuation when one gudang refuses to answer", async () => {
    mockedWarehouses.list.mockResolvedValue({
      items: [
        { _id: "w1", name: "Gudang Pusat", isActive: true },
        { _id: "w9", name: "Gudang Cabang Lain", isActive: true },
      ],
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockedReports.stockOnHand.mockImplementation(async (query) => {
      if (query?.warehouseId === "w9") {
        throw new ApiError("You do not have access to that warehouse", 403);
      }
      return valuation();
    });

    renderWithAuth(<InventoryHub />);

    expect(await screen.findByText("Rp 94.200.000")).toBeInTheDocument();
    expect(screen.queryByText("gagal dimuat")).not.toBeInTheDocument();
    // The refused gudang is simply a bar missing from the chart.
    expect(screen.getByText("Gudang Pusat")).toBeInTheDocument();
    expect(screen.queryByText("Gudang Cabang Lain")).not.toBeInTheDocument();
  });

  it("says so on the card when the valuation itself fails", async () => {
    mockedReports.stockOnHand.mockRejectedValue(
      new ApiError("Gagal memuat", 500),
    );

    renderWithAuth(<InventoryHub />);

    expect(await screen.findByText("gagal dimuat")).toBeInTheDocument();
  });

  it("asks the server for both movement lists in one call, with its own window", async () => {
    renderWithAuth(<InventoryHub />);

    await waitFor(() =>
      expect(mockedReports.productMovement).toHaveBeenCalledWith({
        warehouseId: "",
        branchId: "",
        days: 30,
        idleDays: 60,
        limit: 5,
      }),
    );
  });

  it("badges the server's total, not the rows on screen", async () => {
    // Five rows out of forty low products, and three lots out of nine.
    mockedProducts.lowStock.mockResolvedValue(
      lowStockPage(
        Array.from({ length: 5 }, (_, i) =>
          lowStockRow({ _id: `p${i}`, sku: `SKU-${i}`, name: `Produk ${i}` }),
        ),
        40,
      ),
    );
    mockedBatches.expiring.mockResolvedValue(
      expiringPage(
        Array.from({ length: 3 }, (_, i) =>
          lot({ _id: `b${i}`, batchCode: `LOT-${i}` }),
        ),
        9,
      ),
    );

    renderWithAuth(<InventoryHub />);

    await waitFor(() => {
      expect(screen.getByText("40")).toBeInTheDocument();
    });
    expect(screen.getByText("9")).toBeInTheDocument();

    // And the remainder is stated rather than silently dropped.
    expect(
      screen.getByText(/\+35 produk lain juga di bawah batas minimum/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\+6 batch lain juga di dalam rentang ini/),
    ).toBeInTheDocument();
  });

  it("asks for only the first few rows of each list", async () => {
    renderWithAuth(<InventoryHub />);

    await waitFor(() => {
      expect(mockedProducts.lowStock).toHaveBeenCalledWith({ limit: 5 });
    });
    expect(mockedProducts.negativeStock).toHaveBeenCalledWith({ limit: 5 });
    expect(mockedBatches.expiring).toHaveBeenCalledWith({
      limit: 5,
      withinDays: 30,
    });
  });

  it("hides an action the role cannot perform", async () => {
    renderWithAuth(<InventoryHub />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "products", actions: ["read"] },
        { feature: "stockMovements", actions: ["read"] },
      ],
    });

    await waitFor(() => expect(mockedProducts.lowStock).toHaveBeenCalled());

    // Gated on `products:create` and `stockOpnames:read` — a read-only role is
    // offered neither.
    expect(
      screen.queryByRole("link", { name: "+ Produk" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Opname" }),
    ).not.toBeInTheDocument();
  });

  it("does not request a list the role may not read", async () => {
    renderWithAuth(<InventoryHub />, {
      isSuperAdmin: false,
      permissions: [{ feature: "products", actions: ["read"] }],
    });

    await waitFor(() => {
      expect(mockedProducts.lowStock).toHaveBeenCalled();
    });
    // No `productBatches:read`: the section explains itself instead of opening
    // the landing page on a 403.
    expect(mockedBatches.expiring).not.toHaveBeenCalled();
    expect(
      screen.getByText("Role Anda tidak punya akses ke data ini."),
    ).toBeInTheDocument();
  });

  /*
    STOK MINUS — the one list here that is about the BOOKS rather than the
    shelves. It says a number on this screen is already wrong: goods were sold
    that the system never recorded arriving, so every figure derived from it —
    the stock value on a report included — is wrong with it.
  */
  describe("the negative-stock section", () => {
    it("names the shelf, the shortfall and what it is worth", async () => {
      mockedProducts.negativeStock.mockResolvedValue(
        negativePage([negativeRow()]),
      );

      renderWithAuth(<InventoryHub />);

      expect(await screen.findByText("Stok minus")).toBeInTheDocument();
      // The place, not just the product: the same product can be fine next door.
      expect(
        await screen.findByText(/FD-RC-3KG · Gudang Pusat/),
      ).toBeInTheDocument();
      expect(screen.getByText(/-3 pcs/)).toBeInTheDocument();
    });

    /*
      THE WHOLE HOLE, from the server. A card that summed its own five rows would
      read as the answer while being a fraction of it.
    */
    it("states the total value of the shortfall, not the page's", async () => {
      mockedProducts.negativeStock.mockResolvedValue(
        negativePage([negativeRow()], 12, "-910000.0000"),
      );

      renderWithAuth(<InventoryHub />);

      await waitFor(() =>
        expect(screen.getByText(/Rp\s*-?910\.000/)).toBeInTheDocument(),
      );
      // The badge is the server's count of shelves below zero, not the rows on
      // screen — "1" beside one row out of twelve reads as "nearly done".
      expect(
        screen.getByText("Stok minus").closest("section"),
      ).toHaveTextContent("12");
    });

    /*
      SAID ONCE, ABOVE THE ROWS. Nobody reads "−3" as "a sale was recorded for
      goods the book did not have" on their own, and the wrong reading — "the
      system is broken" — sends somebody looking for a bug instead of for a
      delivery note.
    */
    it("explains what a negative balance means and how to clear it", async () => {
      mockedProducts.negativeStock.mockResolvedValue(
        negativePage([negativeRow()]),
      );

      renderWithAuth(<InventoryHub />);

      expect(
        await screen.findByText(/penerimaan barang belum dicatat/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "opname" })).toHaveAttribute(
        "href",
        "/dashboard/inventory/opname",
      );
    });

    /*
      THE WAY OUT OF THE CARD. Five rows answer "is something wrong"; a shop
      clearing a backlog works down a list, and guessing at the rest is not
      something a landing page should ask of anybody.
    */
    it("links to the full list", async () => {
      mockedProducts.negativeStock.mockResolvedValue(
        negativePage([negativeRow()], 43),
      );

      renderWithAuth(<InventoryHub />);

      expect(
        await screen.findByRole("link", { name: /lihat semua stok minus/i }),
      ).toHaveAttribute("href", "/dashboard/inventory/negative-stock");
    });

    /*
      ON SCREEN EVEN WITH NOTHING TO SHOW, where the shop allows overselling. A
      setting that produces discrepancies silently needs a place that says "none
      right now", or nobody learns the place exists until the day it matters.
    */
    it("stays on screen with an empty list while overselling is allowed", async () => {
      renderWithAuth(<InventoryHub />);

      expect(await screen.findByText("Stok minus")).toBeInTheDocument();
      expect(screen.getByText(/tidak ada stok minus/i)).toBeInTheDocument();
    });

    /*
      AND GOES AWAY WHEN THERE IS NOTHING TO SAY. A shop that refuses negative
      stock cannot produce a new one, so an empty card would be a permanent
      reassurance about something that cannot happen.
    */
    it("disappears when the shop refuses negative stock and has none", async () => {
      mockedTenant.me.mockResolvedValue(tenantWith(false));

      renderWithAuth(<InventoryHub />);

      await waitFor(() => expect(mockedProducts.lowStock).toHaveBeenCalled());
      expect(screen.queryByText("Stok minus")).not.toBeInTheDocument();
    });

    /*
      BUT TURNING THE SETTING OFF DOES NOT CLEAR HISTORY. A shop that has just
      tightened the rule is exactly the one that still has holes to fill, and
      hiding them with the setting would hide the work.
    */
    it("stays for a shop that refuses it but still has rows below zero", async () => {
      mockedTenant.me.mockResolvedValue(tenantWith(false));
      mockedProducts.negativeStock.mockResolvedValue(
        negativePage([negativeRow()]),
      );

      renderWithAuth(<InventoryHub />);

      expect(await screen.findByText("Stok minus")).toBeInTheDocument();
    });

    /*
      `tenants:read` IS A DIFFERENT GRANT from `products:read`, and a storekeeper
      need not hold it. The section falls back to "show it if there is something
      to show" rather than opening the page on a 403.
    */
    it("asks nothing of the tenant when the role may not read it", async () => {
      mockedProducts.negativeStock.mockResolvedValue(
        negativePage([negativeRow()]),
      );

      renderWithAuth(<InventoryHub />, {
        isSuperAdmin: false,
        permissions: [{ feature: "products", actions: ["read"] }],
      });

      expect(await screen.findByText("Stok minus")).toBeInTheDocument();
      expect(mockedTenant.me).not.toHaveBeenCalled();
    });
  });

  it("keeps one list standing when the other fails", async () => {
    mockedBatches.expiring.mockRejectedValue(
      new ApiError("Ringkasan lot gagal dimuat", 500),
    );

    renderWithAuth(<InventoryHub />);

    await waitFor(() => {
      expect(screen.getByText("Ringkasan lot gagal dimuat")).toBeInTheDocument();
    });
    expect(screen.getByText("FD-RC-3KG")).toBeInTheDocument();
  });
});
