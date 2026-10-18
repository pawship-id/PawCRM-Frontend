import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosCatalog } from "@/features/pos/components/PosCatalog";
import { categoryService } from "@/services/category.service";
import { posService } from "@/services/pos.service";
import type { PosCatalogItem } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/pos.service");
jest.mock("@/services/category.service");

/*
  THE CAMERA ITSELF CANNOT RUN IN JSDOM, so the dialog is swapped for a button
  that "reads" whatever code the test names. What is under test is what the
  till does with a code once it has one.
*/
let nextCode = "";
jest.mock("@/components/BarcodeCameraDialog", () => ({
  BarcodeCameraDialog: ({
    onDetected,
    status,
  }: {
    onDetected: (code: string) => void;
    status: { text: string } | null;
  }) => (
    <div>
      <button type="button" onClick={() => onDetected(nextCode)}>
        kamera membaca
      </button>
      {status && <p>{status.text}</p>}
    </div>
  ),
}));

const mockedPos = posService as jest.Mocked<typeof posService>;
const mockedCategories = categoryService as jest.Mocked<typeof categoryService>;

const tile = (overrides: Partial<PosCatalogItem> = {}) =>
  ({
    kind: "product",
    _id: "p1",
    name: "Kitten 2kg",
    code: "RC-KIT",
    productType: "simple",
    sellable: true,
    ...overrides,
  }) as PosCatalogItem;

const page = (items: PosCatalogItem[], total = items.length) => ({
  items,
  pagination: { page: 1, limit: 8, total, totalPages: 1 },
});

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedCategories.list.mockResolvedValue({ items: [], pagination: {} } as any);
  mockedPos.catalog.mockResolvedValue(page([]));
});

async function scan(code: string) {
  const onAdd = jest.fn();
  const onExpand = jest.fn();
  const user = userEvent.setup();
  renderWithAuth(<PosCatalog onAdd={onAdd} onExpand={onExpand} />);

  await user.click(screen.getByRole("button", { name: /scan pakai kamera/i }));
  nextCode = code;
  await user.click(screen.getByRole("button", { name: "kamera membaca" }));

  return { onAdd, onExpand };
}

describe("scanning at the till", () => {
  it("asks for an exact match on the code the camera read", async () => {
    await scan("8991234567890");

    expect(mockedPos.catalog).toHaveBeenCalledWith(
      expect.objectContaining({ search: "8991234567890", scan: true }),
    );
  });

  it("puts the one product it names straight into the basket", async () => {
    mockedPos.catalog.mockResolvedValue(page([tile()]));

    const { onAdd } = await scan("RC-KIT");

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ _id: "p1" }));
    expect(
      await screen.findByText("Kitten 2kg masuk ke keranjang."),
    ).toBeInTheDocument();
  });

  it("refuses a product the shelf is out of, and says so", async () => {
    mockedPos.catalog.mockResolvedValue(page([tile({ sellable: false })]));

    const { onAdd } = await scan("RC-KIT");

    expect(onAdd).not.toHaveBeenCalled();
    expect(await screen.findByText(/stoknya habis/i)).toBeInTheDocument();
  });

  it("opens the size picker for a family instead of guessing a size", async () => {
    mockedPos.catalog.mockResolvedValue(
      page([tile({ productType: "parent" })]),
    );

    const { onAdd, onExpand } = await scan("RC-KIT");

    expect(onAdd).not.toHaveBeenCalled();
    expect(onExpand).toHaveBeenCalled();
  });

  it("hands several matches to the search box, by the label's SKU", async () => {
    mockedPos.catalog.mockResolvedValue(
      page([tile(), tile({ _id: "p2", name: "Kitten XL" })], 2),
    );

    const { onAdd } = await scan("BULOO\nSKU:RC-KIT\nBATCH:B2610-0042");

    expect(onAdd).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("textbox", { name: /cari produk/i }),
    ).toHaveValue("RC-KIT");
    expect(await screen.findByText(/2 produk cocok/i)).toBeInTheDocument();
  });
});
