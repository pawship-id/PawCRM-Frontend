import { screen, waitFor } from "@testing-library/react";

import { InventoryHub } from "@/features/inventory";
import { productService } from "@/services/product.service";
import { productBatchService } from "@/services/productBatch.service";
import { tenantService } from "@/services/tenant.service";
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

const mockedProducts = jest.mocked(productService);
const mockedBatches = jest.mocked(productBatchService);
const mockedTenant = jest.mocked(tenantService);

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

beforeEach(() => {
  jest.clearAllMocks();
  mockedProducts.lowStock.mockResolvedValue(lowStockPage([lowStockRow()]));
  mockedProducts.negativeStock.mockResolvedValue(negativePage([]));
  mockedBatches.expiring.mockResolvedValue(expiringPage([lot()]));
  mockedTenant.me.mockResolvedValue(tenantWith());
});

describe("InventoryHub", () => {
  it("surfaces the two questions worth acting on today", async () => {
    renderWithAuth(<InventoryHub />);

    expect(
      screen.getByRole("heading", { name: "Inventory" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Perlu restock")).toBeInTheDocument();
    expect(screen.getByText("Mendekati kedaluwarsa")).toBeInTheDocument();

    // Labels resolved by the API, not joined here.
    await waitFor(() => {
      expect(screen.getByText("FD-RC-3KG")).toBeInTheDocument();
    });
    expect(screen.getByText("RC-B26-0455")).toBeInTheDocument();
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

  it("links to every screen the role may open", async () => {
    renderWithAuth(<InventoryHub />);
    // Both lists land before the assertions, so neither settles mid-assert.
    await waitFor(() => expect(mockedBatches.expiring).toHaveBeenCalled());

    // The same screens the sidebar lists, in the order the data flows: define a
    // product, file it, watch its card, manage its lots, count it, move it,
    // correct it.
    const expected: Array<[RegExp, string]> = [
      [/Produk & Varian/i, "/dashboard/inventory/products"],
      [/Kategori/i, "/dashboard/inventory/categories"],
      [/Kartu Stok/i, "/dashboard/inventory/stock-card"],
      [/Batch & Expired/i, "/dashboard/inventory/batches"],
      [/Stok Opname/i, "/dashboard/inventory/opname"],
      [/Transfer Stok/i, "/dashboard/inventory/transfers"],
      [/Penyesuaian cepat/i, "/dashboard/inventory/adjustments"],
    ];

    for (const [name, href] of expected) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("hides a card the role cannot open", async () => {
    renderWithAuth(<InventoryHub />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "products", actions: ["read"] },
        { feature: "stockMovements", actions: ["read"] },
      ],
    });

    await waitFor(() => expect(mockedProducts.lowStock).toHaveBeenCalled());

    expect(
      screen.getByRole("link", { name: /Produk & Varian/i }),
    ).toBeInTheDocument();
    // Gated on `stockMovements:create` — a read-only role never sees the
    // shortcut that writes off stock with no document behind it.
    expect(
      screen.queryByRole("link", { name: /Penyesuaian cepat/i }),
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
