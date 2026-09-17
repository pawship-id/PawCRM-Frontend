import { screen, waitFor, within } from "@testing-library/react";
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

import { variantOptionService } from "@/services/variantOption.service";
import { zoneService } from "@/services/zone.service";

import { renderWithAuth } from "./helpers/renderWithAuth";
import {
  BUILT_IN_VARIANT_OPTIONS,
  makeVariantOption,
  primeVariantOptions,
} from "./helpers/variantOptions";

jest.mock("@/services/variantOption.service");
jest.mock("@/services/zone.service");

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
  primeVariantOptions(variantOptionService.list, zoneService.list);

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

  /*
    THE FIELDS HOLD THE LINE'S OWN DISCOUNT (16 September 2026). A pulled
    appointment's stored discount includes its share of "Diskon seluruh booking";
    the editor shows the share once in the recap, and sends only the own part —
    the server adds the share back from the booking.
  */
  it("shows and sends a booked line's own discount, with the booking's share in the recap", async () => {
    const user = userEvent.setup();
    renderEditor(
      invoice({
        items: [
          line(),
          line({
            kind: "service",
            refId: "s1",
            name: "Grooming Basic",
            sku: null,
            qty: "1.0000",
            unitPrice: "120000.0000",
            lineTotal: "120000.0000",
            discount: { mode: "amount", value: "7170.0000", resolvedAmount: "7170.0000" },
            bookingId: "bk1",
            petId: "pet1",
            petName: "Miko",
          }),
        ],
        bookings: [
          {
            _id: "bk1",
            service: {
              serviceId: "s1",
              name: "Grooming Basic",
              price: "120000.0000",
              bookingShare: "2170.0000",
              addons: [],
            },
          },
        ],
      } as never),
    );

    const discount = await screen.findByLabelText("Diskon Grooming Basic");
    expect(discount).toHaveValue("5000");
    expect(screen.getByLabelText("Jenis diskon Grooming Basic")).toHaveValue("amount");
    expect(screen.getByText("Diskon booking").parentElement?.textContent).toContain(
      "Rp 2.170",
    );

    const qty = screen.getByLabelText("Jumlah Kalung Nylon");
    await user.clear(qty);
    await user.type(qty, "3");
    await user.click(screen.getByRole("button", { name: "Simpan faktur" }));

    await waitFor(() => expect(customerInvoiceService.update).toHaveBeenCalled());
    const [, body] = asMock(customerInvoiceService.update).mock.calls[0];
    expect(body.items[1]).toMatchObject({
      refId: "s1",
      discount: { mode: "amount", value: "5000" },
      fromIndex: 1,
    });
  });

  /*
    THE PPN STANDS ON ITS BASE (16 September 2026) — the same pair the read view
    and Faktur baru draw, so a figure somebody is checking line by line can be
    checked here too.
  */
  it("shows Dasar pengenaan pajak above the PPN where tax is added on top", async () => {
    asMock(tenantService.me).mockResolvedValue({
      _id: "t1",
      settings: { taxRate: 11, priceIncludesTax: false },
    } as never);

    renderEditor();

    /* 180.000 of goods and 150.000 of grooming, before an 11% PPN on top. */
    const base = await screen.findByText("Dasar pengenaan pajak");
    expect(base.parentElement?.textContent).toContain("Rp 330.000");
    /* The recap's row (a <dt>) — every line now carries a "PPN 11%" badge too. */
    const ppn = screen.getAllByText("PPN 11%").find((node) => node.tagName === "DT");
    expect(ppn?.parentElement?.textContent).toContain("Rp 36.300");
  });

  /*
    A ROW'S TOTAL IS WHAT IT WILL BE BILLED AT (16 September 2026): price × qty,
    less its own discount, plus the PPN beside it. It used to read price × qty,
    which disagreed with every other view of the same line.
  */
  it("totals a row after its discount and with its tax, and shows that tax beside it", async () => {
    const user = userEvent.setup();
    asMock(tenantService.me).mockResolvedValue({
      _id: "t1",
      settings: { taxRate: 11, priceIncludesTax: false },
    } as never);

    renderEditor();

    const discount = await screen.findByLabelText("Diskon Kalung Nylon");
    await user.clear(discount);
    await user.type(discount, "5000");
    await user.selectOptions(
      screen.getByLabelText("Jenis diskon Kalung Nylon"),
      "amount",
    );

    /* 2 × 90.000 − 5.000 = 175.000, and 11% of it is 19.250. */
    const row = within(
      screen.getAllByRole("row").find((one) => one.textContent?.includes("Kalung Nylon"))!,
    );

    expect(row.getByText("+Rp 19.250")).toBeInTheDocument();
    expect(row.getByText("Rp 194.250")).toBeInTheDocument();
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

  /*
    THE SERVER NEVER RE-RESOLVES A STORED LINE (13 September 2026), so a service
    whose variant was switched off after the invoice was issued must not hold a
    correction to some other row.
  */
  it("does not hold a stored service line whose variant was switched off since", async () => {
    asMock(serviceService.list).mockResolvedValue(
      page([
        {
          _id: "s1",
          name: "Grooming Basic",
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory"],
          variants: [
            {
              petType: null,
              sizeCategory: "medium",
              furType: null,
              price: "150000.0000",
              durationMin: 60,
              isActive: false,
            },
          ],
        },
      ]),
    );
    asMock(petService.list).mockResolvedValue(
      page([{ _id: "pet1", name: "Miko", species: "dog", size: "medium" }]),
    );
    const user = userEvent.setup();
    renderEditor();

    const qty = await screen.findByLabelText("Jumlah Kalung Nylon");
    await user.clear(qty);
    await user.type(qty, "3");

    expect(screen.queryByText(/sedang nonaktif/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Varian nonaktif")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simpan faktur" }));
    await waitFor(() => expect(customerInvoiceService.update).toHaveBeenCalled());
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

/**
 * PRICED BEYOND THE PET (17 September 2026). A kept line keeps what it was
 * priced on — shown, never re-quoted, never re-sent; a line added here asks its
 * "Dipilih staf" values on the row and sends them.
 */
describe("InvoiceEditor — choices and zone", () => {
  const LOKASI_ID = "5a7f1f77bcf86cd7994391aa";
  const LOKASI = makeVariantOption({
    _id: "vo-lokasi",
    name: "Lokasi",
    source: "staff",
    axisKey: LOKASI_ID,
    sortOrder: 3,
    values: [
      { code: "di-toko", label: "Di Toko", sortOrder: 0, isActive: true },
      { code: "di-rumah", label: "Di Rumah", sortOrder: 1, isActive: true },
    ],
  });

  beforeEach(() => {
    primeVariantOptions(variantOptionService.list, zoneService.list, {
      cards: [...BUILT_IN_VARIANT_OPTIONS, LOKASI],
    });
  });

  it("shows a kept line's stored choices and zone, and sends it by index alone", async () => {
    const user = userEvent.setup();
    renderEditor(
      invoice({
        items: [
          line(),
          line({
            kind: "service",
            refId: "s1",
            name: "Grooming Rumah",
            sku: null,
            qty: "1.0000",
            unitPrice: "175000.0000",
            lineTotal: "175000.0000",
            petId: "pet1",
            petName: "Miko",
            variantChoices: [
              { optionId: LOKASI_ID, name: "Lokasi", code: "di-rumah", label: "Di Rumah" },
            ],
            zone: { zoneId: "z1", name: "Zona A", distanceKm: 2.1 },
          }),
        ],
      }),
    );

    expect(
      await screen.findByText("Lokasi: Di Rumah · Zona A"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Lokasi" })).not.toBeInTheDocument();

    const qty = screen.getByLabelText("Jumlah Kalung Nylon");
    await user.clear(qty);
    await user.type(qty, "3");
    await user.click(screen.getByRole("button", { name: "Simpan faktur" }));

    await waitFor(() => expect(customerInvoiceService.update).toHaveBeenCalled());
    const [, body] = asMock(customerInvoiceService.update).mock.calls[0];
    expect(body.items[1]).toEqual({
      kind: "service",
      refId: "s1",
      qty: "1",
      discount: null,
      fromIndex: 1,
    });
  });

  it("asks a new line's Lokasi on its row, prices it, and sends the choice", async () => {
    asMock(serviceService.list).mockResolvedValue(
      page([
        {
          _id: "s9",
          name: "Grooming Rumah",
          price: null,
          hasVariants: true,
          variantAxes: [LOKASI_ID],
          variants: [
            { choices: [{ optionId: LOKASI_ID, code: "di-toko" }], price: "120000" },
            { choices: [{ optionId: LOKASI_ID, code: "di-rumah" }], price: "175000" },
          ],
        },
      ]),
    );
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      await screen.findByRole("button", { name: "Tambah barang atau jasa" }),
    );
    await user.click(await screen.findByRole("option", { name: /Grooming Rumah/ }));
    await user.click(screen.getByRole("button", { name: "Tambah baris" }));
    await user.click(screen.getByRole("button", { name: /^Hewan untuk Grooming Rumah$/ }));
    await user.click(await screen.findByRole("option", { name: /Miko/ }));

    expect(screen.getByRole("button", { name: "Simpan faktur" })).toBeDisabled();
    expect(
      screen.getAllByText(/Pilih Lokasi untuk Grooming Rumah dulu/).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("combobox", { name: "Lokasi" }));
    await user.click(await screen.findByRole("option", { name: "Di Rumah" }));

    expect(await screen.findAllByText("Rp 175.000")).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Simpan faktur" }));

    await waitFor(() => expect(customerInvoiceService.update).toHaveBeenCalled());
    const [, body] = asMock(customerInvoiceService.update).mock.calls[0];
    expect(body.items[2]).toEqual({
      kind: "service",
      refId: "s9",
      qty: "1",
      discount: null,
      petId: "pet1",
      variantChoices: [{ optionId: LOKASI_ID, code: "di-rumah" }],
    });
  });
});
