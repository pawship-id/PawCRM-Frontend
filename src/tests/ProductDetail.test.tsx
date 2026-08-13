import { screen } from "@testing-library/react";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { ProductDetail } from "@/features/inventory";
import { productService } from "@/services/product.service";
import { categoryService } from "@/services/category.service";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import type { Warehouse } from "@/types/api";
import type { Product } from "@/types/inventory";

const WAREHOUSE = "wh1";
const OTHER_WAREHOUSE = "wh2";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: "p1",
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

function warehouse(id: string, name: string, isActive = true): Warehouse {
  return {
    _id: id,
    tenantId: "t1",
    name,
    defaultBranchId: null,
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

function mockLookups() {
  jest.spyOn(categoryService, "list").mockResolvedValue({
    items: [
      {
        _id: "c1",
        tenantId: "t1",
        kind: "product",
        name: "Makanan",
        deletedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });
  return jest.spyOn(warehouseService, "list").mockResolvedValue({
    items: [
      warehouse(WAREHOUSE, "Gudang Pusat"),
      warehouse(OTHER_WAREHOUSE, "Gudang Cabang", false),
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
});
