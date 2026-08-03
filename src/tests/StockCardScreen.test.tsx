import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { StockCardScreen } from "@/features/inventory";
import { productService } from "@/services/product.service";
import { warehouseService } from "@/services/warehouse.service";
import { stockMovementService } from "@/services/stockMovement.service";
import { productBatchService } from "@/services/productBatch.service";
import { ApiError } from "@/services/api-error";
import type { PageResult, Warehouse } from "@/types/api";
import type {
  Product,
  ProductBatch,
  StockMovement,
  StockMovementPage,
} from "@/types/inventory";

/**
 * The stock card, against mocked services.
 *
 * WHAT THESE TESTS ARE FOR. The screen now renders what the API computes rather
 * than deriving it, so the cases that matter are the seams where a value could
 * be dropped or quietly recomputed:
 *
 *  1. the balance, the lot code and the author come STRAIGHT from the row —
 *     nothing here may reintroduce a client-side derivation;
 *  2. the period tiles come from a SEPARATE request, and must not be summed
 *     from the page;
 *  3. the lot tab is a different permission from the ledger;
 *  4. the export obeys the filters and surfaces its own failure.
 *
 * The Radix selects are deliberately not driven — jsdom cannot do their pointer
 * protocol, and what they set is filter state that goes straight to the query.
 */
const WAREHOUSE = "wh1";
const PRODUCT = "p1";

function product(overrides: Partial<Product> = {}): Product {
  return {
    _id: PRODUCT,
    sku: "RC-3KG",
    name: "Royal Canin Adult 3kg",
    productType: "standalone",
    parentId: null,
    variantAxes: [],
    variantAttributes: null,
    bundleConfig: null,
    barcode: null,
    minStock: 5,
    hasExpiry: true,
    categoryId: "c1",
    unit: "sak",
    sellPrice: "250000.0000",
    hppAvg: "200000.0000",
    isActive: true,
    deletedAt: null,
    stockByWarehouse: [{ warehouseId: WAREHOUSE, qty: "100.0000" }],
    ...overrides,
  };
}

function warehouse(): Warehouse {
  return {
    _id: WAREHOUSE,
    tenantId: "t1",
    name: "Gudang Pusat",
    defaultBranchId: null,
    address: null,
    picName: null,
    picPhone: null,
    isActive: true,
    isDefault: true,
    deletedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    _id: "m1",
    tenantId: "t1",
    warehouseId: WAREHOUSE,
    branchId: null,
    productId: PRODUCT,
    movementType: "receipt",
    qty: "10.0000",
    hppAtTime: "200000.0000",
    batchId: null,
    destinationWarehouseId: null,
    bundleSourceId: null,
    reference: { type: "goods_receipt", id: "gr1" },
    createdBy: null,
    createdAt: "2026-08-01T02:00:00.000Z",
    updatedAt: "2026-08-01T02:00:00.000Z",
    balanceAfter: "100.0000",
    batchCode: null,
    batchExpiryDate: null,
    createdByName: null,
    warehouseName: "Gudang Pusat",
    destinationWarehouseName: null,
    ...overrides,
  };
}

