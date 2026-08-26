import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosScreen } from "@/features/pos";
import { PosCart } from "@/features/pos/components/PosCart";
import { posService } from "@/services/pos.service";
import { bookingService } from "@/services/booking.service";
import { warehouseService } from "@/services/warehouse.service";
import { categoryService } from "@/services/category.service";
import { userService } from "@/services/user.service";
import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import type { Booking, PosShift, PosTransaction } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/pos.service");
jest.mock("@/services/booking.service");
jest.mock("@/services/warehouse.service");
jest.mock("@/services/category.service");
jest.mock("@/services/user.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/service.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const mockedPos = posService as jest.Mocked<typeof posService>;
const mockedBookings = bookingService as jest.Mocked<typeof bookingService>;

const SHIFT_ID = "5a7f1f77bcf86cd7994390d1";
const CART_ID = "5a7f1f77bcf86cd7994390e1";
const BOOKING_ID = "5a7f1f77bcf86cd799439141";
const PET_ID = "5a7f1f77bcf86cd799439121";

const shift = {
  _id: SHIFT_ID,
  tenantId: "t1",
  branchId: "b1",
  warehouseId: "w1",
  shiftNumber: "SHF-20260826-0001",
  cashierUserId: "u1",
  openedAt: "2026-08-26T02:00:00.000Z",
  openingCash: "500000.0000",
  status: "open",
} as unknown as PosShift;

const booking = (overrides: Partial<Booking> = {}): Booking =>
  ({
    _id: BOOKING_ID,
    tenantId: "t1",
    branchId: "b1",
    bookingNumber: "BK-260826-001",
    customerId: "cust-1",
    petId: PET_ID,
    petName: "Bruno",
  customerName: "Ibu Rina",
    items: [
      {
        serviceId: "svc-1",
        name: "Grooming Full Service",
        price: "150000.0000",
        groomerUserId: null,
        groomerName: "Belum ditentukan",
      },
    ],
    scheduledAt: "2026-08-26T03:00:00.000Z",
    status: "confirmed",
    origin: "booking",
    posTransactionId: null,
    pulledToCartAt: null,
    notes: null,
    cancelReason: null,
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    ...overrides,
  }) as Booking;

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
    // A basket the till is building — NOT parked.
    status: "active",
    heldLabel: null,
    bookingIds: [],
    paidAt: null,
    createdAt: "2026-08-26T02:00:00.000Z",
    updatedAt: "2026-08-26T02:00:00.000Z",
    ...overrides,
  }) as PosTransaction;

/** A basket already holding the pulled grooming. */
const pulledCart = () =>
  cart({
    bookingIds: [BOOKING_ID],
    items: [
      {
        kind: "service",
        refId: "svc-1",
        name: "Grooming Full Service",
        sku: null,
        qty: "1.0000",
        unitPrice: "150000.0000",
        lineTotal: "150000.0000",
        discount: null,
        hppAtTime: null,
        bookingId: BOOKING_ID,
        petId: PET_ID,
        petName: "Bruno",
        groomerName: "Belum ditentukan",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ],
    runningTotals: {
      subtotal: "150000.0000",
      itemDiscount: "0.0000",
      cartDiscount: "0.0000",
      otherCharges: "0.0000",
      net: "150000.0000",
    },
  });

beforeEach(() => {
  mockedPos.currentShift.mockResolvedValue(shift);
  mockedPos.heldCarts.mockResolvedValue([]);
  // The basket recovered on load — null is the ordinary answer.
  mockedPos.activeCart.mockResolvedValue(null);
  mockedPos.catalog.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 8, total: 0, totalPages: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  mockedPos.createCart.mockResolvedValue(cart());
  mockedPos.updateCart.mockResolvedValue(cart());
  mockedPos.pullBookings.mockResolvedValue(pulledCart());
  mockedBookings.bridge.mockResolvedValue([booking()]);

  const lists = [
    [categoryService, { _id: "c1", name: "Makanan" }],
    [warehouseService, { _id: "w1", name: "Gudang Utama" }],
    [branchService, { _id: "b1", name: "Toko Pusat" }],
    [userService, { _id: "u1", fullName: "Bu Rina" }],
    [customerService, { _id: "cust-1", name: "Ibu Rina", phone: "081234567890" }],
    [petService, { _id: PET_ID, name: "Bruno" }],
    [serviceService, { _id: "svc-1", name: "Grooming Full Service", price: "150000.0000" }],
  ] as const;

  lists.forEach(([service, item]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).list.mockResolvedValue({
      items: [item],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
  });
});

/**
 * Puts a customer on the basket, which is also what CREATES it.
 *
 * The banner cannot exist before a cart does — the cart is made lazily, on the
 * first thing that touches it. Choosing a customer is that first thing in every
 * real booking sale, because the bridge has nobody to ask about until then.
 */
async function pickCustomer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /pilih pelanggan/i }),
  );
  await user.click(await screen.findByText("Ibu Rina"));
}

