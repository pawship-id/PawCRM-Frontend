import { screen, waitFor } from "@testing-library/react";

import { CatalogModuleHeader } from "@/features/inventory";
import { categoryService } from "@/services/category.service";
import { productService } from "@/services/product.service";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/category.service");
jest.mock("@/services/product.service");

const pathname = jest.fn(() => "/dashboard/inventory/products");
jest.mock("next/navigation", () => ({
  usePathname: () => pathname(),
}));

const mockedCategoryService = categoryService as jest.Mocked<
  typeof categoryService
>;
const mockedProductService = productService as jest.Mocked<
  typeof productService
>;

/**
 * The head of the Produk & Varian module: the tab bar that replaced the rail's
 * second row, and the counts under it.
 *
 * The variant tile is the part worth a test. It is a SUBTRACTION of two totals
 * — every row, minus the catalogue rows — and nothing on screen would look wrong
 * if the two queries were the other way round.
 */
function totalling(total: number) {
  return { items: [], pagination: { page: 1, limit: 1, total, totalPages: 1 } };
}

/** Answers the catalogue query with `families`, the unfiltered one with `all`. */
function catalogueHolds(families: number, all: number) {
  mockedProductService.list.mockImplementation((query = {}) =>
    Promise.resolve(totalling(query.excludeVariants ? families : all)),
  );
}

beforeEach(() => {
  pathname.mockReturnValue("/dashboard/inventory/products");
  catalogueHolds(248, 760);
  mockedCategoryService.list.mockResolvedValue(totalling(34));
});

describe("CatalogModuleHeader", () => {
  it("draws the module's two tabs", async () => {
    renderWithAuth(<CatalogModuleHeader />);

    expect(screen.getByRole("link", { name: "Produk" })).toHaveAttribute(
      "href",
      "/dashboard/inventory/products",
    );
    expect(screen.getByRole("link", { name: "Kategori" })).toHaveAttribute(
      "href",
      "/dashboard/inventory/categories",
    );

    await waitFor(() => expect(mockedCategoryService.list).toHaveBeenCalled());
  });

  it("marks the tab the reader is on, and only that one", async () => {
    pathname.mockReturnValue("/dashboard/inventory/categories");
    renderWithAuth(<CatalogModuleHeader />);

    expect(screen.getByRole("link", { name: "Kategori" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Produk" })).not.toHaveAttribute(
      "aria-current",
    );

    await waitFor(() => expect(mockedCategoryService.list).toHaveBeenCalled());
  });

  it("counts variants as what the catalogue view leaves out", async () => {
    renderWithAuth(<CatalogModuleHeader />);

    // 248 families on the catalogue view, 760 rows in all — so 512 of those
    // rows are the concrete items the families spread into.
    await waitFor(() => expect(screen.getByText("248")).toBeInTheDocument());
    expect(screen.getByText("512")).toBeInTheDocument();
    expect(screen.getByText("2,1 per produk")).toBeInTheDocument();
    expect(screen.getByText("34")).toBeInTheDocument();

    // Counts, not pages of rows: three small queries.
    expect(mockedProductService.list).toHaveBeenCalledWith({
      page: 1,
      limit: 1,
      excludeVariants: true,
    });
    expect(mockedProductService.list).toHaveBeenCalledWith({
      page: 1,
      limit: 1,
    });
  });

  it("never shows a negative variant count", async () => {
    // Should not happen, but the two totals are read from two requests: a
    // catalogue larger than the whole collection would otherwise print "-4".
    catalogueHolds(250, 246);
    renderWithAuth(<CatalogModuleHeader />);

    await waitFor(() => expect(screen.getByText("250")).toBeInTheDocument());
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("says a count failed rather than showing it as zero", async () => {
    mockedCategoryService.list.mockRejectedValue(new Error("network"));
    renderWithAuth(<CatalogModuleHeader />);

    await waitFor(() =>
      expect(screen.getByText("gagal dimuat")).toBeInTheDocument(),
    );
  });

  it("drops the Kategori tab and its tile for a role without the grant", async () => {
    renderWithAuth(<CatalogModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "products", actions: ["read"] }],
    });

    await waitFor(() => expect(screen.getByText("248")).toBeInTheDocument());
    expect(
      screen.queryByRole("link", { name: "Kategori" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Kategori")).not.toBeInTheDocument();
    // And nothing was asked of an endpoint the role would be refused by.
    expect(mockedCategoryService.list).not.toHaveBeenCalled();
  });

  it("badges the tile the API cannot answer", async () => {
    renderWithAuth(<CatalogModuleHeader />);

    expect(screen.getByText("Tanpa kategori")).toBeInTheDocument();
    expect(screen.getByText("Segera")).toBeInTheDocument();

    await waitFor(() => expect(mockedCategoryService.list).toHaveBeenCalled());
  });
});
