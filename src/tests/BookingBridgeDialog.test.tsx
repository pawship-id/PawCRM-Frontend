import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingBridgeDialog } from "@/features/booking";
import { bookingService } from "@/services/booking.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import type { Booking } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/service.service");

const mockedBookings = bookingService as jest.Mocked<typeof bookingService>;
const mockedPets = petService as jest.Mocked<typeof petService>;
const mockedServices = serviceService as jest.Mocked<typeof serviceService>;

const CUSTOMER_ID = "5a7f1f77bcf86cd7994390c1";
const PET_ID = "5a7f1f77bcf86cd7994390d1";
const SERVICE_ID = "5a7f1f77bcf86cd7994390e1";

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  _id: "5a7f1f77bcf86cd799439101",
  tenantId: "507f1f77bcf86cd799439011",
  branchId: "5a7f1f77bcf86cd7994390b1",
  bookingNumber: "BK-260824-001",
  customerId: CUSTOMER_ID,
  /* The visit's own shape: a salon booking with no trip and nothing handed in. */
  location: "in_store",
  pickupRequested: false,
  deliveryRequested: false,
  tripAddress: null,
  belongings: [],
  createdByName: null,
  createdByRoleName: null,
  // AFTER PCR-040: the animals live on the rows, and the header lists them.
  pets: [{ petId: PET_ID, petName: "Bruno" }],
  petCount: 1,
  totalAmount: "150000.0000",
  totalDurationMin: null,
  billingState: "unbilled",
  items: [
    {
      _id: "5a7f1f77bcf86cd799439151",
      petId: PET_ID,
      petName: "Bruno",
    /* Null on a main service — an add-on names the row it hangs off. */
    parentItemId: null,
      serviceId: SERVICE_ID,
      name: "Grooming Full Service",
      price: "150000.0000",
      durationMin: null,
      notes: null,
      pulledToCartAt: null,
      pulledToInvoiceAt: null,
      groomerUserId: null,
      // Never null — the server names an unassigned slot (FR-3's edge case).
      groomerName: "Belum ditentukan",
    },
  ],
  petName: "Bruno",
  customerName: "Ibu Rina",
  scheduledAt: "2026-08-24T02:00:00.000Z",
  status: "confirmed",
  statusHistory: [],
  origin: "booking",
  posTransactionId: null,
  notes: null,
  cancelReason: null,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  ...overrides,
});

function page<T>(items: T[]) {
  return {
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedPets.list.mockResolvedValue(
    page([{ _id: PET_ID, name: "Bella", customerId: CUSTOMER_ID }]),
  );
  mockedServices.list.mockResolvedValue(
    page([
      { _id: SERVICE_ID, name: "Grooming Full Service", price: "150000.0000" },
    ]),
  );
});

function open(onPull = jest.fn(), onAdd = jest.fn()) {
  renderWithAuth(
    <BookingBridgeDialog
      customerId={CUSTOMER_ID}
      customerName="Ibu Rina"
      open
      onOpenChange={jest.fn()}
      onPull={onPull}
      onAdd={onAdd}
    />,
  );
  return onPull;
}

/** The ad-hoc tab's callback, which is the half these tests are about. */
function openAdhoc() {
  const onAdd = jest.fn();
  open(jest.fn(), onAdd);
  return onAdd;
}

