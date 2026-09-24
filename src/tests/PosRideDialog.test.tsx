import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
import type { Booking, PosShift, PosTransaction, Zone } from "@/types/api";

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
const ARAH = "5a7f1f77bcf86cd799439202";
const ZONA_A = "5a7f1f77bcf86cd799439301";
const COCO_ID = "5a7f1f77bcf86cd799439122";
const SERVED = "5a7f1f77bcf86cd799439401";
const OTHER = "5a7f1f77bcf86cd799439402";

/**
 * Antar-jemput sold over the counter (24 September 2026).
 *
 * The tile asks two things nothing else on the grid does — which way the van is
 * going, and between which two doors — and what it hands the basket is a real
 * ride, not a grooming that happens to be for a ride service.
 */

const ARAH_CARD = makeVariantOption({
  _id: ARAH,
  name: "Arah",
  source: "staff",
  axisKey: ARAH,
  sortOrder: 4,
  values: [
    { code: "jemput", label: "Jemput", sortOrder: 0, isActive: true },
    { code: "antar", label: "Antar", sortOrder: 1, isActive: true },
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
  createdAt: "2026-09-24T00:00:00.000Z",
  updatedAt: "2026-09-24T00:00:00.000Z",
};

const shift = {
  _id: SHIFT_ID,
  tenantId: "t1",
  branchId: "b1",
  warehouseId: "w1",
  shiftNumber: "SHF-20260924-0001",
  cashierUserId: "u1",
  openedAt: "2026-09-24T02:00:00.000Z",
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
    createdAt: "2026-09-24T02:00:00.000Z",
    updatedAt: "2026-09-24T02:00:00.000Z",
    ...overrides,
  }) as PosTransaction;

const fare = (
  price: string,
  choices: { optionId: string; code: string }[],
) => ({
  petType: null,
  sizeCategory: null,
  furType: null,
  zoneId: ZONA_A,
  durationMin: null,
  isActive: true,
  price,
  choices,
});

/** The ride tile — priced by the zone it crosses and by which way it goes. */
const RIDE = {
  kind: "service" as const,
  _id: "svc-ride",
  name: "Antar-Jemput",
  code: "AJ",
  barcode: null,
  batchCode: null,
  price: null,
  categoryId: null,
  unit: null,
  variantCount: null,
  image: null,
  stock: null,
  serviceKind: "pickup-delivery" as const,
  billingUnit: "per_visit" as const,
  hasVariants: true,
  variantAxes: ["zone", ARAH],
  variants: [
    fare("25000.0000", [{ optionId: ARAH, code: "jemput" }]),
    fare("30000.0000", [{ optionId: ARAH, code: "antar" }]),
  ],
  addons: [],
};

const pin = (lat: number, lng: number) => ({ lat, lng, source: "manual" });

const catalogOf = (tile: object) =>
  mockedPos.catalog.mockResolvedValue({
    items: [tile],
    pagination: { page: 1, limit: 8, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

/** A grooming the van could be fetching for. */
const visit = (overrides: Partial<Booking> = {}) =>
  ({
    _id: SERVED,
    customerId: "cust-1",
    petId: PET_ID,
    petName: "Bruno",
    bookingNumber: "BK-260924-010",
    status: "confirmed",
    scheduledAt: "2026-09-24T04:00:00.000Z",
    service: { name: "Basic Grooming" },
    tripLeg: null,
    trips: [],
    ...overrides,
  }) as unknown as Booking;

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
  mockedBookings.list.mockResolvedValue({
    items: [visit()],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });
  catalogOf(RIDE);

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

  // The till's branch and the customer, each with an address and a pin ~1 km apart.
  mockedBranches.getById.mockResolvedValue({
    _id: "b1",
    name: "Toko Pusat",
    address: "Jl. Cabang 1",
    location: pin(-6.2, 106.8),
  } as unknown as Awaited<ReturnType<typeof branchService.getById>>);
  mockedCustomers.getById.mockResolvedValue({
    _id: "cust-1",
    name: "Ibu Rina",
    address: "Jl. Kemang Raya 12",
    location: pin(-6.209, 106.8),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  primeVariantOptions(variantOptionService.list, zoneService.list, {
    cards: [...BUILT_IN_VARIANT_OPTIONS, ARAH_CARD],
    zones: [ZONE_A],
  });
});

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /pilih pelanggan/i }),
  );
  await user.click(await screen.findByText("Ibu Rina"));
  await user.click(
    await screen.findByRole("button", { name: /antar-jemput/i }),
  );
  await screen.findByRole("heading", { name: /hewan mana yang ikut/i });
}

