import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NegativeStockScreen } from "@/features/inventory";
import { productService } from "@/services/product.service";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import type { NegativeStockResult, NegativeStockRow } from "@/types/inventory";

import { renderWithAuth } from "./helpers/renderWithAuth";

/**
 * THE FULL LIST OF SHELVES THAT OWE WHAT THEY HAVE ALREADY SOLD.
 *
 * WHAT MAKES THIS SCREEN DIFFERENT FROM THE OTHER STOCK LISTS, and what these
 * tests are really guarding: it is about the BOOKS being wrong rather than about
 * the room. Goods left that the system never recorded arriving, so every figure
 * derived from the balance is wrong with it — which is why the total, the
 * explanation and the sign on the money all have to survive a refactor.
 *
 *  1. the count and the total are the SERVER'S, over every row rather than the
 *     page's — a total that summed twenty rows would read as the answer while
 *     being a fraction of it;
 *  2. the money keeps its sign: this is cost already expensed for goods that are
 *     not there, and a magnitude is a number somebody misreads as an asset;
 *  3. the filter goes to the server, because a list that pages at twenty cannot
 *     narrow in the browser without answering a different question;
 *  4. an empty answer is the GOOD outcome and says so.
 */
jest.mock("@/services/product.service");
jest.mock("@/services/warehouse.service");

const mockedProducts = jest.mocked(productService);
const mockedWarehouses = jest.mocked(warehouseService);

const WAREHOUSE_ID = "7d8e9f1a6cd164cc32391d22";
const OTHER_WAREHOUSE_ID = "7d8e9f1a6cd164cc32391d23";

