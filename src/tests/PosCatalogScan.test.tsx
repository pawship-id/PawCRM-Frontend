import { screen, waitFor } from "@testing-library/react";
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

function renderCatalog() {
  const onAdd = jest.fn();
  const onScan = jest.fn().mockResolvedValue(true);
  const onExpand = jest.fn();
  renderWithAuth(
    <PosCatalog onAdd={onAdd} onScan={onScan} onExpand={onExpand} />,
  );
  return { onAdd, onScan, onExpand };
}

async function scan(code: string) {
  const handlers = renderCatalog();
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: /scan pakai kamera/i }));
  nextCode = code;
  await user.click(screen.getByRole("button", { name: "kamera membaca" }));

  return handlers;
}

describe("scanning at the till", () => {
  it("asks for an exact match on the code the camera read", async () => {
    await scan("8991234567890");

    await waitFor(() =>
      expect(mockedPos.catalog).toHaveBeenCalledWith(
        expect.objectContaining({ search: "8991234567890", scan: true }),
      ),
    );
  });

  it("puts the one product it names straight into the basket", async () => {
    mockedPos.catalog.mockResolvedValue(page([tile()]));

    const { onScan } = await scan("RC-KIT");

    expect(
      await screen.findByText("Kitten 2kg masuk ke keranjang."),
    ).toBeInTheDocument();
    expect(onScan).toHaveBeenCalledWith(expect.objectContaining({ _id: "p1" }));
  });

  it("refuses a product the shelf is out of, and says so", async () => {
    mockedPos.catalog.mockResolvedValue(page([tile({ sellable: false })]));

    const { onScan } = await scan("RC-KIT");

    expect(await screen.findByText(/stoknya habis/i)).toBeInTheDocument();
    expect(onScan).not.toHaveBeenCalled();
  });

  it("opens the size picker for a family instead of guessing a size", async () => {
    mockedPos.catalog.mockResolvedValue(
      page([tile({ productType: "parent" })]),
    );

    const { onScan, onExpand } = await scan("RC-KIT");

    expect(onScan).not.toHaveBeenCalled();
    await waitFor(() => expect(onExpand).toHaveBeenCalled());
  });

  it("hands several matches to the search box, by the label's SKU", async () => {
    mockedPos.catalog.mockResolvedValue(
      page([tile(), tile({ _id: "p2", name: "Kitten XL" })], 2),
    );

    const { onScan } = await scan("BULOO\nSKU:RC-KIT\nBATCH:B2610-0042");

    expect(await screen.findByText(/2 produk cocok/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /cari produk/i })).toHaveValue(
      "RC-KIT",
    );
    expect(onScan).not.toHaveBeenCalled();
  });

  it("refuses a lot that has expired, and says so", async () => {
    mockedPos.catalog.mockResolvedValue(
      page([
        tile({
          scannedLot: {
            batchId: "b1",
            batchCode: "B2401-0001",
            expiryDate: "2024-01-31",
          },
        }),
      ]),
    );

    const { onScan } = await scan("B2401-0001");

    expect(await screen.findByText(/sudah kedaluwarsa/i)).toBeInTheDocument();
    expect(onScan).not.toHaveBeenCalled();
  });
});

/*
  A HANDHELD SCANNER (25 Oct 2026, BO) types into the search box — fast. Typed
  with no delay, every key lands inside SCAN_KEY_GAP_MS, which is what tells
  it from a person.
*/
describe("a handheld scanner typing into the search box", () => {
  const box = () => screen.getByRole("textbox", { name: /cari produk/i });

  it("puts the one product it names in the basket and empties the box", async () => {
    mockedPos.catalog.mockResolvedValue(page([tile()]));
    const { onScan } = renderCatalog();
    const user = userEvent.setup({ delay: null });

    await user.type(box(), "RC-KIT{Enter}");

    await waitFor(() =>
      expect(onScan).toHaveBeenCalledWith(expect.objectContaining({ _id: "p1" })),
    );
    expect(mockedPos.catalog).toHaveBeenCalledWith(
      expect.objectContaining({ search: "RC-KIT", scan: true }),
    );
    await waitFor(() => expect(box()).toHaveValue(""));
  });

  it("takes a batch label's QR whole, Enter between its lines and all", async () => {
    mockedPos.catalog.mockResolvedValue(page([tile()]));
    const { onScan } = renderCatalog();
    const user = userEvent.setup({ delay: null });

    await user.type(box(), "BULOO{Enter}SKU:RC-KIT{Enter}BATCH:B2610-0042{Enter}");

    await waitFor(() => expect(onScan).toHaveBeenCalledTimes(1));
    expect(mockedPos.catalog).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "BULOOSKU:RC-KITBATCH:B2610-0042",
        scan: true,
      }),
    );
  });

  it("leaves the code in the box when nothing matches it exactly", async () => {
    mockedPos.catalog.mockResolvedValue(page([]));
    const { onScan } = renderCatalog();
    const user = userEvent.setup({ delay: null });

    await user.type(box(), "RC-KI{Enter}");

    expect(await screen.findByText(/tidak ada produk dengan kode/i)).toBeInTheDocument();
    expect(box()).toHaveValue("RC-KI");
    expect(onScan).not.toHaveBeenCalled();
  });

  it("treats a person typing a code and pressing Enter as a search", async () => {
    mockedPos.catalog.mockResolvedValue(page([tile()]));
    const { onScan } = renderCatalog();
    const user = userEvent.setup({ delay: 80 });

    await user.type(box(), "RC-KIT{Enter}");
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(onScan).not.toHaveBeenCalled();
    expect(box()).toHaveValue("RC-KIT");
  });
});