function batch(overrides: Partial<ProductBatch> = {}): ProductBatch {
  return {
    _id: "b1",
    tenantId: "t1",
    warehouseId: WAREHOUSE,
    productId: PRODUCT,
    receiptId: null,
    batchCode: "RC-B26-0455",
    expiryDate: "2026-12-31T00:00:00.000Z",
    initialQty: "100.0000",
    qtyRemaining: "100.0000",
    costPerUnit: "200000.0000",
    isConsignment: false,
    createdBy: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function ledgerPage(
  items: StockMovement[],
  overrides: Partial<StockMovementPage> = {},
): StockMovementPage {
  return {
    items,
    pagination: { page: 1, limit: 50, total: items.length, totalPages: 1 },
    openingBalance: null,
    ...overrides,
  };
}

function batchPage(items: ProductBatch[]): PageResult<ProductBatch> {
  return {
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  };
}

/** The five calls the screen makes on mount, all resolving. */
function mockHappyPath(
  movements: StockMovement[],
  batches: ProductBatch[],
  page: Partial<StockMovementPage> = {},
) {
  jest
    .spyOn(warehouseService, "list")
    .mockResolvedValue(
      { items: [warehouse()], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } } as never,
    );
  jest.spyOn(productService, "list").mockResolvedValue({
    items: [product()],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
  jest.spyOn(productService, "getById").mockResolvedValue(product());
  jest
    .spyOn(stockMovementService, "list")
    .mockResolvedValue(ledgerPage(movements, page));
  jest.spyOn(stockMovementService, "summary").mockResolvedValue({
    totalIn: "30.0000",
    totalOut: "-12.0000",
    net: "18.0000",
    movementCount: 7,
  });
  jest
    .spyOn(productBatchService, "list")
    .mockResolvedValue(batchPage(batches));
}

afterEach(() => jest.restoreAllMocks());

describe("StockCardScreen", () => {
  it("renders the balance the API computed, without recomputing it", async () => {
    mockHappyPath(
      [
        movement({ _id: "newest", qty: "10.0000", balanceAfter: "100.0000" }),
        movement({
          _id: "older",
          qty: "-5.0000",
          movementType: "pos_sale",
          balanceAfter: "90.0000",
        }),
      ],
      [],
    );

    renderWithAuth(<StockCardScreen />);

    const rows = await screen.findAllByRole("row");
    // rows[0] is the header. Each figure is the server's, attached to its own
    // row — not derived from an on-hand quantity fetched elsewhere.
    expect(within(rows[1]).getByText(/^100/)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/^90/)).toBeInTheDocument();
  });

  it("keeps the balance under a filter that hides newer rows", async () => {
    // The old client-side anchor could not survive this and blanked the column.
    mockHappyPath(
      [movement({ movementType: "pos_sale", balanceAfter: "88.0000" })],
      [],
    );

    renderWithAuth(<StockCardScreen />);

    expect(await screen.findByText(/^88/)).toBeInTheDocument();
  });

  it("shows the lot code and the author the row carries", async () => {
    mockHappyPath(
      [
        movement({
          batchId: "b1",
          batchCode: "RC-B26-0455",
          createdByName: "Budi Santoso",
        }),
      ],
      [],
    );

    renderWithAuth(<StockCardScreen />);

    // Both used to be impossible: the lot code was joined from the batch tab's
    // data, and there was no author column at all.
    expect(await screen.findByText("RC-B26-0455")).toBeInTheDocument();
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
  });

  it("attributes an unauthored movement to the system, not to nobody", async () => {
    mockHappyPath([movement({ createdByName: null })], []);

    renderWithAuth(<StockCardScreen />);

    // Null is the API's answer for a row a background process posted — a POS
    // sync, an opname's own difference rows.
    expect(await screen.findByText("sistem")).toBeInTheDocument();
  });

  it("reads the ledger for the selected product and warehouse, never the whole tenant", async () => {
    mockHappyPath([movement()], []);

    renderWithAuth(<StockCardScreen />);

    await waitFor(() =>
      expect(stockMovementService.list).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          productId: PRODUCT,
          warehouseId: WAREHOUSE,
        }),
      ),
    );
  });

  it("takes the period tiles from the summary endpoint, not from the page", async () => {
    mockHappyPath([movement()], []);

    renderWithAuth(<StockCardScreen />);

    // 30 in and 12 out across 7 movements, while the page holds one row of 10.
    // Summing the page would report the page, which grows as the user pages.
    expect(await screen.findByText("+30")).toBeInTheDocument();
    expect(screen.getByText("−12")).toBeInTheDocument();
    expect(screen.getByText(/7 pergerakan/)).toBeInTheDocument();
  });

  it("pages by jumping, and asks the server for the page it jumped to", async () => {
    mockHappyPath([movement()], [], {
      pagination: { page: 1, limit: 50, total: 120, totalPages: 3 },
    });

    const user = userEvent.setup();
    renderWithAuth(<StockCardScreen />);

    await user.click(await screen.findByRole("button", { name: "Page 3" }));

    // Page-jumping was impossible while the balance was reconstructed by walking
    // backwards from the newest row.
    await waitFor(() =>
      expect(stockMovementService.list).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3 }),
      ),
    );
  });

  it("asks for stock-holding products in one request", async () => {
    mockHappyPath([movement()], []);

    renderWithAuth(<StockCardScreen />);

    await waitFor(() => expect(productService.list).toHaveBeenCalled());
    // One call, not one per product type: `holdsStock` is the server's own list.
    expect(productService.list).toHaveBeenCalledTimes(1);
    expect(productService.list).toHaveBeenCalledWith(
      expect.objectContaining({ holdsStock: true }),
    );
  });

  it("exports the filters, and saves what the server sends back", async () => {
    mockHappyPath([movement()], []);
    const blob = new Blob(["Waktu,Tipe\r\n"], { type: "text/csv" });
    const exportCall = jest
      .spyOn(stockMovementService, "export")
      .mockResolvedValue({ blob, filename: "kartu-stok.csv" });

    const createObjectURL = jest.fn(() => "blob:url");
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    const user = userEvent.setup();
    renderWithAuth(<StockCardScreen />);

    await user.click(await screen.findByRole("button", { name: /Export CSV/ }));

    await waitFor(() =>
      expect(exportCall).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: PRODUCT,
          warehouseId: WAREHOUSE,
        }),
      ),
    );
    // Revoked in the same turn: an object URL left behind pins the whole file in
    // memory for the life of the tab.
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:url");
  });

  it("surfaces an export failure instead of saving an error as a file", async () => {
    mockHappyPath([movement()], []);
    jest
      .spyOn(stockMovementService, "export")
      .mockRejectedValue(new ApiError("Forbidden", 403));

    const user = userEvent.setup();
    renderWithAuth(<StockCardScreen />);

    await user.click(await screen.findByRole("button", { name: /Export CSV/ }));

    // A plain anchor to the endpoint would have downloaded a file containing
    // {"success":false}, which is the worst possible outcome.
    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
  });

  it("switches to the lot tab and numbers the live lots in FEFO order", async () => {
    mockHappyPath([], [batch({ _id: "b1", batchCode: "RC-B26-0455" })]);

    const user = userEvent.setup();
    renderWithAuth(<StockCardScreen />);

    await user.click(
      await screen.findByRole("button", { name: /Batch \/ FEFO/ }),
    );

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Urutan FEFO")).toBeInTheDocument();
    expect(within(table).getByText("RC-B26-0455")).toBeInTheDocument();
  });

  it("hides the lot tab from a role without productBatches:read", async () => {
    mockHappyPath([movement()], []);

    renderWithAuth(<StockCardScreen />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "stockMovements", actions: ["read"] },
        { feature: "products", actions: ["read"] },
        { feature: "warehouses", actions: ["read"] },
      ],
    });

    await screen.findByText(/tidak bisa diubah/);
    expect(
      screen.queryByRole("button", { name: /Batch \/ FEFO/ }),
    ).not.toBeInTheDocument();
    // And it must not have asked for the data either.
    expect(productBatchService.list).not.toHaveBeenCalled();
  });

  it("surfaces a ledger failure rather than rendering an empty card", async () => {
    mockHappyPath([], []);
    jest
      .spyOn(stockMovementService, "list")
      .mockRejectedValue(new ApiError("Forbidden", 403));

    renderWithAuth(<StockCardScreen />);

    // An empty table would read as "nothing ever moved here", which is a very
    // different statement from "you may not look".
    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
  });

  it("states that the ledger cannot be edited", async () => {
    mockHappyPath([movement()], []);

    renderWithAuth(<StockCardScreen />);

    expect(await screen.findByText(/tidak bisa diubah/)).toBeInTheDocument();
  });
});
