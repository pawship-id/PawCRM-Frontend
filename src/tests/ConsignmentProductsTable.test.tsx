import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";

import { ConsignmentProductsTable } from "@/features/purchasing";
import { productBatchService } from "@/services/productBatch.service";
import { ApiError } from "@/services/api-error";
import type { ConsignmentProductRow } from "@/types/api";

jest.mock("@/services/productBatch.service");

/**
 * Which of a supplier's goods are still on the shelf.
 *
 * THE GAP THIS CLOSED. The supplier screen could report `productCount: 3` and
 * nothing else — a number a vendor cannot act on. They phone to ask which of
 * their goods to collect, restock or write off, and a count answers none of it.
 *
 * What the tests guard:
 *
 *  1. the supplier filter is passed through, so the same component serves one
 *     vendor's screen and the cross-supplier report;
 *  2. a null expiry is rendered as an ABSENCE, never as a date — "does not
 *     expire" and "expires today" lead to opposite conversations;
 *  3. a row whose vendor was deleted survives. The goods are on the shelf
 *     whatever happened to the record.
 */
const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

const row = (
  overrides: Partial<ConsignmentProductRow> = {},
): ConsignmentProductRow => ({
  supplierId: "s1",
  supplierName: "PT Sumber Pangan",
  productId: "p1",
  sku: "RC-1KG",
  name: "Royal Canin 1kg",
  unit: "pcs",
  lotCount: 2,
  qtyRemaining: "40.0000",
  value: "380000.0000",
  nearestExpiry: null,
  ...overrides,
});

const result = (items: ConsignmentProductRow[]) => ({
  items,
  totalValue: "380000.0000",
  totalLots: 2,
});

beforeEach(() => {
  jest.clearAllMocks();
  asMock(productBatchService.consignmentProducts).mockResolvedValue(
    result([row()]),
  );
});

describe("ConsignmentProductsTable", () => {
  it("names each product, with what is left of it", async () => {
    render(<ConsignmentProductsTable supplierId="s1" />);

    expect(await screen.findByText("Royal Canin 1kg")).toBeInTheDocument();
    expect(screen.getByText("RC-1KG")).toBeInTheDocument();
    // The count the summary could already give, now beside the thing it counts.
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("asks only about the supplier it was given", async () => {
    render(<ConsignmentProductsTable supplierId="s1" />);

    await screen.findByText("Royal Canin 1kg");
    expect(productBatchService.consignmentProducts).toHaveBeenCalledWith({
      supplierId: "s1",
    });
  });

  // The report's cross-supplier view: no filter, and a Supplier column.
  it("asks about every supplier when given none", async () => {
    render(<ConsignmentProductsTable showSupplier />);

    await screen.findByText("Royal Canin 1kg");
    expect(productBatchService.consignmentProducts).toHaveBeenCalledWith({
      supplierId: undefined,
    });
    expect(screen.getByText("PT Sumber Pangan")).toBeInTheDocument();
  });

  it("omits the supplier column on a screen already about one vendor", async () => {
    render(<ConsignmentProductsTable supplierId="s1" />);

    await screen.findByText("Royal Canin 1kg");
    expect(screen.queryByText("PT Sumber Pangan")).not.toBeInTheDocument();
  });

  /**
   * Null is the ordinary case for dry goods and is NOT "expires today". The two
   * lead to opposite conversations with the vendor, so the absence is shown.
   */
  it("renders a missing expiry as a dash", async () => {
    render(<ConsignmentProductsTable supplierId="s1" />);

    await screen.findByText("Royal Canin 1kg");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an expiry date when the lots have one", async () => {
    asMock(productBatchService.consignmentProducts).mockResolvedValue(
      result([row({ nearestExpiry: "2027-08-01T00:00:00.000Z" })]),
    );

    render(<ConsignmentProductsTable supplierId="s1" />);

    expect(await screen.findByText("2027-08-01")).toBeInTheDocument();
  });

  // The goods are on the shelf whatever happened to the vendor record; hiding
  // the row would lose the stock.
  it("keeps a row whose supplier was deleted", async () => {
    asMock(productBatchService.consignmentProducts).mockResolvedValue(
      result([row({ supplierName: null })]),
    );

    render(<ConsignmentProductsTable showSupplier />);

    expect(
      await screen.findByText(/supplier sudah dihapus/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Royal Canin 1kg")).toBeInTheDocument();
  });

  it("says so when there is nothing on consignment", async () => {
    asMock(productBatchService.consignmentProducts).mockResolvedValue(
      result([]),
    );

    render(<ConsignmentProductsTable supplierId="s1" />);

    expect(
      await screen.findByText(/tidak ada barang titipan/i),
    ).toBeInTheDocument();
  });

  it("reports a failure rather than rendering as empty", async () => {
    asMock(productBatchService.consignmentProducts).mockRejectedValue(
      new ApiError("Forbidden", 403),
    );

    render(<ConsignmentProductsTable supplierId="s1" />);

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
  });
});