/**
 * FR-3, end to end at the till.
 *
 * These are the tests that would have caught the gap: every piece of this
 * existed and was green in its own suite, and none of it was reachable from the
 * till. A component test that never renders `PosScreen` cannot tell you that.
 */
describe("PosScreen — FR-3's banner", () => {
  it("does not ask for bookings at all until a customer is chosen", async () => {
    renderWithAuth(<PosScreen />);
    await screen.findByRole("button", { name: /pilih pelanggan/i });

    expect(mockedBookings.bridge).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Tarik" })).not.toBeInTheDocument();
  });

  it("appears once the customer has appointments today, and says how many", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await pickCustomer(user);

    expect(await screen.findByText(/1 booking/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tarik" })).toBeInTheDocument();
  });

  /*
    A banner reading "0 booking" is a permanent orange rectangle — the ui-rules
    proportion rule broken by attrition.
  */
  it("renders nothing when the customer has no bookings today", async () => {
    const user = userEvent.setup();
    mockedBookings.bridge.mockResolvedValue([]);

    renderWithAuth(<PosScreen />);
    await pickCustomer(user);

    await waitFor(() => expect(mockedBookings.bridge).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Tarik" })).not.toBeInTheDocument();
  });
});

describe("PosScreen — pulling a booking into the basket", () => {
  it("opens the bridge, grouped under the animal's name", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await pickCustomer(user);
    await user.click(await screen.findByRole("button", { name: "Tarik" }));

    expect(
      await screen.findByRole("heading", { name: "Bruno" }),
    ).toBeInTheDocument();
    expect(screen.getByText("BK-260826-001")).toBeInTheDocument();
  });

  it('names an unassigned groomer rather than leaving the line blank', async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await pickCustomer(user);
    await user.click(await screen.findByRole("button", { name: "Tarik" }));

    expect(await screen.findByText("Belum ditentukan")).toBeInTheDocument();
  });

  it("sends only the ids — the server prices the lines", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await pickCustomer(user);
    await user.click(await screen.findByRole("button", { name: "Tarik" }));
    await user.click(
      await screen.findByRole("checkbox", { name: /BK-260826-001/ }),
    );
    await user.click(screen.getByRole("button", { name: /tarik ke keranjang/i }));

    await waitFor(() => expect(mockedPos.pullBookings).toHaveBeenCalled());
    expect(mockedPos.pullBookings).toHaveBeenCalledWith(CART_ID, [BOOKING_ID]);
  });

  it("re-asks the bridge afterwards, so a pulled booking drops out", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await pickCustomer(user);
    await user.click(await screen.findByRole("button", { name: "Tarik" }));
    const before = mockedBookings.bridge.mock.calls.length;

    await user.click(
      await screen.findByRole("checkbox", { name: /BK-260826-001/ }),
    );
    await user.click(screen.getByRole("button", { name: /tarik ke keranjang/i }));

    await waitFor(() =>
      expect(mockedBookings.bridge.mock.calls.length).toBeGreaterThan(before),
    );
  });
});

/**
 * FR-3: "modal dibuka dari banner ATAU tombol booking".
 *
 * For a while only the banner existed, which made the whole ad-hoc half
 * unreachable for exactly the customer it was built for — somebody walking in
 * with no appointment, because the banner only appears when there IS one. A
 * shortcut you can only reach by already having the thing it replaces is not a
 * shortcut.
 */
