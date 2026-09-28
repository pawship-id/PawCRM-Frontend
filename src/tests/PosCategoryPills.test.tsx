import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosCategoryPills } from "@/features/pos/components/PosCategoryPills";
import { categoryService } from "@/services/category.service";
import type { Category } from "@/types/api";

jest.mock("@/services/category.service");

/**
 * THE ROW ABOVE THE TILL'S GRID — five categories, busiest first, and a way to
 * see the rest (28 September 2026, on request).
 *
 * WHY IT IS CAPPED. A real tenant had seventeen categories, so the row ran
 * three lines deep above a grid of eight tiles: the chooser took more of the
 * screen than the thing being chosen from.
 */
const category = (name: string, productCount: number, _id = name): Category =>
  ({ _id, name, productCount }) as Category;

function listReturns(items: Category[]) {
  jest.mocked(categoryService.list).mockResolvedValue({
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  });
}

const SEVEN = [
  category("Makanan Kering", 42),
  category("Treats", 30),
  category("Kesehatan Hewan", 25),
  category("Pasir & Sanitasi", 12),
  category("Kandang & Habitat", 9),
  category("Kalung Nylon", 3),
  category("tes aja", 0),
];

const pill = (name: string | RegExp) => screen.getByRole("button", { name });

function open(state: Partial<{ categoryId: string; kind: string }> = {}) {
  const onChange = jest.fn();
  render(
    <PosCategoryPills
      state={
        { categoryId: "", kind: "", search: "", page: 1, ...state } as never
      }
      onChange={onChange}
    />,
  );
  return onChange;
}

beforeEach(() => {
  jest.clearAllMocks();
  listReturns(SEVEN);
});

describe("the till's category row", () => {
  it("shows the five busiest and hides the rest behind a count", async () => {
    open();

    await screen.findByRole("button", { name: "Makanan Kering" });

    // The five biggest, and the two smallest are not on the row.
    expect(pill("Treats")).toBeVisible();
    expect(pill("Kandang & Habitat")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Kalung Nylon" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "tes aja" }),
    ).not.toBeInTheDocument();

    /*
      THE COUNT IS THE POINT. "Lainnya" alone asks the cashier to press it to
      find out whether it was worth pressing.
    */
    expect(pill(/2 lainnya/)).toBeVisible();
  });

  it("asks the API for the counts it ranks by", async () => {
    open();

    await waitFor(() =>
      expect(categoryService.list).toHaveBeenCalledWith(
        expect.objectContaining({ withProductCount: true }),
      ),
    );
  });

  it("shows every category once expanded, and folds back", async () => {
    open();
    await screen.findByRole("button", { name: "Makanan Kering" });

    await userEvent.click(pill(/2 lainnya/));

    expect(pill("Kalung Nylon")).toBeVisible();
    expect(pill("tes aja")).toBeVisible();

    await userEvent.click(pill(/Ringkas/));

    expect(
      screen.queryByRole("button", { name: "tes aja" }),
    ).not.toBeInTheDocument();
  });

  /*
    A ROW THAT HID THE APPLIED FILTER would leave the grid narrowed with nothing
    on screen saying by what — the cashier sees a short catalogue and no reason
    for it.
  */
  it("keeps the chosen category on the row even when it ranks below the cut", async () => {
    open({ categoryId: "tes aja" });

    await screen.findByRole("button", { name: "Makanan Kering" });

    expect(pill("tes aja")).toBeVisible();
    expect(pill("tes aja")).toHaveAttribute("aria-pressed", "true");
    // It is drawn IN ADDITION to the five, so only one is left hidden.
    expect(pill(/1 lainnya/)).toBeVisible();
  });

  it("offers no expander when everything already fits", async () => {
    listReturns(SEVEN.slice(0, 3));
    open();

    await screen.findByRole("button", { name: "Makanan Kering" });

    expect(screen.queryByRole("button", { name: /lainnya/ })).not.toBeInTheDocument();
  });

  /*
    STABLE ORDER. Without the name tie-break, categories sharing a count sit in
    whatever order the page arrived in, and a row that reshuffles between loads
    is one a cashier has to read every time rather than reach for.
  */
  it("breaks a tie by name rather than by whatever order arrived", async () => {
    listReturns([
      category("Zebra", 5),
      category("Anjing", 5),
      category("Makanan", 5),
    ]);
    open();

    await screen.findByRole("button", { name: "Anjing" });

    const names = screen
      .getAllByRole("button")
      .map((button) => button.textContent);

    expect(names.indexOf("Anjing")).toBeLessThan(names.indexOf("Makanan"));
    expect(names.indexOf("Makanan")).toBeLessThan(names.indexOf("Zebra"));
  });

  it("still offers Semua and Layanan when the categories cannot be loaded", async () => {
    jest.mocked(categoryService.list).mockRejectedValue(new Error("nope"));
    open();

    // A red banner over a working grid would be worse than a shorter row.
    expect(pill("Semua")).toBeVisible();
    expect(pill("Layanan")).toBeVisible();
  });
});
