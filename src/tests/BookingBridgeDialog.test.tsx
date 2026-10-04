import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingBridgeDialog } from "@/features/booking";
import { bookingService } from "@/services/booking.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { variantOptionService } from "@/services/variantOption.service";
import { zoneService } from "@/services/zone.service";
import type { Booking } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";
import {
  BUILT_IN_VARIANT_OPTIONS,
  makeVariantOption,
  primeVariantOptions,
} from "./helpers/variantOptions";
import { petOptionFields } from "./helpers/petOptions";

jest.mock("@/services/booking.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/service.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/variantOption.service");
jest.mock("@/services/zone.service");

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
  groupId: "5a7f1f77bcf86cd799439181",
  customerId: CUSTOMER_ID,
  customerName: "Ibu Rina",
  /* One booking is one animal and one main service. */
  petId: PET_ID,
  petName: "Bruno",
  petSize: "opt-size-sedang",
  status: "confirmed",
  statusHistory: [],
  nextStatuses: [],
  cancelReason: null,
  /* A salon booking with no trip and nothing handed in. */
  location: "in_store",
  pickupRequested: false,
  deliveryRequested: false,
  tripAddress: null,
  service: {
    serviceId: SERVICE_ID,
    name: "Grooming Full Service",
    /* The kind of work, snapshotted as text — NOT main/addon. */
    serviceType: "Grooming",
    price: "150000.0000",
    durationMin: null,
    status: "pending",
    statusHistory: [],
    startedAt: null,
    finishedAt: null,
    sessions: [],
    addons: [],
  },
  // Never blank — the server names an unassigned slot (FR-3's edge case).
  groomerName: "Belum ditentukan",
  belongings: [],
  internalNotes: null,
  customerNotes: null,
  notes: null,
  media: [],
  pulledToCartAt: null,
  pulledToInvoiceAt: null,
  billingState: "unbilled",
  totalAmount: "150000.0000",
  totalDurationMin: null,
  scheduledAt: "2026-08-24T02:00:00.000Z",
  origin: "booking",
  posTransactionId: null,
  createdBy: null,
  createdByName: null,
  createdByRoleName: null,
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
  primeVariantOptions(variantOptionService.list, zoneService.list);
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
    nobody confirmed — and "Selesai" and "Draft" are different conversations
    across a counter, so the row says which it is.
  */
  it("says what state each booking is in", async () => {
    mockedBookings.bridge.mockResolvedValue([
      booking({ status: "in_progress" }),
    ]);
    open();

    expect(await screen.findByText("In Progress")).toBeVisible();
  });

  /*
    ONE ROW PER BOOKING, and a booking is one animal and one main service — so
    the row names the animal, and the add-ons sit under the service they were
    done to, each with its own price. Pulling it charges the lot.
  */
  it("draws one row per booking, with its add-ons under the service", async () => {
    const user = userEvent.setup();
    const target = booking({
      service: {
        ...booking().service,
        addons: [
          {
            itemId: "5a7f1f77bcf86cd799439191",
            serviceId: "5a7f1f77bcf86cd7994390e9",
            name: "Extra Handling",
            price: "20000.0000",
            durationMin: 15,
          },
        ],
      },
      totalAmount: "170000.0000",
    });
    mockedBookings.bridge.mockResolvedValue([target]);
    open();

    const row = await screen.findByRole("checkbox", {
      name: "Tarik BK-260824-001 untuk Bruno",
    });
    expect(screen.getByText("Grooming Full Service")).toBeVisible();
    expect(screen.getByText("+ Extra Handling")).toBeVisible();
    expect(screen.getByText("Rp 20.000")).toBeVisible();

    await user.click(row);

    // The service AND its add-on — what the basket is about to gain.
    expect(
      screen.getByRole("button", { name: /tarik ke keranjang · rp 170\.000/i }),
    ).toBeEnabled();
  });

  /*
    FR-3's edge case: "hewan yang sama muncul di 2 booking berbeda pada hari yang
    sama — keduanya tetap ditampilkan sebagai baris terpisah". A morning bath and
    an afternoon nail trim are two bookings, and two things to tick.
  */
  it("keeps two bookings for one animal as two rows", async () => {
    mockedBookings.bridge.mockResolvedValue([
      booking(),
      booking({
        _id: "5a7f1f77bcf86cd799439102",
        bookingNumber: "BK-260824-002",
      }),
    ]);
    open();

    expect(
      await screen.findByRole("checkbox", { name: /BK-260824-001 untuk Bruno/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: /BK-260824-002 untuk Bruno/ }),
    ).toBeVisible();
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
  const SECOND_PET_ID = "5a7f1f77bcf86cd7994390d9";

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

  /*
    ─── A SERVICE PRICED BY THE ANIMAL SHOWED NOTHING AT ALL ──────────────────

    The list read `service.price`, which a variant-priced service does not have —
    the axes it varies by are the pet's own facts. So every row of one showed an
    em-dash, and `Number(null ?? 0)` made the running total read Rp 0 with two
    groomings ticked. The tab was unusable for exactly the shop that prices by
    size.
  */
  it("prices each service for the animal the list is for", async () => {
    mockedPets.list.mockResolvedValue(
      page([
        { _id: PET_ID, name: "Bella", customerId: CUSTOMER_ID, ...petOptionFields({ size: "Besar" }) },
      ]),
    );
    mockedServices.list.mockResolvedValue(
      page([
        {
          _id: SERVICE_ID,
          name: "Grooming Full Service",
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory"],
          variants: [
            {
              petType: null,
              sizeCategory: "opt-size-kecil",
              furType: null,
              price: "120000.0000",
            },
            {
              petType: null,
              sizeCategory: "opt-size-besar",
              furType: null,
              price: "150000.0000",
            },
          ],
        },
      ]),
    );

    openAdhoc();

    /* Bella is large — 150.000, not the 120.000 of the first variant. */
    expect(await screen.findByText("Rp 150.000")).toBeInTheDocument();
    /*
      AND IT COUNTS, in all three places the figure appears: the row, the
      summary beside the animal's name, and the running total. It read Rp 0 with
      the service ticked.
    */
    await userEvent.click(
      screen.getByRole("checkbox", { name: /grooming full service/i }),
    );
    expect(screen.getAllByText("Rp 150.000")).toHaveLength(3);
  });

  /*
    ─── THE SUMMARY BREAKS THE TOTAL DOWN ─────────────────────────────────────

    It named what each animal was having and left every figure on the rows above,
    so on a two-dog visit the only number in sight was the total — and Rp 260.000
    for two groomings of the SAME NAME could not be checked by anybody reading
    it. The same service costs a different amount for a small dog and a large
    one, which is exactly what this box is for.
  */
  it("prices each animal's line in the summary, so the total can be checked", async () => {
    mockedPets.list.mockResolvedValue(
      page([
        { _id: PET_ID, name: "Cici", customerId: CUSTOMER_ID, ...petOptionFields({ size: "Kecil" }) },
        {
          _id: SECOND_PET_ID,
          name: "Cilang",
          customerId: CUSTOMER_ID,
          ...petOptionFields({ size: "Besar" }),
        },
      ]),
    );
    mockedServices.list.mockResolvedValue(
      page([
        {
          _id: SERVICE_ID,
          name: "Basic Grooming",
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory"],
          variants: [
            {
              petType: null,
              sizeCategory: "opt-size-kecil",
              furType: null,
              price: "120000.0000",
            },
            {
              petType: null,
              sizeCategory: "opt-size-besar",
              furType: null,
              price: "140000.0000",
            },
          ],
        },
      ]),
    );

    openAdhoc();

    /* With two animals none is pre-selected — the question is which one. */
    await userEvent.click(await screen.findByRole("button", { name: "Cici" }));
    await userEvent.click(
      await screen.findByRole("checkbox", { name: /basic grooming/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cilang" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: /basic grooming/i }),
    );

    /* THE SAME NAME, TWO FIGURES — which is the whole point of showing them. */
    expect(screen.getByText("Rp 120.000")).toBeInTheDocument();
    /* 140.000 twice: Cilang's summary line and the row she is looking at. */
    expect(screen.getAllByText("Rp 140.000").length).toBeGreaterThan(1);
    /* And they add up to what the button quotes. */
    expect(screen.getByText("Rp 260.000")).toBeInTheDocument();
  });

  /*
    AND IT REFUSES, NAMING THE MISSING FACT, rather than offering a tick the
    server is about to reject with a message about an axis nobody was asked
    about.
  */
  it("cannot tick a service the animal cannot be priced for", async () => {
    mockedPets.list.mockResolvedValue(
      page([
        { _id: PET_ID, name: "Bella", customerId: CUSTOMER_ID, ...petOptionFields({}) },
      ]),
    );
    mockedServices.list.mockResolvedValue(
      page([
        {
          _id: SERVICE_ID,
          name: "Grooming Full Service",
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory"],
          variants: [
            {
              petType: null,
              sizeCategory: "opt-size-kecil",
              furType: null,
              price: "120000.0000",
            },
          ],
        },
      ]),
    );

    openAdhoc();

    expect(
      await screen.findByRole("checkbox", { name: /grooming full service/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("link", { name: /lengkapi ukuran bella/i }),
    ).toHaveAttribute("href", `/dashboard/master/pets/${PET_ID}/edit`);
  });

  /*
    NOR ONE WHOSE VARIANT IS SWITCHED OFF (13 September 2026) — the till refuses
    a new line for it. The reason is on the row, in words.
  */
  it("cannot tick a service whose variant for the animal is switched off", async () => {
    mockedPets.list.mockResolvedValue(
      page([
        { _id: PET_ID, name: "Bella", customerId: CUSTOMER_ID, ...petOptionFields({ size: "Besar" }) },
      ]),
    );
    mockedServices.list.mockResolvedValue(
      page([
        {
          _id: SERVICE_ID,
          name: "Grooming Full Service",
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory"],
          variants: [
            {
              petType: null,
              sizeCategory: "opt-size-besar",
              furType: null,
              price: "150000.0000",
              durationMin: 120,
              isActive: false,
            },
          ],
        },
      ]),
    );

    openAdhoc();

    expect(
      await screen.findByRole("checkbox", { name: /grooming full service/i }),
    ).toBeDisabled();
    expect(screen.getByText(/varian nonaktif/i)).toBeInTheDocument();
    expect(screen.queryByText("Rp 150.000")).not.toBeInTheDocument();
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

    expect(
      await screen.findByRole("button", { name: "Bella" }),
    ).toHaveAttribute("aria-pressed", "true");
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
        {
          _id: SERVICE_ID,
          name: "Grooming Full Service",
          price: "150000.0000",
        },
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
    await user.click(
      await screen.findByRole("checkbox", { name: serviceName }),
    );
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
});

/* ─── A WALK-IN PRICED BY A "DIPILIH STAF" CARD (17 September 2026) ────────── */
describe("BookingBridgeDialog — opsi dipilih staf", () => {
  const LOKASI = "vo-lokasi";

  beforeEach(() => {
    primeVariantOptions(variantOptionService.list, zoneService.list, {
      cards: [
        ...BUILT_IN_VARIANT_OPTIONS,
        makeVariantOption({
          _id: LOKASI,
          name: "Lokasi",
          source: "staff",
          axisKey: LOKASI,
          sortOrder: 3,
          values: [
            { code: "toko", label: "Di Toko", sortOrder: 0, isActive: true },
            { code: "rumah", label: "Di Rumah", sortOrder: 1, isActive: true },
          ],
        }),
      ],
    });
    mockedServices.list.mockResolvedValue(
      page([
        {
          _id: SERVICE_ID,
          name: "Grooming Full Service",
          price: null,
          hasVariants: true,
          variantAxes: [LOKASI],
          variants: [
            { petType: null, sizeCategory: null, furType: null, choices: [{ optionId: LOKASI, code: "toko" }], price: "120000.0000" },
            { petType: null, sizeCategory: null, furType: null, choices: [{ optionId: LOKASI, code: "rumah" }], price: "175000.0000" },
          ],
        },
      ]),
    );
  });

  it("lets the service be ticked, asks for Lokasi, and hands the choice back", async () => {
    const onAdd = openAdhoc();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /grooming full service/i }),
    );

    /* Not answered yet: the till would refuse it, so the tab says so. */
    await userEvent.click(screen.getByRole("button", { name: /tambah ke keranjang/i }));
    /* On the row, and in the tab's error. */
    expect(
      await screen.findByText("Bella: Pilih Lokasi untuk Grooming Full Service dulu."),
    ).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("combobox", { name: /lokasi/i }));
    await userEvent.click(await screen.findByRole("option", { name: "Di Rumah" }));

    expect((await screen.findAllByText("Rp 175.000")).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /tambah ke keranjang/i }));

    expect(onAdd).toHaveBeenCalledWith([
      {
        petId: PET_ID,
        petName: "Bella",
        serviceIds: [SERVICE_ID],
        variantChoices: [{ optionId: LOKASI, code: "rumah" }],
      },
    ]);
  });
});
