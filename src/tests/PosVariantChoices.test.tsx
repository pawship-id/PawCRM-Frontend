import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosScreen } from "@/features/pos";
import { posService } from "@/services/pos.service";
import { bookingService } from "@/services/booking.service";
import { warehouseService } from "@/services/warehouse.service";
import { categoryService } from "@/services/category.service";
import { userService } from "@/services/user.service";
import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { variantOptionService } from "@/services/variantOption.service";
import { zoneService } from "@/services/zone.service";
import { ApiError } from "@/services/api-error";
import type { PosItem, PosShift, PosTransaction, Zone } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";
import {
  BUILT_IN_VARIANT_OPTIONS,
  makeVariantOption,
  primeVariantOptions,
} from "./helpers/variantOptions";

jest.mock("@/services/pos.service");
jest.mock("@/services/booking.service");
jest.mock("@/services/warehouse.service");
jest.mock("@/services/category.service");
jest.mock("@/services/user.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/service.service");
jest.mock("@/services/variantOption.service");
jest.mock("@/services/zone.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const mockedPos = posService as jest.Mocked<typeof posService>;
const mockedBookings = bookingService as jest.Mocked<typeof bookingService>;
const mockedBranches = branchService as jest.Mocked<typeof branchService>;
const mockedCustomers = customerService as jest.Mocked<typeof customerService>;

const SHIFT_ID = "5a7f1f77bcf86cd7994390d1";
const CART_ID = "5a7f1f77bcf86cd7994390e1";
const PET_ID = "5a7f1f77bcf86cd799439121";
/** A "Dipilih staf" card — its axis key is its own id. */
const LOKASI = "5a7f1f77bcf86cd799439201";
const ZONA_A = "5a7f1f77bcf86cd799439301";

const LOKASI_CARD = makeVariantOption({
  _id: LOKASI,
  name: "Lokasi",
  source: "staff",
  axisKey: LOKASI,
  sortOrder: 3,
  values: [
    { code: "di-toko", label: "Di Toko", sortOrder: 0, isActive: true },
    { code: "di-rumah", label: "Di Rumah", sortOrder: 1, isActive: true },
  ],
});

const ZONE_A: Zone = {
  _id: ZONA_A,
  tenantId: "t1",
  name: "Zona A",
  nameKey: "zona a",
  description: null,
  minKm: 0,
  maxKm: 5,
  createdBy: null,
  deletedAt: null,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
};

const shift = {
  _id: SHIFT_ID,
  tenantId: "t1",
  branchId: "b1",
  warehouseId: "w1",
  shiftNumber: "SHF-20260917-0001",
  cashierUserId: "u1",
  openedAt: "2026-09-17T02:00:00.000Z",
  openingCash: "500000.0000",
  status: "open",
} as unknown as PosShift;

const cart = (overrides: Partial<PosTransaction> = {}): PosTransaction =>
  ({
    _id: CART_ID,
    tenantId: "t1",
    branchId: "b1",
    warehouseId: "w1",
    shiftId: SHIFT_ID,
    transactionNumber: null,
    customerId: "cust-1",
    customer: { _id: "cust-1", name: "Ibu Rina", phone: "081234567890" },
    items: [],
    cartDiscount: null,
    otherCharges: [],
    note: null,
    payments: [],
    totals: null,
    customerInvoiceId: null,
    runningTotals: {
      subtotal: "0.0000",
      itemDiscount: "0.0000",
      cartDiscount: "0.0000",
      otherCharges: "0.0000",
      net: "0.0000",
    },
    status: "active",
    heldLabel: null,
    bookingIds: [],
    paidAt: null,
    createdAt: "2026-09-17T02:00:00.000Z",
    updatedAt: "2026-09-17T02:00:00.000Z",
    ...overrides,
  }) as PosTransaction;

const variant = (
  price: string,
  extra: { choices?: { optionId: string; code: string }[]; zoneId?: string },
) => ({
  petType: null,
  sizeCategory: null,
  furType: null,
  durationMin: 90,
  isActive: true,
  price,
  ...extra,
});

/** Priced by where it is done — in the shop or at the door. */
const HOME_BY_LOKASI = {
  kind: "service" as const,
  _id: "svc-home",
  name: "Grooming Rumah",
  code: "GRH",
  barcode: null,
  batchCode: null,
  price: null,
  categoryId: null,
  unit: null,
  variantCount: null,
  image: null,
  stock: null,
  hasVariants: true,
  variantAxes: [LOKASI],
  variants: [
    variant("100000.0000", {
      choices: [{ optionId: LOKASI, code: "di-toko" }],
    }),
    variant("150000.0000", {
      choices: [{ optionId: LOKASI, code: "di-rumah" }],
    }),
  ],
  addons: [],
};

/** Priced by how far the customer lives from the branch. */
const HOME_BY_ZONE = {
  ...HOME_BY_LOKASI,
  variantAxes: ["zone"],
  variants: [variant("175000.0000", { zoneId: ZONA_A })],
};

const pin = (lat: number, lng: number) => ({ lat, lng, source: "manual" });

const catalogOf = (tile: object) =>
  mockedPos.catalog.mockResolvedValue({
    items: [tile],
    pagination: { page: 1, limit: 8, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

beforeEach(() => {
  mockedPos.currentShift.mockResolvedValue(shift);
  mockedPos.xReport.mockResolvedValue({
    shift,
    transactionCount: 0,
    breakdown: [],
    refunds: { count: 0, cashRefunds: "0.0000" },
    totals: {
      takings: "0.0000",
      cashTakings: "0.0000",
      expectedCash: "500000.0000",
    },
  });
  mockedPos.heldCarts.mockResolvedValue([]);
  mockedPos.activeCart.mockResolvedValue(null);
  mockedPos.createCart.mockResolvedValue(cart());
  mockedPos.updateCart.mockResolvedValue(cart());
  mockedBookings.bridge.mockResolvedValue([]);
  catalogOf(HOME_BY_LOKASI);

  const lists = [
    [categoryService, { _id: "c1", name: "Makanan" }],
    [warehouseService, { _id: "w1", name: "Gudang Utama" }],
    [branchService, { _id: "b1", name: "Toko Pusat" }],
    [userService, { _id: "u1", fullName: "Bu Rina" }],
    [
      customerService,
      { _id: "cust-1", name: "Ibu Rina", phone: "081234567890" },
    ],
    [petService, { _id: PET_ID, name: "Bruno" }],
    [serviceService, { _id: "svc-1", name: "Grooming", price: "150000.0000" }],
  ] as const;

  lists.forEach(([service, item]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).list.mockResolvedValue({
      items: [item],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
  });

  // The till's branch and the customer, each with a pin ~1 km apart.
  mockedBranches.getById.mockResolvedValue({
    _id: "b1",
    location: pin(-6.2, 106.8),
  } as unknown as Awaited<ReturnType<typeof branchService.getById>>);
  mockedCustomers.getById.mockResolvedValue({
    _id: "cust-1",
    name: "Ibu Rina",
    location: pin(-6.209, 106.8),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  primeVariantOptions(variantOptionService.list, zoneService.list, {
    cards: [...BUILT_IN_VARIANT_OPTIONS, LOKASI_CARD],
    zones: [ZONE_A],
  });
});

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /pilih pelanggan/i }),
  );
  await user.click(await screen.findByText("Ibu Rina"));
  await user.click(
    await screen.findByRole("button", { name: /grooming rumah/i }),
  );
  await screen.findByRole("heading", { name: /untuk hewan yang mana/i });
}

describe("PosServicePetDialog — priced beyond the animal", () => {
  it("asks the Lokasi of a service with a staff card, and holds the button until it is chosen", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    expect(await screen.findByLabelText("Lokasi")).toBeInTheDocument();
    expect(
      await screen.findByText("Pilih Lokasi untuk Grooming Rumah dulu"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /tambah ke keranjang/i }),
    ).toBeDisabled();
  });

  it("previews the price of the variant for the chosen Lokasi", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    await user.click(await screen.findByLabelText("Lokasi"));
    await user.click(await screen.findByRole("option", { name: "Di Rumah" }));

    expect(
      await within(await screen.findByRole("dialog")).findByText("Rp 150.000"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/pilih lokasi untuk/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /tambah ke keranjang/i }),
    ).toBeEnabled();
  });

  it("sends the chosen Lokasi with the line on the cart write", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    await user.click(await screen.findByLabelText("Lokasi"));
    await user.click(await screen.findByRole("option", { name: "Di Rumah" }));

    mockedPos.updateCart.mockClear();
    await user.click(
      screen.getByRole("button", { name: /tambah ke keranjang/i }),
    );

    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
    const [, body] = mockedPos.updateCart.mock.calls[0];
    expect(body.items).toEqual([
      expect.objectContaining({
        kind: "service",
        refId: "svc-home",
        petId: PET_ID,
        variantChoices: [{ optionId: LOKASI, code: "di-rumah" }],
      }),
    ]);
  });

  it("measures the zone from the till's branch to the customer's pin", async () => {
    catalogOf(HOME_BY_ZONE);

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    expect(
      await within(await screen.findByRole("dialog")).findByText("Rp 175.000"),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Zona A · 1(,\d+)? km$/)).toBeInTheDocument();
    expect(mockedBranches.getById).toHaveBeenCalledWith("b1");
    expect(mockedCustomers.getById).toHaveBeenCalledWith("cust-1");
    expect(
      screen.getByRole("button", { name: /tambah ke keranjang/i }),
    ).toBeEnabled();
  });

  it("blocks with the zone reason when the customer has no pin", async () => {
    catalogOf(HOME_BY_ZONE);
    mockedCustomers.getById.mockResolvedValue({
      _id: "cust-1",
      name: "Ibu Rina",
      location: { lat: null, lng: null, source: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    expect(
      await screen.findByText(
        "Koordinat alamat pelanggan belum diisi — harga Grooming Rumah ditentukan dari zona",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).queryByText("Rp 175.000"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /tambah ke keranjang/i }),
    ).toBeDisabled();
  });

  it("does not ask for pins for a service that does not vary by zone", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    await screen.findByLabelText("Lokasi");
    expect(mockedCustomers.getById).not.toHaveBeenCalled();
  });
});

