import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { ProductsScreen } from "@/features/inventory";
import { productService } from "@/services/product.service";
import { categoryService } from "@/services/category.service";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import type { PageResult, Warehouse } from "@/types/api";
import type { Product } from "@/types/inventory";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// Mutations fire a SweetAlert2 toast on success; mock the library so no real
// dialog is created during the test.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

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

/** A full Warehouse document — the catalogue only reads a few of its fields. */
function warehouse(id: string, name: string): Warehouse {
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

function page(items: Product[]): PageResult<Product> {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
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
  jest.spyOn(warehouseService, "list").mockResolvedValue({
    items: [
      warehouse(WAREHOUSE, "Gudang Pusat"),
      warehouse(OTHER_WAREHOUSE, "Gudang Cabang"),
    ],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
}

function mockList(items: Product[]) {
  return jest.spyOn(productService, "list").mockResolvedValue(page(items));
}

/**
 * Opens a row's kebab menu. Every row action lives behind it, so each action
 * assertion starts here — which is also the cheapest way to notice if the
 * trigger ever stops being reachable by its accessible name.
 */
async function openRowMenu(user: UserEvent, name = "Shampoo Anjing") {
  await user.click(screen.getByRole("button", { name: `Aksi untuk ${name}` }));
  return screen.getByRole("menu");
}

/**
 * The catalogue list, against a mocked `/api/products`.
 *
 * What is asserted is what a reviewer would otherwise click through: that a
 * family is ONE row that expands, that the Stok column answers a different
 * question per product type, and that the destructive actions are gated and
 * report the server's refusal rather than a generic failure.
 */
describe("ProductsScreen", () => {
  beforeEach(() => mockLookups());
  afterEach(() => jest.restoreAllMocks());

  it("asks for top-level rows only, so a family is one row", async () => {
    const list = mockList([makeProduct()]);

    renderWithAuth(<ProductsScreen />);

    expect(await screen.findByText("Shampoo Anjing")).toBeInTheDocument();
    // Filtering variants out in the table would leave `total` counting rows the
    // user never sees, so the exclusion has to happen in the query.
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ excludeVariants: true }),
    );
  });

  it("shows the variant count the API computed, without expanding anything", async () => {
    mockList([
      makeProduct({
        _id: "parent1",
        sku: "RC",
        name: "Royal Canin Adult",
        productType: "parent",
        sellPrice: null,
        hppAvg: null,
        variantCount: 2,
        variantStock: [{ warehouseId: WAREHOUSE, qty: "14.0000" }],
      }),
    ]);

    renderWithAuth(<ProductsScreen />);

    expect(await screen.findByText("2 varian")).toBeInTheDocument();
    // The parent's own row reports its variants' total — it holds none itself.
    expect(screen.getByText("14")).toBeInTheDocument();
  });

  it("fetches a parent's variants when the row is expanded, once", async () => {
    const user = userEvent.setup();
    mockList([
      makeProduct({
        _id: "parent1",
        name: "Royal Canin Adult",
        productType: "parent",
        variantCount: 1,
      }),
    ]);
    const variants = jest
      .spyOn(productService, "listVariants")
      .mockResolvedValue({
        parent: makeProduct({ _id: "parent1", productType: "parent" }),
        items: [
          makeProduct({
            _id: "v1",
            sku: "RC-3KG",
            name: "RC 3kg",
            productType: "variant",
            parentId: "parent1",
            variantAttributes: { ukuran: "3kg" },
          }),
        ],
      });

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Royal Canin Adult");

    const expander = screen.getByRole("button", { name: "Lihat varian" });
    await user.click(expander);

    expect(await screen.findByText("3kg")).toBeInTheDocument();

    // Collapse and re-expand: the second open reads the cache.
    await user.click(screen.getByRole("button", { name: "Tutup varian" }));
    await user.click(screen.getByRole("button", { name: "Lihat varian" }));
    expect(variants).toHaveBeenCalledTimes(1);
  });

  it("labels a bundle's stock as what can be BUILT, and names the cap", async () => {
    mockList([
      makeProduct({
        _id: "b1",
        sku: "PAKET",
        name: "Paket Hemat",
        productType: "bundle",
        bundleConfig: {
          pricingMode: "fixed",
          fixedPrice: "430000.0000",
          components: [
            {
              componentType: "product",
              componentProductId: "p1",
              componentServiceId: null,
              qty: "3",
            },
          ],
        },
        bundleAvailability: [
          { warehouseId: WAREHOUSE, qty: "4.0000", limitedBy: "p1" },
        ],
      }),
      makeProduct(),
    ]);

    renderWithAuth(<ProductsScreen />);

    expect(await screen.findByText("bisa dibuat")).toBeInTheDocument();
    expect(screen.getByText("dibatasi Shampoo Anjing")).toBeInTheDocument();
  });

  it("re-reads the stock column for the warehouse chosen, without refetching", async () => {
    const user = userEvent.setup();
    const list = mockList([
      makeProduct({
        stockByWarehouse: [
          { warehouseId: WAREHOUSE, qty: "14.0000" },
          { warehouseId: OTHER_WAREHOUSE, qty: "3.0000" },
        ],
      }),
    ]);

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");
    expect(screen.getByText("14")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Gudang"));
    await user.click(await screen.findByRole("option", { name: "Gudang Cabang" }));

    expect(await screen.findByText("3")).toBeInTheDocument();
    // Every product already carries every warehouse's quantity, so switching
    // location is a read of what is on the page.
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("deletes through a confirmation, then refetches", async () => {
    const user = userEvent.setup();
    const list = mockList([makeProduct()]);
    const remove = jest
      .spyOn(productService, "remove")
      .mockResolvedValue(makeProduct({ deletedAt: "2026-08-03" }));

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");

    const menu = await openRowMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: "Hapus" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Hapus" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("shows the server's refusal verbatim — it names which guard stopped it", async () => {
    const user = userEvent.setup();
    mockList([makeProduct()]);
    jest
      .spyOn(productService, "remove")
      .mockRejectedValue(
        new ApiError(
          "Cannot delete product: it still holds stock in 2 warehouse(s)",
          409,
        ),
      );

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");

    const menu = await openRowMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: "Hapus" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Hapus" }));

    // Reworded to "could not delete", this would lose the only actionable part.
    expect(await screen.findByText(/still holds stock/i)).toBeInTheDocument();
  });

  it("offers restore, not delete, on a soft-deleted product", async () => {
    const user = userEvent.setup();
    mockList([makeProduct({ deletedAt: "2026-08-01T00:00:00.000Z" })]);

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");

    const menu = await openRowMenu(user);
    expect(
      within(menu).getByRole("menuitem", { name: "Pulihkan" }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: "Hapus" }),
    ).not.toBeInTheDocument();
    // Restoring it first is what makes editing it meaningful again.
    expect(
      within(menu).queryByRole("menuitem", { name: "Edit" }),
    ).not.toBeInTheDocument();
  });

  it("leaves a read-only role the detail entry and nothing that writes", async () => {
    const user = userEvent.setup();
    mockList([makeProduct()]);

    renderWithAuth(<ProductsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "products", actions: ["read"] }],
    });
    await screen.findByText("Shampoo Anjing");

    // The menu still opens: Detail needs only `products:read`, which is what
    // put the row on screen — so the trigger never leads to an empty menu.
    const menu = await openRowMenu(user);
    expect(
      within(menu).getByRole("menuitem", { name: "Detail" }),
    ).toHaveAttribute("href", "/dashboard/inventory/products/p1");
    expect(
      within(menu).queryByRole("menuitem", { name: "Hapus" }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Produk baru/ }),
    ).not.toBeInTheDocument();
  });

  it("points Detail and Edit at the two different routes", async () => {
    const user = userEvent.setup();
    mockList([makeProduct()]);

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");

    const menu = await openRowMenu(user);
    expect(
      within(menu).getByRole("menuitem", { name: "Detail" }),
    ).toHaveAttribute("href", "/dashboard/inventory/products/p1");
    expect(within(menu).getByRole("menuitem", { name: "Edit" })).toHaveAttribute(
      "href",
      "/dashboard/inventory/products/p1/edit",
    );
  });

  it("surfaces a failed load instead of an empty catalogue", async () => {
    jest
      .spyOn(productService, "list")
      .mockRejectedValue(new ApiError("Server error", 500));

    renderWithAuth(<ProductsScreen />);

    // An error rendered as "no products" would read as a true answer about the
    // tenant's catalogue when it is really a broken request.
    expect(await screen.findByText(/server error/i)).toBeInTheDocument();
  });

  it("says so when the reference lists fail, rather than showing empty filters", async () => {
    mockList([makeProduct()]);
    jest
      .spyOn(categoryService, "list")
      .mockRejectedValue(new ApiError("Forbidden", 403));

    renderWithAuth(<ProductsScreen />);

    expect(await screen.findByText(/forbidden/i)).toBeInTheDocument();
  });
});
