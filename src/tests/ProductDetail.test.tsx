import { screen } from "@testing-library/react";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { ProductDetail } from "@/features/inventory";
import { productService } from "@/services/product.service";
import { categoryService } from "@/services/category.service";
import { warehouseService } from "@/services/warehouse.service";
import { branchService } from "@/services/branch.service";
import { productBatchService } from "@/services/productBatch.service";
import { ApiError } from "@/services/api-error";
import type { Warehouse } from "@/types/api";
import type { Product } from "@/types/inventory";

const WAREHOUSE = "wh1";
const OTHER_WAREHOUSE = "wh2";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: "p1",
    isConsignment: false,
    isPreorder: false,
    sku: "SHAMPOO",
    name: "Shampoo Anjing",
    productType: "standalone",
    parentId: null,
    variantAxes: [],
    variantAttributes: null,
    bundleConfig: null,
    barcode: null,
    minStock: 0,
    hasExpiry: false,
    categoryId: "c1",
    unit: "botol",
    sellPrice: "45000.0000",
    hppAvg: "30000.0000",
    isActive: true,
    deletedAt: null,
    stockByWarehouse: [],
    ...overrides,
  };
}

const BRANCH = "b1";
const OTHER_BRANCH = "b2";

function warehouse(
  id: string,
  name: string,
  isActive = true,
  defaultBranchId: string | null = null,
): Warehouse {
  return {
    _id: id,
    tenantId: "t1",
    name,
    defaultBranchId,
    address: null,
    location: { lat: null, lng: null, source: "manual" },
    picName: null,
    picPhone: null,
    isActive,
    isDefault: false,
    deletedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

/**
 * `branchless` puts the SECOND warehouse outside any branch — a bazaar location,
 * which PCR-019 makes a legitimate state rather than bad data.
 */
function mockLookups({ branchless = false } = {}) {
  jest.spyOn(categoryService, "list").mockResolvedValue({
    items: [
      {
        _id: "c1",
        tenantId: "t1",
        kind: "product",
        isActive: true,
        name: "Makanan",
        description: null,
        image: null,
        parentId: null,
        parent: null,
        deletedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });
  jest.spyOn(branchService, "list").mockResolvedValue({
    items: [
      { _id: BRANCH, name: "Cabang Timur" },
      { _id: OTHER_BRANCH, name: "Cabang Barat" },
    ],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  } as never);
  return jest.spyOn(warehouseService, "list").mockResolvedValue({
    items: [
      warehouse(WAREHOUSE, "Gudang Pusat", true, BRANCH),
      warehouse(
        OTHER_WAREHOUSE,
        "Gudang Cabang",
        false,
        branchless ? null : OTHER_BRANCH,
      ),
    ],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
}

/**
 * The read-only product page, against a mocked `/api/products`.
 *
 * What is asserted is what a reviewer would otherwise click through: that the
 * stock number shown is the field belonging to THAT product type, that a parent
 * lists its whole family with each variant's quantity, and that a closed
 * warehouse still gets named rather than dropped.
 */
describe("ProductDetail", () => {
  afterEach(() => jest.restoreAllMocks());

  it("shows the stored fields and the stock summed across warehouses", async () => {
    mockLookups();
    jest.spyOn(productService, "getById").mockResolvedValue(
      makeProduct({
        barcode: "899000111",
        minStock: 5,
        hasExpiry: true,
        stockByWarehouse: [
          { warehouseId: WAREHOUSE, qty: "8.0000" },
          { warehouseId: OTHER_WAREHOUSE, qty: "4.0000" },
        ],
      }),
    );

    renderWithAuth(<ProductDetail productId="p1" />);

    expect(await screen.findByText("Shampoo Anjing")).toBeInTheDocument();
    // Twice: beside the SKU in the header, and in the field list below it.
    expect(screen.getAllByText(/899000111/)).toHaveLength(2);
    expect(screen.getByText("Makanan")).toBeInTheDocument();
    expect(screen.getByText("Dicatat per batch")).toBeInTheDocument();
    // 8 + 4 across the two warehouses, and the value that quantity carries.
    expect(screen.getByText("12 botol")).toBeInTheDocument();
    expect(screen.getByText("Rp 360.000")).toBeInTheDocument();
  });

  it("names a closed warehouse rather than dropping the stock it still holds", async () => {
    mockLookups();
    jest.spyOn(productService, "getById").mockResolvedValue(
      makeProduct({
        stockByWarehouse: [{ warehouseId: OTHER_WAREHOUSE, qty: "4.0000" }],
      }),
    );

    renderWithAuth(<ProductDetail productId="p1" />);

    // The catalogue's own picker asks for active warehouses only; this screen
    // asks for all of them, because a product can still hold stock at one.
    expect(await screen.findByText("Gudang Cabang")).toBeInTheDocument();
  });

  it("lists every variant of a parent with its own stock, and totals them", async () => {
    mockLookups();
    const parent = makeProduct({
      _id: "parent1",
      sku: "RC",
      name: "Royal Canin Adult",
      productType: "parent",
      sellPrice: null,
      hppAvg: null,
      unit: "sak",
      variantAxes: [{ name: "Ukuran", values: ["1kg", "3kg"] }],
      variantCount: 2,
      variantStock: [{ warehouseId: WAREHOUSE, qty: "14.0000" }],
    });
    jest.spyOn(productService, "getById").mockResolvedValue(parent);
    jest.spyOn(productService, "listVariants").mockResolvedValue({
      parent,
      items: [
        makeProduct({
          _id: "v1",
          sku: "RC-1KG",
          productType: "variant",
          parentId: "parent1",
          variantAttributes: { Ukuran: "1kg" },
          sellPrice: "68000.0000",
          stockByWarehouse: [{ warehouseId: WAREHOUSE, qty: "9.0000" }],
        }),
        makeProduct({
          _id: "v2",
          sku: "RC-3KG",
          productType: "variant",
          parentId: "parent1",
          variantAttributes: { Ukuran: "3kg" },
          sellPrice: "185000.0000",
          stockByWarehouse: [{ warehouseId: WAREHOUSE, qty: "5.0000" }],
        }),
      ],
    });

    renderWithAuth(<ProductDetail productId="parent1" />);

    // Both variants, each linking to its own page — a variant is a product.
    const oneKg = await screen.findByRole("link", { name: "1kg" });
    expect(oneKg).toHaveAttribute("href", "/dashboard/inventory/products/v1");
    expect(screen.getByRole("link", { name: "3kg" })).toHaveAttribute(
      "href",
      "/dashboard/inventory/products/v2",
    );

    // The parent's own tile reports `variantStock`, which the backend computed;
    // the table's footer adds the rows up to the same number.
    expect(screen.getByText("14 sak")).toBeInTheDocument();
    expect(screen.getByText("Varian (2)")).toBeInTheDocument();
    expect(screen.getByText("Rp 185.000")).toBeInTheDocument();
    // The axes that produced those combinations are on the page too.
    expect(screen.getByText("Ukuran")).toBeInTheDocument();
  });

  it("shows a dash for a parent that carries no SKU", async () => {
    // A parent holds no stock, carries no price and is never scanned — the code
    // is on its variants. A blank line here reads as a rendering bug; "—" is
    // the same answer the barcode row already gives.
    mockLookups();
    const parent = makeProduct({
      _id: "parent1",
      sku: null,
      name: "Royal Canin Adult",
      productType: "parent",
      sellPrice: null,
      hppAvg: null,
      variantAxes: [{ name: "Ukuran", values: ["1kg"] }],
      variantCount: 1,
      variantStock: [],
    });
    jest.spyOn(productService, "getById").mockResolvedValue(parent);
    jest
      .spyOn(productService, "listVariants")
      .mockResolvedValue({ parent, items: [] });

    renderWithAuth(<ProductDetail productId="parent1" />);

    await screen.findByText("Royal Canin Adult");
    // The header line and the "Informasi produk" row — both, and neither blank.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("names the family a variant belongs to instead of its parent id", async () => {
    mockLookups();
    const getById = jest
      .spyOn(productService, "getById")
      .mockImplementation(async (id: string) =>
        id === "parent1"
          ? makeProduct({
              _id: "parent1",
              name: "Royal Canin Adult",
              productType: "parent",
            })
          : makeProduct({
              _id: "v1",
              sku: "RC-1KG",
              productType: "variant",
              parentId: "parent1",
              variantAttributes: { Ukuran: "1kg" },
            }),
      );

    renderWithAuth(<ProductDetail productId="v1" />);

    const link = await screen.findByRole("link", { name: "Royal Canin Adult" });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/inventory/products/parent1",
    );
    expect(getById).toHaveBeenCalledWith("parent1");
  });

  it("offers the edit form only to a role that may update products", async () => {
    mockLookups();
    jest.spyOn(productService, "getById").mockResolvedValue(makeProduct());

    renderWithAuth(<ProductDetail productId="p1" />, {
      isSuperAdmin: false,
      permissions: [{ feature: "products", actions: ["read"] }],
    });

    await screen.findByText("Shampoo Anjing");
    expect(
      screen.queryByRole("link", { name: "Ubah produk" }),
    ).not.toBeInTheDocument();
  });

  it("reports the server's refusal rather than an empty page", async () => {
    mockLookups();
    jest
      .spyOn(productService, "getById")
      .mockRejectedValue(new ApiError("Product not found", 404));

    renderWithAuth(<ProductDetail productId="p1" />);

    expect(await screen.findByText("Product not found")).toBeInTheDocument();
  });

  /**
   * PCR-010's "grouped by branch di UI". A warehouse belongs to a branch by soft
   * default, so the grouping has to survive one belonging to none.
   */
  describe("stock grouped by branch", () => {
    it("puts each warehouse under the branch it belongs to", async () => {
      mockLookups();
      jest.spyOn(productService, "getById").mockResolvedValue(
        makeProduct({
          stockByWarehouse: [
            { warehouseId: WAREHOUSE, qty: "8.0000" },
            { warehouseId: OTHER_WAREHOUSE, qty: "4.0000" },
          ],
        }),
      );

      renderWithAuth(<ProductDetail productId="p1" />);
      await screen.findByText("Shampoo Anjing");

      expect(await screen.findByText("Cabang Timur")).toBeInTheDocument();
      expect(screen.getByText("Cabang Barat")).toBeInTheDocument();
    });

    /**
     * `defaultBranchId` is nullable by design (PCR-019) — a bazaar warehouse
     * belongs to none. Dropping it would hide the stock; the heading names it.
     */
    it("collects a branchless warehouse under 'Tanpa cabang'", async () => {
      mockLookups({ branchless: true });
      jest.spyOn(productService, "getById").mockResolvedValue(
        makeProduct({
          stockByWarehouse: [
            { warehouseId: WAREHOUSE, qty: "8.0000" },
            { warehouseId: OTHER_WAREHOUSE, qty: "4.0000" },
          ],
        }),
      );

      renderWithAuth(<ProductDetail productId="p1" />);
      await screen.findByText("Shampoo Anjing");

      expect(await screen.findByText("Tanpa cabang")).toBeInTheDocument();
      // The row itself survives — that is the point of not dropping it.
      expect(screen.getByText("Gudang Cabang")).toBeInTheDocument();
    });

    /**
     * A grouping that groups nothing is noise: a single-branch tenant would get
     * a heading above every row saying the same thing.
     */
    it("renders no heading when everything is in one branch", async () => {
      mockLookups();
      jest.spyOn(productService, "getById").mockResolvedValue(
        makeProduct({
          stockByWarehouse: [{ warehouseId: WAREHOUSE, qty: "8.0000" }],
        }),
      );

      renderWithAuth(<ProductDetail productId="p1" />);
      await screen.findByText("Shampoo Anjing");

      expect(screen.queryByText("Cabang Timur")).not.toBeInTheDocument();
    });
  });

  /**
   * PCR-013's "tab Batch + hari ke expired", on the product it is about.
   */
  describe("the batch panel", () => {
    it("lists the lots still holding stock, with their expiry", async () => {
      mockLookups();
      jest.spyOn(productService, "getById").mockResolvedValue(
        makeProduct({
          hasExpiry: true,
          stockByWarehouse: [{ warehouseId: WAREHOUSE, qty: "8.0000" }],
        }),
      );
      jest.spyOn(productBatchService, "list").mockResolvedValue({
        items: [
          {
            _id: "b1",
            batchCode: "RC-2608",
            warehouseName: "Gudang Pusat",
            qtyRemaining: "8.0000",
            expiryDate: "2027-08-01T00:00:00.000Z",
          },
        ],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      } as never);

      renderWithAuth(<ProductDetail productId="p1" />);

      expect(await screen.findByText("RC-2608")).toBeInTheDocument();
      // Only lots with something left — an emptied one is history the stock card
      // tells better, with the movement that emptied it.
      expect(productBatchService.list).toHaveBeenCalledWith(
        expect.objectContaining({ productId: "p1", hasRemaining: true }),
      );
    });

    /**
     * A product that does not expire still has one internal lot per receipt —
     * plumbing the API creates so quantities have somewhere to live. Showing it
     * to somebody who never asked about batches is noise.
     */
    it("is absent on a product that does not expire", async () => {
      mockLookups();
      jest.spyOn(productService, "getById").mockResolvedValue(
        makeProduct({
          hasExpiry: false,
          stockByWarehouse: [{ warehouseId: WAREHOUSE, qty: "8.0000" }],
        }),
      );
      const list = jest.spyOn(productBatchService, "list");

      renderWithAuth(<ProductDetail productId="p1" />);
      await screen.findByText("Shampoo Anjing");

      expect(screen.queryByText(/batch & kedaluwarsa/i)).not.toBeInTheDocument();
      expect(list).not.toHaveBeenCalled();
    });

    // `productBatches:read` is its own grant, and a request that 403s is one
    // that should not have been made.
    it("is withheld, and asks nothing, without productBatches:read", async () => {
      mockLookups();
      jest.spyOn(productService, "getById").mockResolvedValue(
        makeProduct({
          hasExpiry: true,
          stockByWarehouse: [{ warehouseId: WAREHOUSE, qty: "8.0000" }],
        }),
      );
      const list = jest.spyOn(productBatchService, "list");

      renderWithAuth(<ProductDetail productId="p1" />, {
        isSuperAdmin: false,
        permissions: [
          { feature: "products", actions: ["read"] },
          { feature: "warehouses", actions: ["read"] },
          { feature: "categories", actions: ["read"] },
        ],
      });
      await screen.findByText("Shampoo Anjing");

      expect(screen.queryByText(/batch & kedaluwarsa/i)).not.toBeInTheDocument();
      expect(list).not.toHaveBeenCalled();
    });
  });

  /**
   * The friction this closes: the stock card is a ledger of ONE product at ONE
   * warehouse, and the user is already looking at that row. Without the link
   * they land on a screen still asking them which pair they meant.
   */
  describe("the stock card link", () => {
    it("carries both ids, per warehouse row", async () => {
      mockLookups();
      jest.spyOn(productService, "getById").mockResolvedValue(
        makeProduct({
          stockByWarehouse: [
            { warehouseId: WAREHOUSE, qty: "8.0000" },
            { warehouseId: OTHER_WAREHOUSE, qty: "4.0000" },
          ],
        }),
      );

      renderWithAuth(<ProductDetail productId="p1" />);
      await screen.findByText("Shampoo Anjing");

      const links = screen.getAllByRole("link", { name: /kartu stok/i });
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute(
        "href",
        `/dashboard/inventory/stock-card/p1?warehouseId=${WAREHOUSE}`,
      );
      expect(links[1]).toHaveAttribute(
        "href",
        `/dashboard/inventory/stock-card/p1?warehouseId=${OTHER_WAREHOUSE}`,
      );
    });

    // A link that leads to access-denied is worse than no link.
    it("is withheld from a role without stockMovements:read", async () => {
      mockLookups();
      jest.spyOn(productService, "getById").mockResolvedValue(
        makeProduct({
          stockByWarehouse: [{ warehouseId: WAREHOUSE, qty: "8.0000" }],
        }),
      );

      renderWithAuth(<ProductDetail productId="p1" />, {
        isSuperAdmin: false,
        permissions: [{ feature: "products", actions: ["read"] }],
      });
      await screen.findByText("Shampoo Anjing");

      expect(
        screen.queryByRole("link", { name: /kartu stok/i }),
      ).not.toBeInTheDocument();
    });

    /**
     * Neither type owns a ledger: a parent's quantity is its variants' and a
     * bundle's is its components'. A link would open an empty stock card and
     * read as a bug in the ledger rather than as a property of the type.
     */
    it("is absent on a parent, which holds no stock of its own", async () => {
      mockLookups();
      const parent = makeProduct({
        productType: "parent",
        sellPrice: null,
        // A parent's quantity is reported as its variants' totals, which is
        // exactly the number a stock card could not explain.
        variantStock: [{ warehouseId: WAREHOUSE, qty: "8.0000" }],
      });
      jest.spyOn(productService, "getById").mockResolvedValue(parent);
      // The detail fetches the family for a parent; without this the screen
      // renders "Unable to reach the server" instead of the product.
      jest
        .spyOn(productService, "listVariants")
        .mockResolvedValue({ parent, items: [] });

      renderWithAuth(<ProductDetail productId="p1" />);
      await screen.findByText("Shampoo Anjing");

      expect(
        screen.queryByRole("link", { name: /kartu stok/i }),
      ).not.toBeInTheDocument();
    });
  });
});