describe("PosCart — a line priced beyond the animal", () => {
  const soldLine = {
    kind: "service",
    refId: "svc-home",
    name: "Grooming Rumah",
    sku: null,
    qty: "1.0000",
    unitPrice: "175000.0000",
    lineTotal: "175000.0000",
    discount: null,
    hppAtTime: null,
    bookingId: null,
    parentServiceId: null,
    petId: PET_ID,
    petName: "Bruno",
    groomerName: null,
    bookingStatus: null,
    bookingOwned: false,
    bookingNumber: null,
    variantChoices: [
      { optionId: LOKASI, name: "Lokasi", code: "di-rumah", label: "Di Rumah" },
    ],
    zone: { zoneId: ZONA_A, name: "Zona A", distanceKm: 1 },
  } as unknown as PosItem;

  const heldCart = () =>
    cart({
      items: [soldLine],
      runningTotals: {
        subtotal: "175000.0000",
        itemDiscount: "0.0000",
        cartDiscount: "0.0000",
        otherCharges: "0.0000",
        net: "175000.0000",
      },
    });

  it("shows the stored choice and zone under the line", async () => {
    mockedPos.activeCart.mockResolvedValue(heldCart());
    renderWithAuth(<PosScreen />);

    expect(
      await screen.findByText("Lokasi: Di Rumah · Zona A"),
    ).toBeInTheDocument();
  });

  it("sends the line's choices back on every cart write", async () => {
    mockedPos.activeCart.mockResolvedValue(heldCart());
    mockedPos.updateCart.mockResolvedValue(heldCart());

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await screen.findByText("Lokasi: Di Rumah · Zona A");
    // A write that has nothing to do with the grooming: its discount popover.
    await user.click(
      screen.getByRole("button", { name: /diskon grooming rumah/i }),
    );
    await user.type(
      await screen.findByLabelText(/diskon (persen|rupiah)/i),
      "10",
    );
    mockedPos.updateCart.mockClear();
    await user.click(screen.getByRole("button", { name: /terapkan/i }));

    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
    const [, body] = mockedPos.updateCart.mock.calls[0];
    expect(body.items?.[0]).toEqual(
      expect.objectContaining({
        refId: "svc-home",
        variantChoices: [{ optionId: LOKASI, code: "di-rumah" }],
      }),
    );
  });

  it("says the server's refusal in the counter's words", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    await user.click(await screen.findByLabelText("Lokasi"));
    await user.click(await screen.findByRole("option", { name: "Di Rumah" }));

    mockedPos.updateCart.mockRejectedValue(
      new ApiError("Validation failed", 400, {
        details: [
          {
            field: "variantChoices",
            message: "Pilih Lokasi untuk Grooming Rumah dulu",
            optionId: LOKASI,
          } as never,
        ],
      }),
    );
    await user.click(
      screen.getByRole("button", { name: /tambah ke keranjang/i }),
    );

    expect(
      await screen.findByText("Pilih Lokasi untuk Grooming Rumah dulu"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Validation failed")).not.toBeInTheDocument();
  });
});
