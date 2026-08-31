import { render, screen } from "@testing-library/react";

import { PosProductCard } from "@/features/pos/components/PosProductCard";
import type { PosCatalogItem } from "@/types/api";

/**
 * WHY A TILE IS ON THE GRID, which is a harder question than it sounds.
 *
 * The till searches FIVE fields — name, SKU, barcode, variant key, and the
 * internal lot code — while a tile shows two. So a search that matched on any of
 * the other three used to produce a result with nothing on it marking why, and a
 * cashier holding a scanner had no way to tell a hit from a coincidence.
 *
 * The two extra rows solve that, and they are deliberately NOT symmetrical:
 *
 *   barcode   — stored on every product, so drawing it always would put
 *               thirteen grey digits on all eight tiles permanently. It appears
 *               only when the term is IN it and is not already visible above.
 *   batchCode — populated by the server ONLY for a lot that matched AT THIS
 *               TILL'S WAREHOUSE. Its presence IS the explanation, so there is
 *               no rule to apply.
 */
const item = (overrides: Partial<PosCatalogItem> = {}): PosCatalogItem => ({
  kind: "product",
  _id: "p1",
  name: "Whiskas Tuna 1.2kg",
  code: "WSK-TUNA-12",
  barcode: "8991234567890",
  batchCode: null,
  price: "45000.0000",
  categoryId: "c1",
  unit: "pcs",
  image: null,
  variantCount: null,
  stock: { qty: "12.0000", state: "ok" },
  ...overrides,
});

const noop = () => {};

const renderCard = (overrides: Partial<PosCatalogItem> = {}, search?: string) =>
  render(
    <PosProductCard
      item={item(overrides)}
      search={search}
      onAdd={noop}
      onExpand={noop}
    />,
  );

describe("the lot label", () => {
  /*
    The code is asserted through the ROW'S text, not with `getByText` on the
    whole string: HighlightText splits the matched run into its own <mark>, so
    the code is several nodes rather than one. Reading the row is also closer to
    what a cashier does — the highlight is meant to be invisible as structure.
  */
  it("names the batch that brought the tile back", () => {
    renderCard({ batchCode: "WSK-B26-0640" }, "0640");

    const row = screen.getByText(/^Batch/).closest("span") as HTMLElement;

    expect(row).toHaveTextContent("Batch WSK-B26-0640");
  });

  /*
    NO ROW ON AN ORDINARY TILE. Eight tiles on every till open, and a lot code
    on each of them would be small grey text nobody reads unless they scanned.
  */
  it("draws nothing when no lot matched", () => {
    renderCard({}, "whiskas");

    expect(screen.queryByText(/Batch/)).not.toBeInTheDocument();
  });

  it("draws nothing on an unsearched grid", () => {
    renderCard();

    expect(screen.queryByText(/Batch/)).not.toBeInTheDocument();
  });

  /*
    THE WORD, not the code alone. "WSK-B26-0640" under an SKU is one more
    identifier a cashier has to place; "Batch WSK-B26-0640" says which shelf
    label they are looking at.
  */
  it("carries the word, so the code is not an unplaceable identifier", () => {
    renderCard({ batchCode: "WSK-B26-0640" }, "0640");

    expect(screen.getByText(/^Batch/)).toBeInTheDocument();
  });
});

describe("the barcode row, which follows a different rule", () => {
  it("appears when the scan is the only thing that explains the tile", () => {
    renderCard({}, "8991234567890");

    expect(screen.getByText(/Barcode/)).toBeInTheDocument();
  });

  /*
    ALREADY EXPLAINED ABOVE. If the term is visible in the name or the SKU the
    highlight has done the work, and a second row is noise.
  */
  it("stays away when the name already shows the match", () => {
    renderCard({}, "Whiskas");

    expect(screen.queryByText(/Barcode/)).not.toBeInTheDocument();
  });

  it("stays away when nobody searched", () => {
    renderCard();

    expect(screen.queryByText(/Barcode/)).not.toBeInTheDocument();
  });
});

/**
 * Both rows at once is a real case: a cashier types the lot code, and the
 * product's barcode happens to contain the same digits.
 */
describe("both rows", () => {
  it("can draw the batch and the barcode together", () => {
    renderCard({ batchCode: "B-8991", barcode: "8991234567890" }, "8991");

    expect(screen.getByText(/Batch/)).toBeInTheDocument();
    expect(screen.getByText(/Barcode/)).toBeInTheDocument();
  });
});

/**
 * THE BADGE ANSWERS "can I sell this right now", which is a question about ONE
 * shelf — the warehouse the shift is drawing from. The server scopes it; what
 * this pins is that the tile draws what it was handed rather than deciding for
 * itself.
 */
describe("the stock badge", () => {
  it("shows what the shift's warehouse holds", () => {
    renderCard({ stock: { qty: "12.0000", state: "ok" } });

    expect(screen.getByText("12 tersisa")).toBeInTheDocument();
  });

  it("disables the add button on an empty shelf rather than hiding the tile", () => {
    renderCard({ stock: { qty: "0.0000", state: "out" } });

    expect(screen.getByText("Habis")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Tambah/ }),
    ).toBeDisabled();
  });
});