describe("PosScreen — the way in that does not need a banner", () => {
  it("offers the button even when the customer has no bookings today", async () => {
    const user = userEvent.setup();
    mockedBookings.bridge.mockResolvedValue([]);

    renderWithAuth(<PosScreen />);
    await pickCustomer(user);

    expect(
      await screen.findByRole("button", { name: /tambah layanan untuk hewan/i }),
    ).toBeInTheDocument();
    // And no banner, because there is nothing to be alerted about.
    expect(screen.queryByRole("button", { name: "Tarik" })).not.toBeInTheDocument();
  });

  it("opens straight onto the ad-hoc tab — the cashier already said so", async () => {
    const user = userEvent.setup();
    // Bookings DO exist, so the modal would otherwise default to the pull list.
    renderWithAuth(<PosScreen />);
    await pickCustomer(user);

    await user.click(
      await screen.findByRole("button", { name: /tambah layanan untuk hewan/i }),
    );

    expect(
      await screen.findByRole("button", { name: /tambah ke keranjang/i }),
    ).toBeInTheDocument();
  });

  it("still opens onto the pull list from the banner", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await pickCustomer(user);

    await user.click(await screen.findByRole("button", { name: "Tarik" }));

    expect(
      await screen.findByRole("heading", { name: "Bruno" }),
    ).toBeInTheDocument();
  });

  /*
    An ad-hoc booking needs a pet and a pet needs an owner, so there is no
    half-state to explain — and PosCustomerSection directly above is already
    inviting the cashier to choose somebody.
  */
  it("shows neither before a customer is chosen", async () => {
    renderWithAuth(<PosScreen />);
    await screen.findByRole("button", { name: /pilih pelanggan/i });

    expect(
      screen.queryByRole("button", { name: /tambah layanan untuk hewan/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tarik" })).not.toBeInTheDocument();
  });
});

describe("PosCart — the pulled lines", () => {
  const render = (basket: PosTransaction) =>
    renderWithAuth(
      <PosCart
        cart={basket}
        busy={false}
        error={null}
        onQtyChange={jest.fn()}
        onRemove={jest.fn()}
        onItemDiscount={jest.fn()}
        onCartDiscount={jest.fn()}
        onCharges={jest.fn()}
        onPickCustomer={jest.fn()}
        onClearCustomer={jest.fn()}
        onHold={jest.fn()}
        onCheckout={jest.fn()}
      />,
    );

  it("heads the group with the animal's name and the booking", async () => {
    render(pulledCart());

    expect(await screen.findByText("Bruno")).toBeInTheDocument();
    expect(screen.getByText(/Booking ·/)).toBeInTheDocument();
  });

  /*
    FR-3: "item hasil booking tidak memiliki stepper qty manual". A service is
    one line per animal per service, and a stepper would invite a cashier to
    charge for two groomings of one dog.
  */
  it("gives a pulled service no quantity stepper", async () => {
    render(pulledCart());

    await screen.findByText("Grooming Full Service");
    expect(
      screen.queryByRole("button", { name: /kurangi grooming/i }),
    ).not.toBeInTheDocument();
  });

  /*
    A basket may already hold retail goods, and those are not part of any
    appointment — wrapping them in a titled box would invent a group nobody
    asked for.
  */
  it("gives retail lines no header at all", async () => {
    render(
      cart({
        items: [
          {
            kind: "product",
            refId: "p1",
            name: "Royal Canin 2kg",
            sku: "RC-2KG",
            qty: "1.0000",
            unitPrice: "300000.0000",
            lineTotal: "300000.0000",
            discount: null,
            hppAtTime: null,
            bookingId: null,
            petId: null,
            petName: null,
            groomerName: null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
      }),
    );

    await screen.findByText("Royal Canin 2kg");
    expect(screen.queryByText(/Booking ·/)).not.toBeInTheDocument();
  });

  /*
    FR-3's edge case: "hewan yang sama muncul di 2 booking berbeda pada hari yang
    sama — keduanya tetap ditampilkan sebagai baris terpisah, tidak digabung
    otomatis". They may be a morning bath and an afternoon nail trim.
  */
  it("keeps two bookings for one animal as two groups", async () => {
    const line = (bookingId: string, name: string) => ({
      kind: "service",
      refId: `svc-${bookingId}`,
      name,
      sku: null,
      qty: "1.0000",
      unitPrice: "50000.0000",
      lineTotal: "50000.0000",
      discount: null,
      hppAtTime: null,
      bookingId,
      petId: PET_ID,
      petName: "Bruno",
      groomerName: "Belum ditentukan",
    });

    render(
      cart({
        items: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          line("bk-1", "Mandi") as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          line("bk-2", "Potong kuku") as any,
        ],
      }),
    );

    await screen.findByText("Mandi");
    // Two headers, not one merged group.
    expect(screen.getAllByText("Bruno")).toHaveLength(2);
  });
});

/**
 * FR-3's shortcut, end to end — and the rule about WHEN.
 *
 * "Membuat booking baru di backend berstatus Completed **setelah pembayaran
 * selesai**." The first version created it the moment Tambah ke keranjang was
 * pressed, so a line the cashier then deleted left an appointment for a grooming
 * nobody was ever charged for, sitting in the day sheet.
 */
describe("PosScreen — adding a service for an animal", () => {
  const openAdhoc = async (user: ReturnType<typeof userEvent.setup>) => {
    await pickCustomer(user);
    await user.click(
      await screen.findByRole("button", { name: /tambah layanan untuk hewan/i }),
    );
    await user.click(
      await screen.findByRole("checkbox", { name: /grooming full service/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /tambah ke keranjang/i }),
    );
  };

  it("puts the service in the basket and writes no booking at all", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await openAdhoc(user);

    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
    expect(mockedBookings.create).not.toHaveBeenCalled();
  });

  it("carries the animal on the line, so the sale can be attributed", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await openAdhoc(user);

    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());

    const calls = mockedPos.updateCart.mock.calls;
    const [, body] = calls[calls.length - 1];

    expect(body.items).toEqual([
      expect.objectContaining({ kind: "service", refId: "svc-1", petId: PET_ID }),
    ]);
  });

  /*
    A name a client sends is a label anybody could forge onto somebody else's
    receipt — and the receipt is the document the customer keeps. The server
    resolves it from `petId` against the basket's own customer.
  */
  it("does not send the animal's name", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await openAdhoc(user);

    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());

    const calls = mockedPos.updateCart.mock.calls;
    const [, body] = calls[calls.length - 1];

    expect(body.items?.[0]).not.toHaveProperty("petName");
  });
});
