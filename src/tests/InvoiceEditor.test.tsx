import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InvoiceEditor } from "@/features/sales/components/InvoiceEditor";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { customerService } from "@/services/customer.service";
import { branchService } from "@/services/branch.service";
import { warehouseService } from "@/services/warehouse.service";
import { productService } from "@/services/product.service";
import { serviceService } from "@/services/service.service";
import { tenantService } from "@/services/tenant.service";
import { petService } from "@/services/pet.service";
import { ApiError } from "@/services/api-error";
import { swalToast } from "@/lib/swal";
import type { CustomerInvoiceDetail, CustomerInvoiceItem } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customerInvoice.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/warehouse.service");
jest.mock("@/services/product.service");
jest.mock("@/services/service.service");
jest.mock("@/services/tenant.service");
jest.mock("@/services/pet.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;
const toast = swalToast as jest.MockedFunction<typeof swalToast>;

/**
 * EDITING AN UNPAID INVOICE, in its Rincian card.
 *
 * WHAT THESE GUARD: a kept line is sent as `fromIndex` — so the server keeps its
 * frozen price and booking — and never with a price; a removed line is simply
 * absent; a booked service stays at one; and nothing is sent when nothing moved,
 * because a save reverses and re-issues two entries whether or not anything
 * changed.
 */
const page = <T,>(items: T[]) =>
  ({
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  }) as never;

const line = (overrides: Partial<CustomerInvoiceItem> = {}): CustomerInvoiceItem => ({
  kind: "product",
  refId: "p1",
  name: "Kalung Nylon",
  sku: "KLG",
  qty: "2.0000",
  unitPrice: "90000.0000",
  discount: null,
  lineTotal: "180000.0000",
  hppAtTime: null,
  dpp: null,
  tax: null,
  bookingId: null,
  bookingItemId: null,
  petId: null,
  petName: null,
  groomerName: null,
  ...overrides,
});

const invoice = (overrides: Partial<CustomerInvoiceDetail> = {}) =>
  ({
    _id: "inv1",
    invoiceNumber: "INV/TBR/2608/0001",
    customerId: "c1",
    customerName: "Bu Sari",
    branchId: "b1",
    warehouseId: "w1",
    source: "manual",
    posTransactionId: null,
    status: "unpaid",
    dueDate: "2026-09-27T00:00:00.000Z",
    invoiceDiscount: null,
    items: [
      line(),
      line({
        kind: "service",
        refId: "s1",
        name: "Grooming Basic",
        sku: null,
        qty: "1.0000",
        unitPrice: "150000.0000",
        lineTotal: "150000.0000",
        bookingId: "bk1",
        petId: "pet1",
        petName: "Miko",
      }),
    ],
    ...overrides,
  }) as CustomerInvoiceDetail;

const onSaved = jest.fn();
const onCancel = jest.fn();

const renderEditor = (value = invoice()) =>
  renderWithAuth(
    <InvoiceEditor invoice={value} onSaved={onSaved} onCancel={onCancel} />,
  );

beforeEach(() => {
  jest.clearAllMocks();

  asMock(customerService.list).mockResolvedValue(page([]));
  asMock(branchService.list).mockResolvedValue(page([]));
  asMock(warehouseService.list).mockResolvedValue(page([]));
  asMock(productService.list).mockResolvedValue(page([]));
  asMock(serviceService.list).mockResolvedValue(page([]));
  asMock(tenantService.me).mockResolvedValue({
    _id: "t1",
    settings: { taxRate: 11, priceIncludesTax: true },
  } as never);
  asMock(petService.list).mockResolvedValue(
    page([{ _id: "pet1", name: "Miko", species: "dog" }]),
  );
  asMock(customerInvoiceService.update).mockResolvedValue(invoice());
});

describe("InvoiceEditor", () => {
  it("sends every kept line by the index it continues, and never a price", async () => {
    const user = userEvent.setup();
    renderEditor();

    const qty = await screen.findByLabelText("Jumlah Kalung Nylon");
    await user.clear(qty);
    await user.type(qty, "3");
    await user.click(screen.getByRole("button", { name: "Simpan faktur" }));

    await waitFor(() => expect(customerInvoiceService.update).toHaveBeenCalled());

    const [id, body] = asMock(customerInvoiceService.update).mock.calls[0];
    expect(id).toBe("inv1");
    expect(body.items).toEqual([
      { kind: "product", refId: "p1", qty: "3", discount: null, fromIndex: 0 },
      { kind: "service", refId: "s1", qty: "1", discount: null, fromIndex: 1 },
    ]);
    expect(body.dueDate).toBe("2026-09-27T00:00:00.000Z");
    expect(onSaved).toHaveBeenCalled();
  });

  it("leaves a removed line out of the list altogether", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      await screen.findByRole("button", { name: "Hapus Kalung Nylon" }),
    );
    await user.click(screen.getByRole("button", { name: "Simpan faktur" }));

    await waitFor(() => expect(customerInvoiceService.update).toHaveBeenCalled());
    const [, body] = asMock(customerInvoiceService.update).mock.calls[0];
    expect(body.items).toEqual([
      { kind: "service", refId: "s1", qty: "1", discount: null, fromIndex: 1 },
    ]);
  });

  /*
    A SAVE IS NOT FREE. It reverses the live revision's entries and issues new
    ones — on an unchanged invoice that is a reversal pair in the ledger for
    nothing.
  */
  it("sends nothing when nothing changed", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "Simpan faktur" }));

    expect(toast).toHaveBeenCalledWith("Belum ada yang diubah.");
    expect(customerInvoiceService.update).not.toHaveBeenCalled();
  });

  it("keeps a booked service at one per animal", async () => {
    renderEditor();

    expect(await screen.findByLabelText("Jumlah Grooming Basic")).toBeDisabled();
  });

  it("sends the invoice discount as typed", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.type(await screen.findByLabelText("Diskon faktur"), "10");
    await user.click(screen.getByRole("button", { name: "Simpan faktur" }));

    await waitFor(() => expect(customerInvoiceService.update).toHaveBeenCalled());
    const [, body] = asMock(customerInvoiceService.update).mock.calls[0];
    expect(body.invoiceDiscount).toEqual({ mode: "percent", value: "10" });
  });

  it("shows the server's refusal and keeps the editor open", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.update).mockRejectedValue(
      new ApiError("This invoice is locked by a payment", 409),
    );
    renderEditor();

    const qty = await screen.findByLabelText("Jumlah Kalung Nylon");
    await user.clear(qty);
    await user.type(qty, "3");
    await user.click(screen.getByRole("button", { name: "Simpan faktur" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringMatching(/locked by a payment/),
        "error",
        8000,
      ),
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Simpan faktur" })).toBeEnabled();
  });

  it("leaves without saving on Buang perubahan", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      await screen.findByRole("button", { name: "Buang perubahan" }),
    );

    expect(onCancel).toHaveBeenCalled();
    expect(customerInvoiceService.update).not.toHaveBeenCalled();
  });
});
