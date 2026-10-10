import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { StockTransferEditScreen } from "@/features/inventory";
import { productService } from "@/services/product.service";
import { productBatchService } from "@/services/productBatch.service";
import { stockTransferService } from "@/services/stockTransfer.service";
import { warehouseService } from "@/services/warehouse.service";
import type { PageResult, Warehouse } from "@/types/api";
import type {
  Product,
  StockMovement,
  StockTransferDetail,
} from "@/types/inventory";

jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
}));

/**
 * Ubah transfer — the form, opened on a transfer that has not been received.
 *
 * WHAT IS WORTH PINNING. Three things an edit form can get wrong that a new one
 * cannot:
 *
 *   THE GOODS THE TRANSFER ALREADY TOOK COUNT AS AVAILABLE. The source shelf is
 *   short by exactly what this transfer drew off it, and a form that checked a
 *   quantity against that balance would refuse to RAISE one — "melebihi stok"
 *   for goods that are, in the same transaction, put back.
 *
 *   NO FORM FOR A TRANSFER THAT CANNOT BE EDITED. A tab left open while somebody
 *   else pressed Terima must not offer a form the server will refuse.
 *
 *   NO RETRY TOKEN. An edit names the document it replaces; a retry of it is the
 *   same edit again, not a second transfer.
 */
const TRANSFER_ID = "tr1";
const SOURCE = "wh1";
const DESTINATION = "wh2";

function product(overrides: Partial<Product> = {}): Product {
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
    minStock: 5,
    hasExpiry: false,
    categoryId: "c1",
    unit: "sak",
    sellPrice: "250000.0000",
    hppAvg: "200000.0000",
    isActive: true,
    deletedAt: null,
    // The shelf holds 2 — because this transfer already took 5 of its 7.
    stockByWarehouse: [{ warehouseId: SOURCE, qty: "2.0000" }],
    ...overrides,
  };
}

function warehouse(id: string, name: string): Warehouse {
  return {
    _id: id,
    tenantId: "t1",
    name,
    defaultBranchId: "b1",
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

function page<T>(items: T[]): PageResult<T> {
  return {
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  };
}

function transfer(
  overrides: Partial<StockTransferDetail> = {},
): StockTransferDetail {
  return {
    _id: TRANSFER_ID,
    transferNumber: "TRF/2610/0042",
    status: "in_transit",
    legacy: false,
    revision: 0,
    transferDate: "2026-10-10T02:00:00.000Z",
    fromWarehouseId: SOURCE,
    toWarehouseId: DESTINATION,
    fromWarehouseName: "Gudang Pusat",
    toWarehouseName: "Gudang Bazar",
    productCount: 1,
    lotCount: 1,
    value: "1000000.0000",
    notes: "persiapan bazar",
    createdBy: "u1",
    createdByName: "Rina",
    createdAt: "2026-10-10T02:00:00.000Z",
    receivedAt: null,
    receivedByName: null,
    cancelledAt: null,
    cancelledByName: null,
    items: [
      {
        productId: "p1",
        qty: "5.0000",
        batchId: null,
        autoFefo: false,
        notes: "dekat ED",
        productName: "Royal Canin Adult 3kg",
        productSku: "RC-3KG",
        productUnit: "sak",
      },
    ],
    // What it actually took off the shelf: five, from the warehouse as a whole.
    lines: [
      {
        _id: "mv1",
        productId: "p1",
        warehouseId: SOURCE,
        movementType: "transfer_out",
        qty: "-5.0000",
        hppAtTime: "200000.0000",
        batchId: null,
      } as StockMovement,
    ],
    arrivals: [],
    ...overrides,
  };
}

function arrange(doc: StockTransferDetail = transfer()) {
  jest.spyOn(stockTransferService, "getById").mockResolvedValue(doc);
  const update = jest
    .spyOn(stockTransferService, "update")
    .mockResolvedValue(doc);
  const create = jest.spyOn(stockTransferService, "create");

  jest.spyOn(productService, "getById").mockResolvedValue(product());
  jest
    .spyOn(warehouseService, "list")
    .mockResolvedValue(
      page([warehouse(SOURCE, "Gudang Pusat"), warehouse(DESTINATION, "Gudang Bazar")]) as never,
    );
  jest
    .spyOn(productBatchService, "list")
    .mockResolvedValue(page([]) as never);

  return { update, create };
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

it("opens filled in with what the transfer already carries", async () => {
  arrange();

  renderWithAuth(<StockTransferEditScreen transferId={TRANSFER_ID} />);

  // The line's quantity, as a person would have typed it — not "5.0000".
  expect(await screen.findByLabelText(/^Jumlah/)).toHaveValue("5");
  expect(screen.getByLabelText("Keterangan")).toHaveValue("persiapan bazar");
  expect(screen.getByLabelText(/^Catatan Royal Canin/)).toHaveValue("dekat ED");
  // The document's own number rides in the bar, where `No. [auto]` is on a new one.
  expect(screen.getByText(/TRF\/2610\/0042/)).toBeInTheDocument();
});

it("saves as an edit of this document, with no retry token, and goes back to it", async () => {
  const { update, create } = arrange();
  const user = userEvent.setup();

  renderWithAuth(<StockTransferEditScreen transferId={TRANSFER_ID} />);

  const qty = await screen.findByLabelText(/^Jumlah/);
  await user.clear(qty);
  await user.type(qty, "6");
  await user.click(screen.getByRole("button", { name: /Simpan transfer/ }));

  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(
      TRANSFER_ID,
      expect.objectContaining({
        fromWarehouseId: SOURCE,
        toWarehouseId: DESTINATION,
        items: [{ productId: "p1", qty: "6", notes: "dekat ED" }],
      }),
    ),
  );
  expect(update.mock.calls[0][1]).not.toHaveProperty("idempotencyKey");
  expect(create).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith(
      `/dashboard/inventory/transfers/${TRANSFER_ID}`,
    ),
  );
});

/**
 * THE SHELF HOLDS 2, THE TRANSFER HAS TAKEN 5. Raising the line to 7 is exactly
 * what the warehouse can cover once the five go back — and 8 is not.
 */
it("counts what the transfer already took as available", async () => {
  arrange();
  const user = userEvent.setup();

  renderWithAuth(<StockTransferEditScreen transferId={TRANSFER_ID} />);

  const qty = await screen.findByLabelText(/^Jumlah/);
  await user.clear(qty);
  await user.type(qty, "7");

  expect(screen.queryByText(/Melebihi stok/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Simpan transfer/ })).toBeEnabled();

  await user.clear(qty);
  await user.type(qty, "8");

  expect(await screen.findByText(/Melebihi stok/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Simpan transfer/ })).toBeDisabled();
});

it.each([
  ["received", /sudah diterima/],
  ["cancelled", /sudah dibatalkan/],
] as const)("offers no form for a transfer that is already %s", async (status, words) => {
  arrange(transfer({ status }));

  renderWithAuth(<StockTransferEditScreen transferId={TRANSFER_ID} />);

  expect(await screen.findByText(words)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Simpan transfer/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Kembali ke transfer/ }),
  ).toHaveAttribute("href", `/dashboard/inventory/transfers/${TRANSFER_ID}`);
});

it("says the old goods go back before the new quantity comes out", async () => {
  arrange();

  renderWithAuth(<StockTransferEditScreen transferId={TRANSFER_ID} />);

  expect(
    await screen.findByText(/dikembalikan ke gudang asal/),
  ).toBeInTheDocument();
});
