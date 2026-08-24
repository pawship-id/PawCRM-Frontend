import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FULL_REACH_USER, renderWithAuth } from "./helpers/renderWithAuth";
import { StockProductsScreen } from "@/features/inventory";
import { StockProductsTable } from "@/features/inventory/components/StockProductsTable";
import { productService } from "@/services/product.service";
import { categoryService } from "@/services/category.service";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import type { PageResult, User, Warehouse } from "@/types/api";
import type { Product } from "@/types/inventory";

/**
 * The stock card's index, against mocked services.
 *
 * WHAT THESE TESTS ARE FOR. This screen exists because the card used to fill a
 * product dropdown by paging the whole catalogue, so the cases that matter are
 * the ones that would let that come back or quietly go wrong:
 *
 *  1. the QUERY it sends — `holdsStock` alone, never beside the two selectors
 *     the API refuses it with, and the search reaching the server rather than
 *     filtering a page;
 *  2. a VARIANT is its own row, since those are exactly the rows a stock card
 *     is written for and the catalogue hides them;
 *  3. the quantity and the link belong to the SELECTED warehouse — and under
 *     "semua gudang" the row says how many locations its total came from,
 *     because no card can show a cross-warehouse figure;
 *  4. the caption names WHOSE gudang the figures cover — the API narrows
 *     `stockByWarehouse` to the caller's own shelves, and a caption saying
 *     "semua gudang" to somebody who reaches two of forty describes a different
 *     number than the one on screen;
 *  5. no `products:read` asks for nothing.
 *
 * The Radix selects are deliberately not driven — jsdom cannot do their pointer
 * protocol. The screen's default scope (every warehouse) is asserted through the
 * screen; one chosen warehouse is asserted on the table, which is where that
 * prop is actually read.
 */
const WAREHOUSE = "wh1";
const OTHER_WAREHOUSE = "wh2";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: "p1",
    isConsignment: false,
    isPreorder: false,
    sku: "RC-3KG",
    name: "Royal Canin Adult 3kg",
    productType: "standalone",
    parentId: null,
    variantAxes: [],
    variantAttributes: null,
    bundleConfig: null,
    barcode: null,
    minStock: 0,
    hasExpiry: false,
    categoryId: "c1",
    unit: "sak",
    sellPrice: "250000.0000",
    hppAvg: "200000.0000",
    isActive: true,
    deletedAt: null,
    stockByWarehouse: [{ warehouseId: WAREHOUSE, qty: "12.0000" }],
    ...overrides,
  };
}

