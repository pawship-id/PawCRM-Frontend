import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BatchesScreen } from "@/features/inventory";
import { productBatchService } from "@/services/productBatch.service";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import type { PageResult, Warehouse } from "@/types/api";
import type {
  BatchExpirySummary,
  ExpiringBatchesResult,
  ProductBatch,
} from "@/types/inventory";

/**
 * Batch & Expired, against mocked services.
 *
 * WHAT THESE TESTS GUARD. The screen reads three endpoints that answer three
 * different questions, and the ways it could go wrong are all about picking the
 * wrong one or re-deriving what one of them already said:
 *
 *  1. the tiles come from `/summary`, never from the page on screen — a count
 *     summed from twenty rows grows as the user pages;
 *  2. the horizon uses `/expiring`, "Semua lot" uses `/product-batches`, and a
 *     SEARCH forces the second whatever the horizon says;
 *  3. rows render the labels the API resolved — nothing here may reintroduce a
 *     client-side join against the catalogue;
 *  4. the order is the server's; this screen never re-sorts a page.
 *
 * The Radix selects are not driven — jsdom cannot do their pointer protocol, and
 * what they set is a value that goes straight into the query.
 */
const WAREHOUSE = "wh1";

function warehouse(id = WAREHOUSE, name = "Gudang Pusat"): Warehouse {
  return {
    _id: id,
    tenantId: "t1",
    name,
    defaultBranchId: null,
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

function lot(overrides: Partial<ProductBatch> = {}): ProductBatch {
  return {
    _id: "b1",
    tenantId: "t1",
    warehouseId: WAREHOUSE,
    productId: "p1",
    receiptId: null,
    batchCode: "WSK-B26-0512",
    expiryDate: "2026-08-08T00:00:00.000Z",
    initialQty: "10.0000",
    qtyRemaining: "4.0000",
    costPerUnit: "118500.0000",
    isConsignment: false,
    createdBy: null,
    createdAt: "",
    updatedAt: "",
    productName: "Whiskas Adult 1.2kg",
    productSku: "WSK-12",
    productUnit: "pcs",
    warehouseName: "Gudang Pusat",
    ...overrides,
  };
}

function summary(
  overrides: Partial<BatchExpirySummary> = {},
): BatchExpirySummary {
  return {
    expired: { count: 2, value: "150000.0000" },
    critical: { count: 1, value: "50000.0000" },
    soon: { count: 3, value: "300000.0000" },
    atRisk: { count: 6, value: "500000.0000" },
    criticalDays: 7,
    withinDays: 30,
    ...overrides,
  };
}

function page(items: ProductBatch[]): PageResult<ProductBatch> {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  };
}

function expiringPage(items: ProductBatch[]): ExpiringBatchesResult {
  return {
    ...page(items),
    withinDays: 30,
    before: "2026-09-02T00:00:00.000Z",
  };
}

function mockAll(lots: ProductBatch[] = [lot()]) {
  jest
    .spyOn(warehouseService, "list")
    .mockResolvedValue(page([]) as never)
    .mockResolvedValue({
      items: [warehouse()],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    } as never);
  const summaryCall = jest
    .spyOn(productBatchService, "summary")
    .mockResolvedValue(summary());
  const expiringCall = jest
    .spyOn(productBatchService, "expiring")
    .mockResolvedValue(expiringPage(lots));
  const listCall = jest
    .spyOn(productBatchService, "list")
    .mockResolvedValue(page(lots));

  return { summaryCall, expiringCall, listCall };
}

afterEach(() => jest.restoreAllMocks());

describe("BatchesScreen", () => {
  it("takes the tiles from the summary endpoint, not from the page", async () => {
    const { summaryCall } = mockAll([lot()]);

    render(<BatchesScreen />);

    // One row on screen, six lots at risk. Counting the page would have said 1.
    expect(await screen.findByText("Sudah lewat tanggal")).toBeInTheDocument();
    await waitFor(() => expect(summaryCall).toHaveBeenCalled());
    expect(screen.getByText("Rp 500.000")).toBeInTheDocument();
  });

  it("labels the tiles with the boundaries the API reported", async () => {
    mockAll();

    render(<BatchesScreen />);

    // Not hardcoded: the caption reads back the numbers the buckets were cut at.
    expect(
      await screen.findByText("Kritis — kurang 7 hari"),
    ).toBeInTheDocument();
  });

  it("asks the expiring endpoint while a horizon is selected", async () => {
    const { expiringCall, listCall } = mockAll();

    render(<BatchesScreen />);

    await waitFor(() =>
      expect(expiringCall).toHaveBeenCalledWith(
        expect.objectContaining({ withinDays: 30, page: 1 }),
      ),
    );
    // The alert list and the audit list answer different questions; only one of
    // them was asked.
    expect(listCall).not.toHaveBeenCalled();
  });

  it("switches to the whole collection when a batch code is searched", async () => {
    const { listCall } = mockAll();

    const user = userEvent.setup();
    render(<BatchesScreen />);

    await screen.findByRole("table");
    await user.type(screen.getByLabelText("Cari kode batch"), "WSK");

    // `/expiring` cannot filter by code, and tracing a lot is a question about
    // its whole life — including after it sold out.
    await waitFor(() =>
      expect(listCall).toHaveBeenCalledWith(
        expect.objectContaining({ search: "WSK" }),
      ),
    );
  });

  it("says why the horizon went quiet during a search", async () => {
    mockAll();

    const user = userEvent.setup();
    render(<BatchesScreen />);

    await screen.findByRole("table");
    await user.type(screen.getByLabelText("Cari kode batch"), "WSK");

    // A control that silently does nothing is worse than one that explains
    // itself.
    expect(
      await screen.findByText(/rentang\s+kedaluwarsa dinonaktifkan/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Rentang kedaluwarsa")).toBeDisabled();
  });

  it("offers the exhausted-lot toggle only where it means something", async () => {
    mockAll();

    const user = userEvent.setup();
    render(<BatchesScreen />);

    await screen.findByRole("table");
    // In alert mode an exhausted lot cannot expire into anything, so the
    // endpoint has no opinion to offer and the toggle is not shown.
    expect(
      screen.queryByLabelText(/Tampilkan lot yang sudah habis/),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Cari kode batch"), "WSK");

    expect(
      await screen.findByLabelText(/Tampilkan lot yang sudah habis/),
    ).toBeInTheDocument();
  });

  it("asks for live lots only until the toggle says otherwise", async () => {
    const { listCall } = mockAll();

    const user = userEvent.setup();
    render(<BatchesScreen />);

    await screen.findByRole("table");
    await user.type(screen.getByLabelText("Cari kode batch"), "WSK");
    await waitFor(() => expect(listCall).toHaveBeenCalled());

    expect(listCall).toHaveBeenLastCalledWith(
      expect.objectContaining({ hasRemaining: true }),
    );

    await user.click(screen.getByLabelText(/Tampilkan lot yang sudah habis/));

    // Tri-state: undefined is "both", which is what the toggle asks for.
    await waitFor(() =>
      expect(listCall).toHaveBeenLastCalledWith(
        expect.objectContaining({ hasRemaining: undefined }),
      ),
    );
  });

  it("renders the product and warehouse the API named", async () => {
    mockAll([lot()]);

    render(<BatchesScreen />);

    const table = await screen.findByRole("table");
    // Resolved server-side. A client joining these itself would need the whole
    // catalogue in memory, and one holding part of it would render blanks.
    expect(within(table).getByText("Whiskas Adult 1.2kg")).toBeInTheDocument();
    expect(within(table).getByText("WSK-12")).toBeInTheDocument();
    expect(within(table).getByText("Gudang Pusat")).toBeInTheDocument();
  });

  it("keeps the server's order rather than re-sorting the page", async () => {
    mockAll([
      lot({ _id: "a", batchCode: "WSK-B26-0512" }),
      lot({
        _id: "b",
        batchCode: "RC-B26-0455",
        expiryDate: "2026-08-27T00:00:00.000Z",
      }),
    ]);

    render(<BatchesScreen />);

    const table = await screen.findByRole("table");
    const codes = within(table)
      .getAllByText(/^(RC|WSK)-B26-/)
      .map((node) => node.textContent);

    // The list is paged server-side, so a client that re-sorted would only be
    // reordering the rows it happens to hold.
    expect(codes[0]).toBe("WSK-B26-0512");
  });

  it("surfaces a failed summary without taking the list down with it", async () => {
    mockAll();
    jest
      .spyOn(productBatchService, "summary")
      .mockRejectedValue(new ApiError("Forbidden", 403));

    render(<BatchesScreen />);

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    // The report still renders — the tiles are context, not the point.
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("tells an empty search apart from an empty horizon", async () => {
    mockAll([]);

    const user = userEvent.setup();
    render(<BatchesScreen />);

    expect(
      await screen.findByText("Tidak ada lot di rentang ini"),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Cari kode batch"), "ZZZ");

    expect(
      await screen.findByText("Kode batch itu tidak ditemukan"),
    ).toBeInTheDocument();
  });
});
