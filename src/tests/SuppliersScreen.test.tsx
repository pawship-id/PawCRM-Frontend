import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { SuppliersScreen } from "@/features/purchasing/components/SuppliersScreen";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { productBatchService } from "@/services/productBatch.service";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { supplierService } from "@/services/supplier.service";
import type {
  PageResult,
  Supplier,
  SupplierConsignmentSummary,
  SupplierOutstandingSummary,
  SupplierPurchaseSummary,
} from "@/types/api";

jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/purchasing/suppliers",
  useRouter: () => ({ push: jest.fn() }),
}));

/**
 * The supplier list's ordering, against mocked services (BO header sorting,
 * 19 October 2026): it is set from the column headers and sent to the server
 * as a SUPPLIER_SORTS name, `Urutkan` is gone from the filter panel, and the
 * panel's Reset leaves the header ordering alone.
 */
const SUPPLIER = {
  _id: "s1",
  tenantId: "t1",
  name: "PT Sumber Pangan",
  pic: { name: "Bu Rina", email: null, address: null, phone: null },
  phone: null,
  email: null,
  address: null,
  npwp: null,
  notes: null,
  type: "beli_putus",
  paymentTermDays: 30,
  isActive: true,
  createdBy: null,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as Supplier;

function page(items: Supplier[]): PageResult<Supplier> {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(supplierService, "list").mockResolvedValue(page([SUPPLIER]));
  jest.spyOn(purchaseInvoiceService, "outstandingSummary").mockResolvedValue({
    items: [],
    totalOutstanding: "0",
    totalInvoices: 0,
    horizonDays: 7,
  } as unknown as SupplierOutstandingSummary);
  jest.spyOn(goodsReceiptService, "summary").mockResolvedValue({
    items: [],
    totalPurchased: "0",
    totalReceipts: 0,
  } as SupplierPurchaseSummary);
  jest.spyOn(productBatchService, "consignmentSummary").mockResolvedValue({
    items: [],
    totalValue: "0",
    totalLots: 0,
  } as SupplierConsignmentSummary);
});

async function renderList() {
  const user = userEvent.setup();
  renderWithAuth(<SuppliersScreen />);
  await screen.findByText("PT Sumber Pangan");
  return user;
}

function lastSort() {
  const calls = (supplierService.list as jest.Mock).mock.calls;
  return calls[calls.length - 1][0].sort;
}

describe("header sorting", () => {
  it("opens newest first, with no header marked", async () => {
    await renderList();

    expect(lastSort()).toBe("newest");
    for (const name of ["Supplier", "Termin", "Penerimaan", "Sisa utang"]) {
      expect(screen.getByRole("columnheader", { name })).toHaveAttribute(
        "aria-sort",
        "none",
      );
    }
  });

  it.each([
    ["Supplier", "nameAsc"],
    ["Termin", "paymentTermAsc"],
    ["Penerimaan", "receiptCountDesc"],
    ["Sisa utang", "outstandingDesc"],
  ])("asks the server to sort by %s", async (header, sort) => {
    const user = await renderList();

    await user.click(screen.getByRole("button", { name: header }));

    await waitFor(() => expect(lastSort()).toBe(sort));
  });

  it("flips a column on the second click", async () => {
    const user = await renderList();

    await user.click(screen.getByRole("button", { name: "Sisa utang" }));
    await waitFor(() => expect(lastSort()).toBe("outstandingDesc"));
    await user.click(screen.getByRole("button", { name: "Sisa utang" }));

    await waitFor(() => expect(lastSort()).toBe("outstandingAsc"));
  });

  it("leaves Kontak, Tipe and Aksi plain", async () => {
    await renderList();

    for (const name of ["Kontak", "Tipe", "Aksi"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  /** Urutkan left the panel when the headers took over. */
  it("offers no Urutkan in the filter panel", async () => {
    const user = await renderList();

    await user.click(screen.getByRole("button", { name: "Filter" }));

    expect(screen.getByLabelText("Filter tipe kerja sama")).toBeVisible();
    expect(screen.queryByLabelText("Urutkan")).not.toBeInTheDocument();
  });
});

/**
 * A Reset inside a filter panel must not silently re-sort a table somebody
 * ordered from the headers it can see — and the ordering is never counted.
 */
it("keeps the header ordering through the panel's Reset", async () => {
  const user = await renderList();

  await user.click(screen.getByRole("button", { name: "Penerimaan" }));
  await waitFor(() => expect(lastSort()).toBe("receiptCountDesc"));
  // The ordering is not a filter: the trigger still reads plain "Filter".
  expect(screen.getByText("Filter")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Filter" }));

  await user.click(screen.getByLabelText("Filter tipe kerja sama"));
  await user.click(await screen.findByRole("option", { name: "Konsinyasi" }));
  await user.click(screen.getByRole("button", { name: "Terapkan" }));
  await waitFor(() =>
    expect(supplierService.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "konsinyasi", sort: "receiptCountDesc" }),
    ),
  );

  // The type is counted; the ordering never is.
  expect(await screen.findByText("Filter (1)")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByRole("button", { name: "Reset" }));

  await waitFor(() =>
    expect(supplierService.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: undefined, sort: "receiptCountDesc" }),
    ),
  );
});