function warehouse(
  id: string,
  name: string,
  // Null is the SHARED warehouse, which every account with any branch reaches —
  // the default here because most of these tests are not about the scope. A
  // scope test names a branch, which is what makes a warehouse refusable.
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
    isActive: true,
    isDefault: id === WAREHOUSE,
    deletedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

function page<T>(items: T[], total = items.length): PageResult<T> {
  return {
    items,
    pagination: {
      page: 1,
      limit: 20,
      total,
      totalPages: Math.ceil(total / 20),
    },
  };
}

/** The three calls the screen makes on mount, all resolving. */
function mockHappyPath(products: Product[], total = products.length) {
  jest
    .spyOn(categoryService, "list")
    .mockResolvedValue(page([{ _id: "c1", name: "Makanan" }]) as never);
  jest
    .spyOn(warehouseService, "list")
    .mockResolvedValue(
      page([
        warehouse(WAREHOUSE, "Gudang Pusat"),
        warehouse(OTHER_WAREHOUSE, "Gudang Cabang"),
      ]) as never,
    );
  jest.spyOn(productService, "list").mockResolvedValue(page(products, total));
}

afterEach(() => jest.restoreAllMocks());

describe("StockProductsScreen", () => {
  describe("the query it sends", () => {
    /**
     * `holdsStock` ALONE. The API refuses it beside `productType` or
     * `excludeVariants` with a 400 — they select rows the same way — so sending
     * two would break the screen outright rather than merely widen it.
     */
    it("asks for stock-holding products, and for nothing else that selects rows", async () => {
      mockHappyPath([makeProduct()]);

      renderWithAuth(<StockProductsScreen />);

      await waitFor(() => expect(productService.list).toHaveBeenCalled());
      const query = jest.mocked(productService.list).mock.calls[0][0];
      expect(query).toMatchObject({ holdsStock: true });
      expect(query).not.toHaveProperty("excludeVariants");
      expect(query).not.toHaveProperty("productType");
    });

    // The catalogue is searched by the SERVER, which is the whole point of the
    // screen: a page of twenty is never all a tenant has.
    it("sends the search term to the server", async () => {
      mockHappyPath([makeProduct()]);

      const user = userEvent.setup();
      renderWithAuth(<StockProductsScreen />);

      await screen.findByText("Royal Canin Adult 3kg");
      await user.type(await screen.findByLabelText("Cari produk"), "royal");

      await waitFor(() =>
        expect(productService.list).toHaveBeenCalledWith(
          expect.objectContaining({ search: "royal" }),
        ),
      );
    });
  });

  /**
   * A VARIANT IS A ROW HERE, unlike in the catalogue, which folds it behind its
   * parent. A stock card is written per variant — a parent holds none — so
   * these are exactly the rows the screen exists to open.
   */
  it("lists a variant as its own row, under the name the server composed", async () => {
    mockHappyPath([
      makeProduct({
        _id: "v1",
        productType: "variant",
        parentId: "parent1",
        name: "Royal Canin Adult — 3kg / Chicken",
        sku: "RC-3KG-CHICKEN",
        variantAttributes: { Ukuran: "3kg", Rasa: "Chicken" },
      }),
    ]);

    renderWithAuth(<StockProductsScreen />);

    expect(
      await screen.findByText("Royal Canin Adult — 3kg / Chicken"),
    ).toBeInTheDocument();
  });

  /**
   * THE DEFAULT SCOPE IS EVERY WAREHOUSE, like the catalogue and the hub: "how
   * much of this do we have" is what somebody arriving at a list is asking.
   */
  describe("semua gudang, the default", () => {
    function spread() {
      return makeProduct({
        stockByWarehouse: [
          { warehouseId: WAREHOUSE, qty: "12.0000" },
          { warehouseId: OTHER_WAREHOUSE, qty: "8.0000" },
        ],
      });
    }

    it("totals the stock across locations", async () => {
      mockHappyPath([spread()]);

      renderWithAuth(<StockProductsScreen />);

      const row = (await screen.findByText("Royal Canin Adult 3kg")).closest(
        "tr",
      )!;
      expect(within(row).getByText("20")).toBeInTheDocument();
    });

    /**
     * A TOTAL IS NOT A SHELF. Stock cannot be pooled — twenty split two ways is
     * not twenty anywhere — so the row says how many locations it came from
     * rather than letting the figure read as something pickable.
     */
    it("says how many locations the total came from", async () => {
      mockHappyPath([spread()]);

      renderWithAuth(<StockProductsScreen />);

      const row = (await screen.findByText("Royal Canin Adult 3kg")).closest(
        "tr",
      )!;
      expect(within(row).getByText("di 2 gudang")).toBeInTheDocument();
    });

    /**
     * AND IT NAMES NO WAREHOUSE. There is no single shelf behind a total, so the
     * card is left to pick one — it opens on the largest holding rather than
     * being handed a warehouse the row was not describing.
     */
    it("links without a warehouse", async () => {
      mockHappyPath([spread()]);

      renderWithAuth(<StockProductsScreen />);

      const link = await screen.findByRole("link", {
        name: "Kartu stok Royal Canin Adult 3kg",
      });
      expect(link).toHaveAttribute(
        "href",
        "/dashboard/inventory/stock-card/p1",
      );
    });
  });

  /**
   * "SEMUA GUDANG" IS EVERY GUDANG THIS ACCOUNT REACHES — AND THE SERVER DECIDES
   * WHICH.
   *
   * `GET /api/products` used to send `stockByWarehouse` for every location
   * whoever was asking, so a storekeeper offered one shop in the picker read the
   * whole tenant's stock the moment they left the select on its default. The API
   * narrows the field now (PawCRM-Backend, `#stockScope`), which is the half a
   * screen could not have provided: a client filter hides a number that has
   * already been sent.
   *
   * What is left here is the SENTENCE — that the caption describes the set the
   * figures actually cover, and that an account granted no warehouse can tell
   * why its table reads zero.
   */
  describe("semua gudang, and whose gudang that is", () => {
    const BRANCH = "b1";
    const OTHER_BRANCH = "b2";

    /** Reaches BRANCH, and therefore WAREHOUSE, and nothing else. */
    const scopedUser: User = {
      ...FULL_REACH_USER,
      allBranches: false,
      branchAccess: [BRANCH],
      warehouseAccess: [
        { branchId: BRANCH, allWarehouses: true, warehouseIds: [] },
      ],
    };

    /** Both warehouses owned by a branch, so the scope can refuse one. */
    function mockBranchedWarehouses(products: Product[]) {
      mockHappyPath(products);
      jest
        .spyOn(warehouseService, "list")
        .mockResolvedValue(
          page([
            warehouse(WAREHOUSE, "Gudang Pusat", BRANCH),
            warehouse(OTHER_WAREHOUSE, "Gudang Cabang", OTHER_BRANCH),
          ]) as never,
        );
    }

    function spread() {
      return makeProduct({
        stockByWarehouse: [
          { warehouseId: WAREHOUSE, qty: "12.0000" },
          { warehouseId: OTHER_WAREHOUSE, qty: "8.0000" },
        ],
      });
    }

    it("says the figures are for the gudang this account can reach", async () => {
      mockBranchedWarehouses([spread()]);

      renderWithAuth(<StockProductsScreen />, { user: scopedUser });

      expect(
        await screen.findByText(/untuk semua gudang yang bisa Anda akses/i),
      ).toBeInTheDocument();
    });

    it("says plain 'semua gudang' for an account that reaches every branch", async () => {
      mockBranchedWarehouses([spread()]);

      renderWithAuth(<StockProductsScreen />);

      const caption = await screen.findByText(/untuk semua gudang/i);
      expect(caption).not.toHaveTextContent(/bisa Anda akses/i);
    });

    /**
     * THE ROWS ARE NOT NARROWED A SECOND TIME. The server has already answered
     * "which shelves are yours"; re-deciding it here would be a second copy of
     * the rule over the same number, and the direction it would disagree in —
     * hiding a shelf the account does reach — is the one nobody reports.
     */
    it("renders every row the API sent, without re-deciding whose they are", async () => {
      mockBranchedWarehouses([spread()]);

      renderWithAuth(<StockProductsScreen />, { user: scopedUser });

      const row = (await screen.findByText("Royal Canin Adult 3kg")).closest(
        "tr",
      )!;
      await waitFor(() =>
        expect(within(row).getByText("20")).toBeInTheDocument(),
      );
      expect(within(row).getByText("di 2 gudang")).toBeInTheDocument();
    });

    /**
     * A ROLE GRANTED NO WAREHOUSE reads zero — the API sends it no stock rows —
     * and a table of zeroes with no explanation is a bug report rather than a
     * task for an admin.
     */
    it("explains an all-zero table to a role granted no warehouse", async () => {
      mockBranchedWarehouses([makeProduct({ stockByWarehouse: [] })]);

      renderWithAuth(<StockProductsScreen />, {
        user: {
          ...FULL_REACH_USER,
          allBranches: false,
          branchAccess: [OTHER_BRANCH],
          warehouseAccess: [
            { branchId: OTHER_BRANCH, allWarehouses: false, warehouseIds: [] },
          ],
        },
      });

      expect(
        await screen.findByText(/belum diberi akses ke gudang mana pun/i),
      ).toBeInTheDocument();
    });
  });

  /**
   * One chosen warehouse, asserted on the table — the Radix select cannot be
   * driven in jsdom, and the prop is what the screen would be setting.
   */
  describe("one chosen warehouse", () => {
    function renderTable(product: Product) {
      return renderWithAuth(
        <StockProductsTable
          products={[product]}
          warehouseId={WAREHOUSE}
          search=""
          loading={false}
        />,
      );
    }

    it("reads that warehouse's quantity, not the total", () => {
      renderTable(
        makeProduct({
          stockByWarehouse: [
            { warehouseId: WAREHOUSE, qty: "12.0000" },
            { warehouseId: OTHER_WAREHOUSE, qty: "500.0000" },
          ],
        }),
      );

      const row = screen.getByText("Royal Canin Adult 3kg").closest("tr")!;
      expect(within(row).getByText("12")).toBeInTheDocument();
      expect(within(row).queryByText(/512/)).not.toBeInTheDocument();
      // The spread note belongs to a total; there is nothing to spread here.
      expect(within(row).queryByText(/di \d+ gudang/)).not.toBeInTheDocument();
    });

    // No stock row at this warehouse is zero, not blank: the backend writes one
    // only after the first movement, so "never traded here" and "traded down to
    // nothing" are the same statement.
    it("reads zero where the product has no row at this warehouse", () => {
      renderTable(
        makeProduct({
          stockByWarehouse: [{ warehouseId: OTHER_WAREHOUSE, qty: "9.0000" }],
        }),
      );

      const row = screen.getByText("Royal Canin Adult 3kg").closest("tr")!;
      expect(within(row).getByText("0")).toBeInTheDocument();
    });

    /**
     * THE LINK CARRIES BOTH IDS. A card is one product at one warehouse, so a
     * link naming only the product would land the user on a different shelf's
     * number than the one they just read.
     */
    it("links to the card for this product at this warehouse", () => {
      renderTable(makeProduct());

      expect(
        screen.getByRole("link", { name: "Kartu stok Royal Canin Adult 3kg" }),
      ).toHaveAttribute(
        "href",
        `/dashboard/inventory/stock-card/p1?warehouseId=${WAREHOUSE}`,
      );
    });
  });

  // The pager describes the SERVER's total, never the rows on screen — nothing
  // on this screen filters a page after it arrives.
  it("pages on the total the server reports", async () => {
    mockHappyPath([makeProduct()], 45);

    renderWithAuth(<StockProductsScreen />);

    expect(await screen.findByText(/45 produk/)).toBeInTheDocument();
  });

  it("shows the list's own error", async () => {
    jest
      .spyOn(categoryService, "list")
      .mockResolvedValue(page([{ _id: "c1", name: "Makanan" }]) as never);
    jest
      .spyOn(warehouseService, "list")
      .mockResolvedValue(page([warehouse(WAREHOUSE, "Gudang Pusat")]) as never);
    jest
      .spyOn(productService, "list")
      .mockRejectedValue(new ApiError("Server sedang sibuk.", 500));

    renderWithAuth(<StockProductsScreen />);

    expect(await screen.findByText("Server sedang sibuk.")).toBeInTheDocument();
  });

  /**
   * `products:read` IS A SEPARATE GRANT from the `stockMovements:read` that puts
   * this screen on the nav. A role holding only the latter is told so — and the
   * request is never fired, because a rejection guaranteed in advance is not
   * worth a round trip.
   */
  it("asks for nothing without products:read", async () => {
    mockHappyPath([makeProduct()]);

    renderWithAuth(<StockProductsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "stockMovements", actions: ["read"] }],
    });

    expect(
      await screen.findByText("Daftar produk tidak bisa ditampilkan"),
    ).toBeInTheDocument();
    expect(productService.list).not.toHaveBeenCalled();
  });
});