describe("BookingBridgeDialog — both tabs are always reachable", () => {
  it("offers the ad-hoc tab even when there are bookings to pull", async () => {
    // FR-3: "Kedua tab tersedia setiap kali modal dibuka."
    mockedBookings.bridge.mockResolvedValue([booking()]);
    open();

    expect(
      await screen.findByRole("button", { name: /tambah layanan baru/i }),
    ).toBeVisible();
  });

  it("opens on the pull tab when there is something to pull", async () => {
    mockedBookings.bridge.mockResolvedValue([booking()]);
    open();

    expect(await screen.findByText("BK-260824-001")).toBeVisible();
  });

  it("opens on the ad-hoc tab when there is nothing to pull", async () => {
    // Opening on an empty list and asking somebody to notice a second tab is a
    // worse first frame than opening on the tab that can do something.
    mockedBookings.bridge.mockResolvedValue([]);
    open();

    /*
      The label now names the animal in front of the cashier — the checklist is
      per pet, and a bare "Layanan" would not say whose.
    */
    expect(await screen.findByText(/^Layanan untuk Bella$/)).toBeVisible();
  });

  it("does not move a cashier off a tab they chose, when data lands late", async () => {
    /*
      The bug the derived default exists to prevent: an effect that flipped the
      tab on arrival would move somebody who had already tapped through — or, on
      a slow connection, move them mid-tick.
    */
    let resolve!: (value: Booking[]) => void;
    mockedBookings.bridge.mockReturnValue(
      new Promise<Booking[]>((r) => {
        resolve = r;
      }),
    );
    open();

    await userEvent.click(
      screen.getByRole("button", { name: /tambah layanan baru/i }),
    );
    resolve([booking()]);

    await waitFor(() => expect(mockedPets.list).toHaveBeenCalled());
    // Still on the tab the cashier picked.
    expect(
      screen.getByRole("button", { name: /tambah layanan baru/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("BookingBridgeDialog — pulling", () => {
  it("cannot be submitted with nothing ticked", async () => {
    mockedBookings.bridge.mockResolvedValue([booking()]);
    open();

    expect(
      await screen.findByRole("button", { name: /tarik ke keranjang/i }),
    ).toBeDisabled();
  });

  it("hands the ticked bookings back and writes nothing itself", async () => {
    // Marking them as pulled belongs to whatever creates the cart, inside the
    // transaction that writes it — a dialog that did it would leave bookings
    // claimed by a cart that was never built.
    const target = booking();
    mockedBookings.bridge.mockResolvedValue([target]);
    const onPull = open();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /tarik bk-260824-001/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /tarik ke keranjang/i }),
    );

    expect(onPull).toHaveBeenCalledWith([target]);
    expect(mockedBookings.update).not.toHaveBeenCalled();
  });

  /*
    THE LIST IS NO LONGER ALL ONE THING. Since the bridge started offering every
    status but `cancelled`, a row can be a grooming already finished or a draft
    nobody confirmed — and "Selesai" and "Draf" are different conversations
    across a counter, so the row says which it is.
  */
  it("says what state each booking is in", async () => {
    mockedBookings.bridge.mockResolvedValue([
      booking({ status: "in_progress" }),
    ]);
    open();

    expect(await screen.findByText("Sedang dikerjakan")).toBeVisible();
  });

  /*
    A DRAFT HAS NO NUMBER — it earns one when it is paid for. The row read the
    literal word "null" until this was handled.
  */
  it("names a draft that has no number yet", async () => {
    mockedBookings.bridge.mockResolvedValue([
      booking({ status: "draft", bookingNumber: null }),
    ]);
    open();

    expect(await screen.findByText("Belum bernomor")).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: /tarik booking tanpa nomor/i }),
    ).toBeVisible();
  });

  it("points at the other tab when the customer has no booking today", async () => {
    /*
      Reached by TAPPING BACK to the pull tab, because with nothing to pull the
      dialog opens on the ad-hoc one. The empty state is not dead code — it is
      what a cashier sees when they check whether a booking exists and it does
      not, which is the PRD's edge case ("pesan kosong yang mengarahkan ke tab
      Tambah Layanan Baru").
    */
    mockedBookings.bridge.mockResolvedValue([]);
    open();

    await userEvent.click(
      await screen.findByRole("button", { name: /tarik booking/i }),
    );

    expect(
      await screen.findByText(/tidak ada booking yang bisa ditarik/i),
    ).toBeVisible();
  });
});

describe("BookingBridgeDialog — the ad-hoc tab", () => {
  beforeEach(() => {
    mockedBookings.bridge.mockResolvedValue([]);
  });

  it("needs at least one service before it can be submitted", async () => {
    // FR-3: "minimal 1 layanan tercentang sebelum tombol bisa disubmit".
    open();

    expect(
      await screen.findByRole("button", { name: /tambah ke keranjang/i }),
    ).toBeDisabled();
  });

  /*
    IT WRITES NOTHING. The booking is raised when the sale settles — FR-3's own
    words, "berstatus Completed setelah pembayaran selesai". The first version
    created it here, so a line the cashier then deleted from the basket left an
    appointment for a grooming nobody was ever charged for.
  */
  it("hands the choice back rather than creating a booking", async () => {
    const onAdd = openAdhoc();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /grooming full service/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /tambah ke keranjang/i }),
    );

    // A LIST — one opening may cover a customer's whole household (FR-3).
    expect(onAdd).toHaveBeenCalledWith([
      { petId: PET_ID, petName: "Bella", serviceIds: [SERVICE_ID] },
    ]);
    expect(mockedBookings.create).not.toHaveBeenCalled();
  });

  it("sends no price — the server prices the line", async () => {
    const onAdd = openAdhoc();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /grooming full service/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /tambah ke keranjang/i }),
    );

    const [choices] = onAdd.mock.calls[0];
    expect(choices[0]).not.toHaveProperty("price");
  });

  it("asks only for services still on offer", async () => {
    // The till cannot sell a retired service.
    open();

    await waitFor(() =>
      expect(mockedServices.list).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      ),
    );
  });

  it("asks only for this customer's live pets", async () => {
    open();

    await waitFor(() =>
      expect(mockedPets.list).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: CUSTOMER_ID, isActive: true }),
      ),
    );
  });

  it("pre-selects the only pet, removing a click from every walk-in", async () => {
    open();

    expect(await screen.findByRole("button", { name: "Bella" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

/**
 * FR-3: "pilih hewan (bisa lebih dari satu) → centang layanan yang diinginkan
 * per hewan (bisa lebih dari satu layanan per hewan)".
 *
 * THE OBJECTION TO A MATRIX WAS REAL AND IS NOW GONE. It used to be that this
 * tab created the bookings itself, so several pets meant several writes and a
 * third that could fail after two had landed. Since the bookings moved to the
 * cart write, the whole choice goes as ONE patch.
 */
describe("BookingBridgeDialog — several animals in one opening", () => {
  const PET_B = "5a7f1f77bcf86cd7994390d2";
  const SERVICE_B = "5a7f1f77bcf86cd7994390e2";

  beforeEach(() => {
    mockedBookings.bridge.mockResolvedValue([]);
    mockedPets.list.mockResolvedValue(
      page([
        { _id: PET_ID, name: "Bella", customerId: CUSTOMER_ID },
        { _id: PET_B, name: "Cici", customerId: CUSTOMER_ID },
      ]),
    );
    mockedServices.list.mockResolvedValue(
      page([
        { _id: SERVICE_ID, name: "Grooming Full Service", price: "150000.0000" },
        { _id: SERVICE_B, name: "Potong kuku", price: "25000.0000" },
      ]),
    );
  });

  const tick = async (
    user: ReturnType<typeof userEvent.setup>,
    petName: string,
    serviceName: RegExp,
  ) => {
    await user.click(await screen.findByRole("button", { name: petName }));
    await user.click(await screen.findByRole("checkbox", { name: serviceName }));
  };

  it("hands back one entry per animal, in a single call", async () => {
    const user = userEvent.setup();
    const onAdd = openAdhoc();

    await tick(user, "Bella", /grooming full service/i);
    await tick(user, /^Cici$/ as unknown as string, /potong kuku/i);
    await user.click(
      screen.getByRole("button", { name: /tambah ke keranjang/i }),
    );

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([
      { petId: PET_ID, petName: "Bella", serviceIds: [SERVICE_ID] },
      { petId: PET_B, petName: "Cici", serviceIds: [SERVICE_B] },
    ]);
  });

  /*
    A SINGLE SHARED SET would apply the last thing ticked to whichever pill
    happened to be active — which is the whole reason the ticks are kept per
    animal.
  */
  it("keeps each animal's ticks to itself", async () => {
    const user = userEvent.setup();
    openAdhoc();

    await tick(user, "Bella", /grooming full service/i);
    await user.click(await screen.findByRole("button", { name: /^Cici/ }));

    // Cici's checklist starts empty, whatever Bella has.
    expect(
      screen.getByRole("checkbox", { name: /grooming full service/i }),
    ).not.toBeChecked();
  });

  /*
    The checklist only ever shows one pet, so without a count on the pill and a
    summary below, the cashier would be confirming choices they cannot see.
  */
  it("shows how many each animal has, and what they are", async () => {
    const user = userEvent.setup();
    openAdhoc();

    await tick(user, "Bella", /grooming full service/i);
    await tick(user, /^Cici$/ as unknown as string, /potong kuku/i);

    // The count rides on the pill…
    expect(
      screen.getByRole("button", { name: /Bella, 1 layanan/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Cici, 1 layanan/ }),
    ).toBeInTheDocument();

    /*
      …and the summary names what each animal is having. Scoped to the summary
      block, because the service names also appear in the checklist above it —
      which is the point: one of them is a control, the other is a record of what
      has been chosen.
    */
    const summary = screen.getByText("Bella", { selector: "dt" }).closest("dl");
    expect(summary).toHaveTextContent("Grooming Full Service");
    expect(summary).toHaveTextContent("Potong kuku");
  });

  it("adds up every animal's services, not just the active one", async () => {
    const user = userEvent.setup();
    openAdhoc();

    await tick(user, "Bella", /grooming full service/i);
    await tick(user, /^Cici$/ as unknown as string, /potong kuku/i);

    expect(screen.getByText("Rp 175.000")).toBeInTheDocument();
  });

  /*
    A cashier may tick for Bella, move to Cici, and confirm from there without
    ticking anything for Cici. The rule is "at least one service", not "at least
    one for whichever pill is lit".
  */
  it("can be submitted from an animal with nothing ticked", async () => {
    const user = userEvent.setup();
    openAdhoc();

    await tick(user, "Bella", /grooming full service/i);
    await user.click(await screen.findByRole("button", { name: /^Cici/ }));

    expect(
      screen.getByRole("button", { name: /tambah ke keranjang/i }),
    ).toBeEnabled();
  });

  it("drops an animal back off the list when its last tick is undone", async () => {
    const user = userEvent.setup();
    openAdhoc();

    await tick(user, "Bella", /grooming full service/i);
    await user.click(
      screen.getByRole("checkbox", { name: /grooming full service/i }),
    );

    expect(
      screen.getByRole("button", { name: /tambah ke keranjang/i }),
    ).toBeDisabled();
  });

  it("gives each row its own key, even when two share a service", async () => {
    /*
      REPORTED FROM THE TILL, 3 September 2026: React warned about two children
      with the same key. The rows were keyed on `serviceId`, and since PCR-040
      one booking may carry the same service twice — Mochi and Coco both having a
      Full Service. React is entitled to drop or duplicate either row.

      RENDERED WITHOUT A WARNING is the assertion: the key itself is not
      observable, so this watches the console the way the browser did.
    */
    const warn = jest.spyOn(console, "error").mockImplementation(() => {});

    const base = booking();

    mockedBookings.bridge.mockResolvedValue([
      {
        ...base,
        /* SAME service, two animals — exactly what `serviceId` could not key. */
        items: [
          { ...base.items[0], _id: "it-1", petName: "Mochi" },
          { ...base.items[0], _id: "it-2", petName: "Coco" },
        ],
      },
    ] as never);

    open();

    await screen.findByText("BK-260824-001");

    expect(
      warn.mock.calls.some((call) => String(call[0]).includes("same key")),
    ).toBe(false);

    warn.mockRestore();
  });
});