function row(overrides: Partial<NegativeStockRow> = {}): NegativeStockRow {
  return {
    productId: "p1",
    warehouseId: WAREHOUSE_ID,
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

function page(
  items: NegativeStockRow[],
  total = items.length,
  shortfall: string | null = "-30000.0000",
  pageNumber = 1,
): NegativeStockResult {
  return {
    items,
    shortfall,
    pagination: {
      page: pageNumber,
      limit: 20,
      total,
      totalPages: Math.ceil(total / 20),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedProducts.negativeStock.mockResolvedValue(page([row()]));
  mockedWarehouses.list.mockResolvedValue({
    items: [
      { _id: WAREHOUSE_ID, name: "Gudang Pusat", isActive: true },
      { _id: OTHER_WAREHOUSE_ID, name: "Gudang Bazar", isActive: false },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any,
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

describe("what a row says", () => {
  it("names the product AND the shelf — a shortfall happens at a place", async () => {
    renderWithAuth(<NegativeStockScreen />);

    expect(await screen.findByText("Royal Canin Adult 3kg")).toBeInTheDocument();
    expect(screen.getByText("FD-RC-3KG")).toBeInTheDocument();
    expect(screen.getByText("Gudang Pusat")).toBeInTheDocument();
  });

  it("shows the shortfall with its unit and the value with its sign", async () => {
    renderWithAuth(<NegativeStockScreen />);

    expect(await screen.findByText("-3 pcs")).toBeInTheDocument();
    /*
      Cost already expensed for goods that are not there — a magnitude here is a
      number somebody reads as an asset. Read from the ROW: with one row on
      screen the summary above the table carries the same figure, and a bare
      `getByText` would not say which of the two it found.
    */
    const cells = screen.getByText("-3 pcs").closest("tr") as HTMLElement;
    expect(within(cells).getByText("Rp -30.000")).toBeInTheDocument();
  });

  /*
    UNCHANGED BY THE OVERSELL. Goods leave AT the average, so an outbound
    movement cannot move it — and the next receipt weights the negative balance
    against exactly this figure, which is why the sen are shown.
  */
  it("shows the average the goods were sold at, to the sen", async () => {
    mockedProducts.negativeStock.mockResolvedValue(
      page([row({ hppAvg: "12352.9412" })]),
    );

    renderWithAuth(<NegativeStockScreen />);

    expect(await screen.findByText("Rp 12.352,94")).toBeInTheDocument();
  });

  /*
    A DISCONTINUED LINE IS NOT SOMETHING TO REORDER — which is why the restock
    list leaves it out — but one sitting at −3 is exactly the row somebody has to
    explain, so this list keeps it and marks it.
  */
  it("marks a product that is no longer active", async () => {
    mockedProducts.negativeStock.mockResolvedValue(
      page([row({ isActive: false })]),
    );

    renderWithAuth(<NegativeStockScreen />);

    expect(await screen.findByText("nonaktif")).toBeInTheDocument();
  });

  it("still lists a row whose warehouse has gone missing", async () => {
    mockedProducts.negativeStock.mockResolvedValue(
      page([row({ warehouseName: null })]),
    );

    renderWithAuth(<NegativeStockScreen />);

    // The shortfall is real whatever happened to the warehouse row.
    expect(await screen.findByText("-3 pcs")).toBeInTheDocument();
  });

  it("links the product to its catalogue page", async () => {
    renderWithAuth(<NegativeStockScreen />);

    expect(
      await screen.findByRole("link", { name: "Royal Canin Adult 3kg" }),
    ).toHaveAttribute("href", "/dashboard/inventory/products/p1");
  });
});

describe("the total above the table", () => {
  /*
    THE WHOLE HOLE, FROM THE SERVER. A figure that added up the twenty rows on
    screen would read as the answer while being a fraction of it.
  */
  it("counts every row and sums every value, not the page's", async () => {
    mockedProducts.negativeStock.mockResolvedValue(
      page([row()], 43, "-910000.0000"),
    );

    renderWithAuth(<NegativeStockScreen />);

    expect(await screen.findByText("43")).toBeInTheDocument();
    expect(screen.getByText("Rp -910.000")).toBeInTheDocument();
  });

  /*
    HIDDEN ENTIRELY ON A CLEAN SHOP. A standing "Rp 0" is a number that teaches
    people to ignore the row it sits on.
  */
  it("says nothing at all when there is nothing wrong", async () => {
    mockedProducts.negativeStock.mockResolvedValue(page([], 0, "0.0000"));

    renderWithAuth(<NegativeStockScreen />);

    expect(await screen.findByText(/tidak ada stok minus/i)).toBeInTheDocument();
    expect(screen.queryByText(/total nilai/i)).not.toBeInTheDocument();
  });

  it("frames an empty answer as the good outcome", async () => {
    mockedProducts.negativeStock.mockResolvedValue(page([], 0, "0.0000"));

    renderWithAuth(<NegativeStockScreen />);

    expect(
      await screen.findByText(/catatan dan barang di rak sedang cocok/i),
    ).toBeInTheDocument();
  });
});

describe("the explanation", () => {
  /*
    NOBODY READS "−3" AS "a sale was recorded for goods the book did not have"
    on their own, and the wrong reading — "the system is broken" — sends somebody
    looking for a bug instead of for a delivery note.
  */
  it("says what a negative balance is and how to clear it", async () => {
    renderWithAuth(<NegativeStockScreen />);

    expect(
      await screen.findByText(/penerimaan barang belum dicatat/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "opname" })).toHaveAttribute(
      "href",
      "/dashboard/inventory/opname",
    );
  });
});

describe("the warehouse filter", () => {
  /*
    IT GOES TO THE SERVER. The list pages at twenty, so narrowing in the browser
    would answer "what is minus at Gudang Bazar" with "the ones that happened to
    be on page 1".
  */
  it("asks the server again, and resets to the first page", async () => {
    mockedProducts.negativeStock.mockResolvedValue(page([row()], 60));

    renderWithAuth(<NegativeStockScreen />);

    await screen.findByText("Royal Canin Adult 3kg");
    await userEvent.click(screen.getByRole("button", { name: /filter gudang/i }));
    await userEvent.click(await screen.findByRole("option", { name: /gudang bazar/i }));

    await waitFor(() =>
      expect(mockedProducts.negativeStock).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        warehouseId: OTHER_WAREHOUSE_ID,
      }),
    );
  });

  /*
    "EVERY WAREHOUSE" IS NOT AN EMPTY STRING ON THE WIRE. The API refuses one as
    a malformed id, so the unfiltered read must leave the parameter out.
  */
  it("leaves the parameter out when no warehouse is chosen", async () => {
    renderWithAuth(<NegativeStockScreen />);

    await waitFor(() =>
      expect(mockedProducts.negativeStock).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        warehouseId: undefined,
      }),
    );
  });

  /*
    A CLOSED WAREHOUSE STAYS IN THE LIST. This is a read, and a location shut
    last month can still hold a balance below zero — hiding it would hide the row
    somebody has to clear.
  */
  it("offers an inactive warehouse, marked", async () => {
    renderWithAuth(<NegativeStockScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: /filter gudang/i }),
    );

    expect(
      await screen.findByRole("option", { name: /gudang bazar \(nonaktif\)/i }),
    ).toBeInTheDocument();
  });

  /*
    THE LOOKUP FAILS SOFTLY. A user may hold `products:read` without
    `warehouses:read`, and a list that refused to render because a dropdown could
    not be filled would withhold the rows over the filter.
  */
  it("still renders the rows when the warehouse lookup fails", async () => {
    mockedWarehouses.list.mockRejectedValue(new ApiError("Forbidden", 403));

    renderWithAuth(<NegativeStockScreen />);

    expect(await screen.findByText("Royal Canin Adult 3kg")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /filter gudang/i }),
    ).not.toBeInTheDocument();
  });
});

describe("paging", () => {
  /*
    THE PAGE IS THE ONE CHANGE THAT DOES NOT RESET THE PAGE. Every other knob
    does — staying on page 3 of a narrower result answers a fresh question with
    an empty table.
  */
  it("asks the server for the next page", async () => {
    mockedProducts.negativeStock.mockResolvedValue(page([row()], 43));

    renderWithAuth(<NegativeStockScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: /berikutnya/i }),
    );

    await waitFor(() =>
      expect(mockedProducts.negativeStock).toHaveBeenLastCalledWith({
        page: 2,
        limit: 20,
        warehouseId: undefined,
      }),
    );
  });

  it("draws no pager when everything fits on one page", async () => {
    renderWithAuth(<NegativeStockScreen />);

    await screen.findByText("Royal Canin Adult 3kg");
    expect(
      screen.queryByRole("button", { name: /berikutnya/i }),
    ).not.toBeInTheDocument();
  });
});

describe("when the list fails", () => {
  it("says so and offers to try again", async () => {
    mockedProducts.negativeStock.mockRejectedValueOnce(
      new ApiError("Daftar stok minus gagal dimuat.", 500),
    );

    renderWithAuth(<NegativeStockScreen />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Daftar stok minus gagal dimuat.");

    mockedProducts.negativeStock.mockResolvedValue(page([row()]));
    await userEvent.click(
      within(alert).getByRole("button", { name: /coba lagi/i }),
    );

    expect(await screen.findByText("Royal Canin Adult 3kg")).toBeInTheDocument();
  });
});
