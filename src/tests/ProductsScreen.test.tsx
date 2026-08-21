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

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// Mutations fire a SweetAlert2 toast on success; mock the library so no real
// dialog is created during the test.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

const WAREHOUSE = "wh1";
const OTHER_WAREHOUSE = "wh2";
const THIRD_WAREHOUSE = "wh3";

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
  jest.spyOn(warehouseService, "list").mockResolvedValue({
    items: [
      warehouse(WAREHOUSE, "Gudang Pusat"),
      warehouse(OTHER_WAREHOUSE, "Gudang Cabang"),
      warehouse(THIRD_WAREHOUSE, "Gudang Timur"),
    ],
    pagination: { page: 1, limit: 100, total: 3, totalPages: 1 },
  });
}

/** A product stocked in all three warehouses: 14 + 3 + 5, so every subset differs. */
function stockedEverywhere() {
  return makeProduct({
    stockByWarehouse: [
      { warehouseId: WAREHOUSE, qty: "14.0000" },
      { warehouseId: OTHER_WAREHOUSE, qty: "3.0000" },
      { warehouseId: THIRD_WAREHOUSE, qty: "5.0000" },
    ],
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
 * Opens the one filter panel and returns it.
 *
 * EVERY filter lives inside it, so each filter assertion starts here — which is
 * also the cheapest way to notice if the button ever stops being reachable. The
 * trigger's text carries a count (`Filter (2)`); its accessible name does not,
 * so it is found by the stable half.
 */
async function openFilters(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Filter" }));
  return screen.findByRole("dialog");
}

/** The warehouse picker's trigger, whose name doubles as its current value. */
function warehouseTrigger() {
  return screen.getByRole("button", { name: /Stok gudang/ });
}

/**
 * Ticks warehouses in the picker inside the panel, then applies.
 *
 * ONE OPEN FOR ALL OF THEM, which is the behaviour being exercised as much as
 * asserted: a menu that closed after each tick would need one trip per
 * warehouse. Escape shuts the menu without shutting the panel under it — Radix
 * stops the key at the topmost layer — and Terapkan commits and closes, which
 * also matters because Radix marks the rest of the page aria-hidden while
 * either is up, so the table is unreachable until both are down.
 */
async function tickWarehouses(user: UserEvent, ...names: string[]) {
  const panel = await openFilters(user);
  await user.click(warehouseTrigger());
  const menu = screen.getByRole("menu");

  for (const name of names) {
    await user.click(within(menu).getByRole("menuitemcheckbox", { name }));
  }

  await user.keyboard("{Escape}");
  await user.click(within(panel).getByRole("button", { name: "Terapkan" }));
}

/** Reads the warehouse trigger's label back, then puts the panel away. */
async function expectWarehouseLabel(user: UserEvent, label: string) {
  await openFilters(user);
  expect(warehouseTrigger()).toHaveTextContent(label);
  await user.keyboard("{Escape}");
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
    const user = userEvent.setup();
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
          { warehouseId: OTHER_WAREHOUSE, qty: "2.0000", limitedBy: "p1" },
        ],
      }),
      makeProduct(),
    ]);

    renderWithAuth(<ProductsScreen />);

    expect(await screen.findByText("bisa dibuat")).toBeInTheDocument();
    // Spread over two locations the figure is a sum, and components cannot be
    // pooled between them — so the screen says how it was reached instead of
    // naming a cap that only holds at one of them.
    expect(screen.getByText("dijumlah per gudang")).toBeInTheDocument();
    expect(
      screen.queryByText("dibatasi Shampoo Anjing"),
    ).not.toBeInTheDocument();

    await tickWarehouses(user, "Gudang Pusat");

    expect(
      await screen.findByText("dibatasi Shampoo Anjing"),
    ).toBeInTheDocument();
    expect(screen.queryByText("dijumlah per gudang")).not.toBeInTheDocument();
  });

  it("opens on every warehouse added up, so the total is not one location's", async () => {
    const user = userEvent.setup();
    const list = mockList([stockedEverywhere()]);

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");

    // Defaulting to whichever warehouse sorted first would print "14" here —
    // a number that reads as the total while being short by everything held
    // anywhere else.
    expect(await screen.findByText("22")).toBeInTheDocument();
    await expectWarehouseLabel(user, "Semua gudang");
    // The summing is a read of the rows already on the page, not a request for
    // an aggregate the backend would have to compute.
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("re-reads the stock column for the warehouses ticked, without refetching", async () => {
    const user = userEvent.setup();
    const list = mockList([stockedEverywhere()]);

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");
    expect(screen.getByText("22")).toBeInTheDocument();

    await tickWarehouses(user, "Gudang Cabang");
    expect(await screen.findByText("3")).toBeInTheDocument();
    await expectWarehouseLabel(user, "Gudang Cabang");

    await tickWarehouses(user, "Gudang Cabang", "Gudang Pusat");
    expect(await screen.findByText("14")).toBeInTheDocument();

    // Every product already carries every warehouse's quantity, so ticking one
    // is a read of what is on the page.
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("adds up several warehouses at once — the point of ticking more than one", async () => {
    const user = userEvent.setup();
    mockList([stockedEverywhere()]);

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");

    // One trip through the menu for both, because it stays open as they are
    // ticked. 14 + 5, and deliberately not the 22 that "all" would give — a
    // subset has to be a real subset for the control to be worth anything.
    await tickWarehouses(user, "Gudang Pusat", "Gudang Timur");

    expect(await screen.findByText("19")).toBeInTheDocument();
    await expectWarehouseLabel(user, "2 gudang");
  });

  it("falls back to every warehouse when the last tick is removed", async () => {
    const user = userEvent.setup();
    mockList([stockedEverywhere()]);

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");

    await tickWarehouses(user, "Gudang Pusat");
    expect(await screen.findByText("14")).toBeInTheDocument();

    // Nothing ticked cannot mean "no warehouses" — that would be a page of
    // zeros, which is never what emptying a filter is asking for.
    await tickWarehouses(user, "Gudang Pusat");
    expect(await screen.findByText("22")).toBeInTheDocument();
    await expectWarehouseLabel(user, "Semua gudang");
  });

  it('clears the selection through "Semua gudang" without unticking each one', async () => {
    const user = userEvent.setup();
    mockList([stockedEverywhere()]);

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");

    await tickWarehouses(user, "Gudang Pusat", "Gudang Timur");
    expect(await screen.findByText("19")).toBeInTheDocument();

    await tickWarehouses(user, "Semua gudang");
    expect(await screen.findByText("22")).toBeInTheDocument();
  });

  it("holds every field as a draft until Terapkan", async () => {
    const user = userEvent.setup();
    const list = mockList([makeProduct()]);

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");
    expect(list).toHaveBeenCalledTimes(1);

    const panel = await openFilters(user);
    await user.click(
      within(panel).getByRole("button", { name: "Filter status" }),
    );
    await user.click(screen.getByRole("option", { name: "Nonaktif" }));

    // The whole reason the triggers collapsed into a panel: composing a query
    // does not query. On the old bar this click alone would have re-fetched.
    expect(list).toHaveBeenCalledTimes(1);

    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ isActive: false }),
      ),
    );
  });

  it("counts what is applied on the button, so a closed panel is not a hidden filter", async () => {
    const user = userEvent.setup();
    mockList([makeProduct()]);

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");

    let panel = await openFilters(user);
    await user.click(
      within(panel).getByRole("button", { name: "Filter status" }),
    );
    await user.click(screen.getByRole("option", { name: "Aktif" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    expect(
      await screen.findByRole("button", { name: "Filter" }),
    ).toHaveTextContent("Filter (1)");

    // The ordering is deliberately not counted — every list has one, so a badge
    // that read "Filter (1)" over an unnarrowed list would train people to
    // ignore the number.
    panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Urutkan" }));
    await user.click(screen.getByRole("option", { name: "Nama A–Z" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    expect(
      await screen.findByRole("button", { name: "Filter" }),
    ).toHaveTextContent("Filter (1)");
  });

  it("opens the panel's option lists inside it, so they can be scrolled", async () => {
    const user = userEvent.setup();
    mockList([makeProduct()]);

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");

    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Urutkan" }));

    /**
     * A DOM assertion, because the bug is a DOM fact with no visible symptom
     * under jsdom: Radix locks a modal dialog with
     * `RemoveScroll shards={[content]}`, so a list portaled to `document.body`
     * sits outside the one subtree allowed to scroll and silently refuses the
     * wheel. Portaled into the panel it is inside the shard.
     *
     * Nothing about the rendered filter changes, which is exactly why this
     * needs pinning — the regression would look like nothing at all.
     */
    const list = screen.getByRole("listbox");
    expect(panel).toContainElement(list);
  });

  it("re-orders the list through the panel, by a name the API accepts", async () => {
    const user = userEvent.setup();
    const list = mockList([makeProduct()]);

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");

    // The default is stated rather than omitted: every page of a walk has to
    // agree on the ordering.
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "newest" }),
    );

    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Urutkan" }));
    await user.click(screen.getByRole("option", { name: "SKU A–Z" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "skuAsc" }),
      ),
    );
  });

  it("clears every filter in the same click on Reset, ordering included", async () => {
    const user = userEvent.setup();
    const list = mockList([makeProduct()]);

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");

    let panel = await openFilters(user);
    await user.click(
      within(panel).getByRole("button", { name: "Filter status" }),
    );
    await user.click(screen.getByRole("option", { name: "Aktif" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ isActive: true }),
      ),
    );

    // Reset never waits for Terapkan — at any level, in this app.
    panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Reset" }));

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ isActive: expect.anything() }),
      ),
    );
    // A list with no ordering is not a thing: Reset puts it back to the
    // default rather than clearing it to nothing.
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "newest" }),
    );
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
    // The create menu is a BUTTON, not a link — querying for a link here would
    // pass whether or not the gate works.
    expect(
      screen.queryByRole("button", { name: /Produk baru/ }),
    ).not.toBeInTheDocument();
  });

  it("offers the four ways in, each pointed at its own shape", async () => {
    const user = userEvent.setup();
    mockList([makeProduct()]);

    renderWithAuth(<ProductsScreen />);
    await screen.findByText("Shampoo Anjing");

    await user.click(screen.getByRole("button", { name: /Produk baru/ }));
    const menu = screen.getByRole("menu");

    // `?type=` is the point of this menu: picking Bundle has to open the bundle
    // form, not the mode picker with the answer already known. Before it was
    // wired the param was read by nothing, so every entry landed on standalone.
    const routes: Array<[string, string]> = [
      ["Satuan", "/dashboard/inventory/products/new?type=standalone"],
      ["Varian", "/dashboard/inventory/products/new?type=variants"],
      ["Bundle", "/dashboard/inventory/products/new?type=bundle"],
      ["Import", "/dashboard/inventory/products/import"],
    ];

    for (const [label, href] of routes) {
      expect(
        within(menu).getByRole("menuitem", { name: new RegExp(`^${label}`) }),
      ).toHaveAttribute("href", href);
    }

    // Each row explains its shape — the whole reason three buttons became one.
    expect(
      within(menu).getByText("Satu barang, satu harga, satu stok."),
    ).toBeInTheDocument();
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
    expect(
      within(menu).getByRole("menuitem", { name: "Edit" }),
    ).toHaveAttribute("href", "/dashboard/inventory/products/p1/edit");
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