const addButton = () =>
  screen.getByRole("button", { name: /tambah ke keranjang/i });

describe("PosServicePetDialog — antar-jemput", () => {
  it("asks the direction as a control of its own, not as a variant select", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    const dialog = within(await screen.findByRole("dialog"));
    expect(
      await dialog.findByRole("button", { name: "Jemput", pressed: true }),
    ).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Antar" })).toBeInTheDocument();
    /* Arah carries the price, but it is answered by the direction above — a
       select beside it would be two ways to disagree. */
    expect(dialog.queryByLabelText("Arah")).not.toBeInTheDocument();
  });

  it("fills the two ends from the direction and prices the journey between them", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    const dialog = within(await screen.findByRole("dialog"));
    /* A pickup starts at the customer's door and finishes at the branch. */
    expect(await dialog.findByText("Jl. Kemang Raya 12")).toBeInTheDocument();
    expect(dialog.getByText("Jl. Cabang 1")).toBeInTheDocument();
    expect(await dialog.findByText("Rp 25.000")).toBeInTheDocument();
    expect(addButton()).toBeEnabled();
  });

  it("re-prices and swaps the ends when the direction changes", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    const dialog = within(await screen.findByRole("dialog"));
    await user.click(await dialog.findByRole("button", { name: "Antar" }));

    expect(await dialog.findByText("Rp 30.000")).toBeInTheDocument();
  });

  it("sends the direction, both ends and the answered Arah on the cart write", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    await screen.findByText("Rp 25.000");
    mockedPos.updateCart.mockClear();
    await user.click(addButton());

    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
    const [, body] = mockedPos.updateCart.mock.calls[0];
    expect(body.items).toEqual([
      expect.objectContaining({
        kind: "service",
        refId: "svc-ride",
        /* A RIDE HAS NO `petId` — one van carries several animals, and they go
           in `passengerPetIds`, as the booking it raises keeps them. */
        petId: null,
        passengerPetIds: [PET_ID],
        variantChoices: [{ optionId: ARAH, code: "jemput" }],
        linkedBookingIds: [],
        trip: {
          leg: "pickup",
          origin: {
            address: "Jl. Kemang Raya 12",
            lat: -6.209,
            lng: 106.8,
          },
          destination: { address: "Jl. Cabang 1", lat: -6.2, lng: 106.8 },
        },
      }),
    ]);
  });

  it("holds the button while an end has no pin, and says why", async () => {
    mockedCustomers.getById.mockResolvedValue({
      _id: "cust-1",
      name: "Ibu Rina",
      address: "Jl. Kemang Raya 12",
      location: { lat: null, lng: null, source: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    const dialog = within(await screen.findByRole("dialog"));
    expect(
      await dialog.findByText(/lengkapi titik lokasi asal dan tujuan dulu/i),
    ).toBeInTheDocument();
    /* Not the zone's own sentence — the cashier has simply not typed it yet. */
    expect(dialog.queryByText(/ditentukan dari zona/i)).not.toBeInTheDocument();
    expect(addButton()).toBeDisabled();
  });

  it("lets the cashier type an address the registers do not hold", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    const dialog = within(await screen.findByRole("dialog"));
    await user.click(
      await dialog.findByRole("button", { name: /sumber asal/i }),
    );
    await user.click(await screen.findByRole("option", { name: "Ketik manual" }));

    await user.type(
      await dialog.findByLabelText(/^alamat$/i),
      "Depan Indomaret Bangka",
    );
    fireEvent.change(dialog.getByLabelText(/latitude/i), {
      target: { value: "-6.209" },
    });
    fireEvent.change(dialog.getByLabelText(/longitude/i), {
      target: { value: "106.8" },
    });

    await waitFor(() => expect(addButton()).toBeEnabled());

    mockedPos.updateCart.mockClear();
    await user.click(addButton());

    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
    const [, body] = mockedPos.updateCart.mock.calls[0];
    expect(body.items?.[0]).toMatchObject({
      trip: expect.objectContaining({
        origin: {
          address: "Depan Indomaret Bangka",
          lat: -6.209,
          lng: 106.8,
        },
      }),
    });
  });

  describe("Tautkan ke booking", () => {
    it("reads no diary until the switch is turned on", async () => {
      const user = userEvent.setup();
      renderWithAuth(<PosScreen />);
      await openDialog(user);

      await screen.findByText("Rp 25.000");
      expect(mockedBookings.list).not.toHaveBeenCalled();

      await user.click(screen.getByRole("switch", { name: /tautkan ke booking/i }));

      await waitFor(() => expect(mockedBookings.list).toHaveBeenCalled());
    });

    it("offers the customer's bookings and sends the ticked ones", async () => {
      const user = userEvent.setup();
      renderWithAuth(<PosScreen />);
      await openDialog(user);

      await user.click(screen.getByRole("switch", { name: /tautkan ke booking/i }));
      await user.click(
        await screen.findByRole("checkbox", { name: /BK-260924-010/ }),
      );

      mockedPos.updateCart.mockClear();
      await user.click(addButton());

      await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
      const [, body] = mockedPos.updateCart.mock.calls[0];
      expect(body.items?.[0]).toMatchObject({ linkedBookingIds: [SERVED] });
    });

    it("marks the bookings this basket is already carrying", async () => {
      mockedPos.createCart.mockResolvedValue(cart({ bookingIds: [SERVED] }));
      mockedPos.updateCart.mockResolvedValue(cart({ bookingIds: [SERVED] }));

      const user = userEvent.setup();
      renderWithAuth(<PosScreen />);
      await openDialog(user);

      await user.click(screen.getByRole("switch", { name: /tautkan ke booking/i }));

      expect(await screen.findByText("Ada di keranjang ini.")).toBeInTheDocument();
      expect(
        await screen.findByRole("checkbox", { name: /BK-260924-010/ }),
      ).toBeEnabled();
    });

    /*
      ⚠️ ONE LINE NAMES ONE ANIMAL, so the list is that animal's (on request,
      24 September 2026). A customer with three dogs has three dogs' worth of
      bookings, and offering Coco's grooming under a van carrying Bruno is a
      mis-tick nobody would notice.
    */
    describe("a customer with more than one animal", () => {
      const withTwoPets = () => {
        (petService.list as jest.Mock).mockResolvedValue({
          items: [
            { _id: PET_ID, name: "Bruno" },
            { _id: COCO_ID, name: "Coco" },
          ],
          pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
        });
        mockedBookings.list.mockResolvedValue({
          items: [
            visit(),
            visit({
              _id: OTHER,
              bookingNumber: "BK-260924-011",
              petId: COCO_ID,
              petName: "Coco",
            }),
          ],
          pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
        });
      };

      it("offers only the chosen animals' bookings", async () => {
        withTwoPets();

        const user = userEvent.setup();
        renderWithAuth(<PosScreen />);
        await openDialog(user);

        /* Two animals, so nothing is pre-selected — the cashier says which. */
        await user.click(await screen.findByRole("button", { name: "Bruno" }));
        await user.click(screen.getByRole("switch", { name: /tautkan ke booking/i }));

        expect(
          await screen.findByRole("checkbox", { name: /BK-260924-010/ }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole("checkbox", { name: /BK-260924-011/ }),
        ).not.toBeInTheDocument();
      });

      it("carries several animals in one van, and offers all of their bookings", async () => {
        withTwoPets();

        const user = userEvent.setup();
        renderWithAuth(<PosScreen />);
        await openDialog(user);

        /* Two animals, so nothing is pre-selected — and the van TOGGLES. */
        await user.click(await screen.findByRole("button", { name: "Bruno" }));
        await user.click(screen.getByRole("button", { name: "Coco" }));
        await user.click(screen.getByRole("switch", { name: /tautkan ke booking/i }));

        expect(
          await screen.findByRole("checkbox", { name: /BK-260924-010/ }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("checkbox", { name: /BK-260924-011/ }),
        ).toBeInTheDocument();

        mockedPos.updateCart.mockClear();
        await user.click(addButton());

        await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
        const [, body] = mockedPos.updateCart.mock.calls[0];
        /* ONE line, not two — a van is charged once however many ride. */
        expect(body.items).toHaveLength(1);
        expect(body.items?.[0]).toMatchObject({
          petId: null,
          passengerPetIds: [PET_ID, COCO_ID],
        });
      });

      it("takes an animal back out of the van", async () => {
        withTwoPets();

        const user = userEvent.setup();
        renderWithAuth(<PosScreen />);
        await openDialog(user);

        await user.click(await screen.findByRole("button", { name: "Bruno" }));
        await user.click(screen.getByRole("button", { name: "Coco" }));
        await user.click(screen.getByRole("button", { name: "Coco" }));

        mockedPos.updateCart.mockClear();
        await user.click(addButton());

        await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
        const [, body] = mockedPos.updateCart.mock.calls[0];
        expect(body.items?.[0]).toMatchObject({ passengerPetIds: [PET_ID] });
      });

      /*
        ⚠️ ONLY THE LEAVING ANIMAL'S LINKS GO. Taking Coco out must not untick
        the grooming the van is still fetching for Bruno — the cashier would
        have to find and re-tick it, and on a busy counter they would not
        notice it had gone.
      */
      it("drops only the links of an animal taken out of the van", async () => {
        withTwoPets();

        const user = userEvent.setup();
        renderWithAuth(<PosScreen />);
        await openDialog(user);

        await user.click(await screen.findByRole("button", { name: "Bruno" }));
        await user.click(screen.getByRole("button", { name: "Coco" }));
        await user.click(screen.getByRole("switch", { name: /tautkan ke booking/i }));

        await user.click(
          await screen.findByRole("checkbox", { name: /BK-260924-010/ }),
        );
        await user.click(
          await screen.findByRole("checkbox", { name: /BK-260924-011/ }),
        );

        await user.click(screen.getByRole("button", { name: "Coco" }));

        mockedPos.updateCart.mockClear();
        await user.click(addButton());

        await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
        const [, body] = mockedPos.updateCart.mock.calls[0];
        expect(body.items?.[0]).toMatchObject({
          passengerPetIds: [PET_ID],
          /* Bruno's link survives; Coco's went with Coco. */
          linkedBookingIds: [SERVED],
        });
      });
    });

    it("closes a booking that already has a van going this way, with the reason", async () => {
      mockedBookings.list.mockResolvedValue({
        items: [
          visit({
            trips: [
              {
                _id: OTHER,
                bookingNumber: "BK-260924-020",
                tripLeg: "pickup",
                status: "confirmed",
                scheduledAt: "2026-09-24T03:00:00.000Z",
              },
            ],
          }),
        ],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });

      const user = userEvent.setup();
      renderWithAuth(<PosScreen />);
      await openDialog(user);

      await user.click(screen.getByRole("switch", { name: /tautkan ke booking/i }));

      const row = await screen.findByRole("checkbox", { name: /BK-260924-010/ });
      expect(row).toBeDisabled();
      expect(
        screen.getByText(/sudah punya perjalanan jemput/i),
      ).toBeInTheDocument();
    });

    it("opens the same booking again for the other direction", async () => {
      mockedBookings.list.mockResolvedValue({
        items: [
          visit({
            trips: [
              {
                _id: OTHER,
                bookingNumber: "BK-260924-020",
                tripLeg: "pickup",
                status: "confirmed",
                scheduledAt: "2026-09-24T03:00:00.000Z",
              },
            ],
          }),
        ],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });

      const user = userEvent.setup();
      renderWithAuth(<PosScreen />);
      await openDialog(user);

      const dialog = within(await screen.findByRole("dialog"));
      await user.click(await dialog.findByRole("button", { name: "Antar" }));
      await user.click(screen.getByRole("switch", { name: /tautkan ke booking/i }));

      expect(
        await screen.findByRole("checkbox", { name: /BK-260924-010/ }),
      ).toBeEnabled();
    });

    it("multiplies a per_pet fare by the bookings the van serves", async () => {
      catalogOf({ ...RIDE, billingUnit: "per_pet" });
      mockedBookings.list.mockResolvedValue({
        items: [
          visit(),
          visit({ _id: OTHER, bookingNumber: "BK-260924-011", petName: "Coco" }),
        ],
        pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      });

      const user = userEvent.setup();
      renderWithAuth(<PosScreen />);
      await openDialog(user);

      await user.click(screen.getByRole("switch", { name: /tautkan ke booking/i }));
      await user.click(
        await screen.findByRole("checkbox", { name: /BK-260924-010/ }),
      );
      await user.click(
        await screen.findByRole("checkbox", { name: /BK-260924-011/ }),
      );

      const dialog = within(await screen.findByRole("dialog"));
      expect(await dialog.findByText("Rp 50.000")).toBeInTheDocument();
      expect(dialog.getByText(/2 booking × Rp 25\.000/)).toBeInTheDocument();
    });
  });
});
