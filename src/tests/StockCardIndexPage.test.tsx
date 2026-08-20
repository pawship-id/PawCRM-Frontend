import StockCardIndexPage from "@/app/(dashboard)/dashboard/inventory/stock-card/page";

const redirect = jest.fn();
jest.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
}));

/**
 * The compatibility shim on the stock card's index route.
 *
 * `?productId=&warehouseId=` used to BE the stock card — a documented,
 * bookmarkable address that a product detail linked into. The card moved to its
 * own segment, so the old address is forwarded rather than quietly landing on a
 * list of every product. Every link inside the app was updated too; this is for
 * the ones outside it.
 */
describe("Kartu stok index page", () => {
  beforeEach(() => redirect.mockClear());

  it("forwards a legacy deep link to the product's card", async () => {
    await StockCardIndexPage({
      searchParams: Promise.resolve({ productId: "p1", warehouseId: "wh1" }),
    });

    expect(redirect).toHaveBeenCalledWith(
      "/dashboard/inventory/stock-card/p1?warehouseId=wh1",
    );
  });

  // Half a link is still a link: the nav and a hand-typed URL name no shelf, and
  // the card fills that in from the first warehouse.
  it("forwards a link that names only the product", async () => {
    await StockCardIndexPage({
      searchParams: Promise.resolve({ productId: "p1" }),
    });

    expect(redirect).toHaveBeenCalledWith("/dashboard/inventory/stock-card/p1");
  });

  it("renders the index when nothing is named", async () => {
    await StockCardIndexPage({ searchParams: Promise.resolve({}) });

    expect(redirect).not.toHaveBeenCalled();
  });
});
