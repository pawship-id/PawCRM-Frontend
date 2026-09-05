import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingDetailScreen } from "@/features/booking";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import { petService } from "@/services/pet.service";
import { ApiError } from "@/services/api-error";
import type {
  Booking,
  BookingItem,
  BookingPetService,
  Pet,
} from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/branch.service");

const bookings = bookingService as jest.Mocked<typeof bookingService>;
const pets = petService as jest.Mocked<typeof petService>;
const branches = branchService as jest.Mocked<typeof branchService>;

const MOCHI = "pet-mochi";
const COCO = "pet-coco";

const item = (overrides: Partial<BookingItem> = {}): BookingItem =>
  ({
    _id: "row-mochi",
    petId: MOCHI,
    petName: "Mochi",
    serviceId: "svc-1",
    name: "Full Grooming",
    price: "150000.0000",
    durationMin: 90,
    internalNotes: null,
    customerNotes: null,
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    groomerUserId: "user-1",
    groomerName: "Sinta",
    ...overrides,
  }) as BookingItem;

/**
 * The grouped view the API builds on read — one entry per animal, that animal's
 * services inside it, add-ons under each. Derived from the same rows the flat
 * `items` holds, because that is exactly what the server does: a fixture where
 * the two disagree would test a screen against data the API cannot produce.
 */
const petGroup = (
  petId: string,
  petName: string,
  services: Partial<BookingPetService>[] = [{}],
) =>
  ({
    petId,
    petName,
    services: services.map((service) => ({
      itemId: "row-mochi",
      serviceId: "svc-1",
      name: "Full Grooming",
      serviceType: "Grooming",
      price: "150000.0000",
      durationMin: 90,
      groomerUserId: "user-1",
      groomerName: "Sinta",
      groomerOffReason: null,
      assistantGroomers: [],
      workStatus: "pending",
      startedAt: null,
      finishedAt: null,
      internalNotes: null,
      customerNotes: null,
      pulledToCartAt: null,
      pulledToInvoiceAt: null,
      addons: [],
      ...service,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

const booking = (overrides: Partial<Booking> = {}): Booking =>
  ({
    _id: "bk-1",
    bookingNumber: "BK-260902-001",
    branchId: "b1",
    customerId: "cust-1",
    customerName: "Bu Lisa",
    pets: [
      petGroup(MOCHI, "Mochi"),
      petGroup(COCO, "Coco", [{ itemId: "row-coco" }]),
    ],
    petName: "Mochi, Coco",
    petCount: 2,
    items: [item(), item({ _id: "row-coco", petId: COCO, petName: "Coco" })],
    scheduledAt: "2026-09-02T03:00:00.000Z",
    status: "confirmed",
    statusHistory: [],
    origin: "booking",
    posTransactionId: null,
    totalAmount: "300000.0000",
    totalDurationMin: 90,
    billingState: "unbilled",
    notes: null,
    cancelReason: null,
    ...overrides,
  }) as Booking;

const pet = (id: string, name: string, overrides: Partial<Pet> = {}): Pet =>
  ({
    _id: id,
    name,
    preferences: { text: null, tags: [] },
    medical: {
      allergies: [],
      conditions: [],
      medications: [],
      vaccinations: [],
      vet: { clinicName: null, phone: null },
    },
    ...overrides,
  }) as unknown as Pet;

beforeEach(() => {
  jest.clearAllMocks();
  bookings.getById.mockResolvedValue(booking());
  /* The page names the branch, which `useBranchScope` looks up. */
  branches.list.mockResolvedValue({
    items: [{ _id: "b1", name: "Cibubur" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
  pets.list.mockResolvedValue({
    items: [pet(MOCHI, "Mochi"), pet(COCO, "Coco")],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
});

/**
 * ONE BOOKING, WHOLE — the screen the module was missing.
 *
 * The list answers "did that grooming get recorded"; the calendar answers "who
 * is where at ten". Neither answers the question somebody asks with a customer
 * on the phone: what exactly is this booking, and where does it stand.
 */
describe("BookingDetailScreen", () => {
  it("names the booking and who it is for", async () => {
    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    expect(await screen.findByText("BK-260902-001")).toBeInTheDocument();
    expect(screen.getByText(/Bu Lisa/)).toBeInTheDocument();
  });

  /*
    ROWS, NOT A BOOKING. Since PCR-040 a visit may bring Mochi and Coco to two
    people at two prices, billed separately — and a page that summed them into
    one line would hide the thing the module was rebuilt for.
  */
  it("shows one block per animal", async () => {
    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    expect(await screen.findByText("Mochi")).toBeInTheDocument();
    expect(screen.getByText("Coco")).toBeInTheDocument();
  });

  /*
    PER ROW, because that is where the marker lives since K3 — and it is what
    makes a half-billed visit legible instead of merely possible.
  */
  it("shows an add-on under the service it was added to, not as a line of its own", async () => {
    /*
      THE COMPLAINT THIS ANSWERS. Nobody chooses "Parfum" by itself, and showing
      it beside the bath made it look as though somebody had. It is still its own
      STORED row — that is how it bills and prints on its own line, and how it can
      carry its own commission — but the screen reads the grouped view the API
      builds, where it hangs off its parent.
    */
    bookings.getById.mockResolvedValue(
      booking({
        pets: [
          petGroup(MOCHI, "Mochi", [
            {
              addons: [
                {
                  itemId: "row-parfum",
                  serviceId: "svc-addon",
                  name: "Parfum",
                  price: "20000.0000",
                  durationMin: 10,
                  pulledToCartAt: null,
                  pulledToInvoiceAt: null,
                },
              ],
            },
          ]),
        ],
      }),
    );

    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    /* One animal, one service — and the add-on inside it rather than beside. */
    expect(await screen.findByText(/\+ Parfum/)).toBeInTheDocument();
    expect(screen.getAllByText(/Full Grooming/)).toHaveLength(1);
  });

  it("adds the add-ons into the animal's total", async () => {
    // A total that ignored them would disagree with the bill.
    bookings.getById.mockResolvedValue(
      booking({
        pets: [
          petGroup(MOCHI, "Mochi", [
            {
              addons: [
                {
                  itemId: "row-parfum",
                  serviceId: "svc-addon",
                  name: "Parfum",
                  price: "20000.0000",
                  durationMin: 10,
                  pulledToCartAt: null,
                  pulledToInvoiceAt: null,
                },
              ],
            },
          ]),
        ],
      }),
    );

    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    // 150.000 + 20.000
    expect(await screen.findByText(/Rp\s?170[.,]000/)).toBeInTheDocument();
  });

  it("says which rows have been billed and which have not", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        billingState: "partial",
        /* The claim lives on the ROW (K3), and the screen reads it through the
           grouped view the API builds from those same rows. */
        pets: [
          petGroup(MOCHI, "Mochi", [
            { pulledToCartAt: "2026-09-02T04:00:00.000Z" },
          ]),
          petGroup(COCO, "Coco", [{ itemId: "row-coco" }]),
        ],
        items: [
          item({ pulledToCartAt: "2026-09-02T04:00:00.000Z" }),
          item({ _id: "row-coco", petId: COCO, petName: "Coco" }),
        ],
      }),
    );

    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    expect(await screen.findByText(/sudah di kasir/i)).toBeInTheDocument();
    expect(screen.getByText(/belum ditagih/i)).toBeInTheDocument();
    expect(screen.getByText(/sebagian sudah ditagih/i)).toBeInTheDocument();
  });

  /*
    FR-5 KRITERIA 5.14 — the same card the booking form shows, so whoever opens
    this booking before a hand-off reads exactly what the person who took it
    read.
  */
  it("warns about a severe allergy on the animal's own block", async () => {
    pets.list.mockResolvedValue({
      items: [
        pet(MOCHI, "Mochi", {
          medical: {
            allergies: [
              { name: "Sampo strawberry", severity: "severe", note: null },
            ],
            conditions: [],
            medications: [],
            vaccinations: [],
            vet: { clinicName: null, phone: null },
          },
        } as Partial<Pet>),
        pet(COCO, "Coco"),
      ],
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    });

    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sampo strawberry");
  });

  /* A DRAFT HAS NO NUMBER — saying so beats a blank or an invented one. */
  it("says a draft has no number rather than showing a blank", async () => {
    bookings.getById.mockResolvedValue(
      booking({ bookingNumber: null, status: "draft" }),
    );

    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    expect(await screen.findByText(/booking \(draf\)/i)).toBeInTheDocument();
  });

  it("shows why a cancelled booking was called off", async () => {
    bookings.getById.mockResolvedValue(
      booking({ status: "cancelled", cancelReason: "Pelanggan batal" }),
    );

    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    expect(await screen.findByText(/pelanggan batal/i)).toBeInTheDocument();
  });

  it("offers Ubah, pointing at the edit route for this booking", async () => {
    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    const edit = await screen.findByRole("link", { name: /^ubah$/i });
    expect(edit).toHaveAttribute("href", "/dashboard/booking/bk-1/edit");
  });

  it.each(["completed", "cancelled"] as const)(
    "offers no Ubah on a %s booking",
    async (status) => {
      /*
        THE TWO FROZEN STATES. Both have nowhere left to go on the ladder, and
        the server answers 409 to a PATCH on either — so a button here would
        send somebody to a form that cannot save. The server is still the one
        refusing; this only stops the walk.
      */
      bookings.getById.mockResolvedValue(booking({ status }));

      renderWithAuth(<BookingDetailScreen id="bk-1" />);

      await screen.findByText(/BK-260902-001/);
      expect(
        screen.queryByRole("link", { name: /^ubah$/i }),
      ).not.toBeInTheDocument();
    },
  );

  it("shows a groomer the status moves but not the edit button", async () => {
    /*
      THE SPLIT, FROM THE SCREEN'S SIDE — `bookings:advanceStatus` without
      `bookings:update`. A groomer checks a dog in and marks it done; the edit
      form changes the services and re-quotes every unbilled row at today's
      prices, which is not their decision to make.
    */
    renderWithAuth(<BookingDetailScreen id="bk-1" />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read", "advanceStatus"] }],
    });

    await screen.findByText(/BK-260902-001/);

    expect(
      screen.queryByRole("link", { name: /^ubah$/i }),
    ).not.toBeInTheDocument();

    /*
      AND THE LADDER IS STILL THEIRS — asserted on a FORWARD MOVE, not on
      "Riwayat status", which is ungated and would pass even if the split had
      hidden every action a groomer needs.
    */
    await userEvent.click(
      screen.getByRole("button", { name: /tindakan|aksi|status/i }),
    );
    expect(await screen.findByText(/hewan sudah datang/i)).toBeInTheDocument();
    expect(screen.queryByText(/batalkan booking/i)).not.toBeInTheDocument();
  });

  it("says plainly when the booking is not there", async () => {
    bookings.getById.mockRejectedValue(new ApiError("Not found", 404));

    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    expect(await screen.findByText(/tidak ditemukan/i)).toBeInTheDocument();
  });

  /*
    THE ANIMALS' RECORDS ARE A COURTESY. Failing to read them costs the warning
    boxes, never the booking — a page that refused to render because a pet lookup
    failed would hide the work somebody opened it to see.
  */
  it("still renders the rows when the pet lookup fails", async () => {
    pets.list.mockRejectedValue(new Error("offline"));

    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    expect(await screen.findByText("Mochi")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  /*
    ─── THE GROOMER WENT ON LEAVE AFTER THIS WAS BOOKED ──────────────────────

    The roster screen warns when the leave is SET (kriteria 4.9), but that
    warning fires once and is gone when the page closes. Until 3 September 2026
    the booking remembered nothing: on Thursday morning it still read "Sinta",
    and the only person who knew was whoever had ticked the box days before.
  */
  it("warns that the groomer is off, and says what to do about it", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        /* The warning travels with the SERVICE — a grouped view that dropped it
           would hide the one thing this booking must say out loud. */
        pets: [
          petGroup("pet-1", "Bruno", [
            { itemId: "it-1", groomerOffReason: "Libur setiap Kamis" },
          ]),
        ],
      } as never),
    );

    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/libur setiap kamis/i);
    /*
      IT SAYS WHAT TO DO. A warning whose only content is "this is wrong" leaves
      the reader to invent the remedy; there are exactly two here.
    */
    expect(alert).toHaveTextContent(/ganti groomer atau hubungi pelanggan/i);
  });

  it("says nothing when the groomer is working that day", async () => {
    /*
      NULL, NOT A REASSURANCE. A note on every booking that its groomer is
      available is noise on the ninety-nine that are fine, and noise is what
      makes the hundredth unreadable.
    */
    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    await screen.findByText(/BK-260902-001/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends each animal's block to that animal's work page", async () => {
    /*
      THE WAY INTO THE WORK. Status lives on the ROWS now, so moving it happens
      on a page about ONE animal — there must be no doubt whose button was
      pressed. This page stays the overview.
    */
    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    /* ONE PER ANIMAL — the fixture has two, and so must the links. */
    const links = await screen.findAllByRole("link", { name: /pekerjaan/i });
    expect(links.length).toBeGreaterThan(1);

    const targets = links.map((link) => link.getAttribute("href"));
    expect(new Set(targets).size).toBe(targets.length);
    targets.forEach((href) => {
      expect(href).toMatch(/^\/dashboard\/booking\/bk-1\/hewan\/.+/);
    });
  });

  it("keeps the profile link, and keeps the two apart in words", async () => {
    /*
      TWO DIFFERENT PAGES: "pekerjaan" is this visit, "profil" is the animal's
      whole life. Confusing them sends somebody looking for today's grooming in
      a list of last year's.
    */
    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    await screen.findAllByRole("link", { name: /pekerjaan/i });
    expect(
      screen.getAllByRole("link", { name: /^profil/i }).length,
    ).toBeGreaterThan(0);
  });

  /*
    ─── WHAT SURVIVED MOVING THE TITIPAN CARD OFF THIS PAGE ───

    Ticking a collar back happens on the animal's own page now. But "is anything
    still in the drawer" is a question about the WHOLE VISIT — it is the last
    thing checked before a booking closes — so the COUNT stays here, on the
    animal it belongs to, with the way through to act on it.
  */
  it("counts what is still in the drawer, per animal", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        belongings: [
          {
            _id: "bel-1",
            petId: MOCHI,
            name: "Carrier biru",
            checkedInAt: "2026-09-02T03:00:00.000Z",
            checkedOutAt: null,
            checkedInBy: null,
            checkedOutBy: null,
          },
          {
            _id: "bel-2",
            petId: COCO,
            name: "Kalung merah",
            checkedInAt: "2026-09-02T03:00:00.000Z",
            checkedOutAt: "2026-09-02T09:00:00.000Z",
            checkedInBy: null,
            checkedOutBy: null,
          },
        ],
      }),
    );

    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    // Mochi's is still here; Coco's went home, so only one block is flagged.
    expect(
      await screen.findByText("1 titipan belum kembali"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/titipan belum kembali/)).toHaveLength(1);
  });

  it("does not count something that never arrived", async () => {
    /*
      THE REASON THERE ARE TWO DATES. Written down when the booking was taken and
      never handed over is not outstanding — flagging it would hold a visit open
      over something nobody brought, and teach the shop to ignore the badge.
    */
    bookings.getById.mockResolvedValue(
      booking({
        belongings: [
          {
            _id: "bel-1",
            petId: MOCHI,
            name: "Carrier biru",
            checkedInAt: null,
            checkedOutAt: null,
            checkedInBy: null,
            checkedOutBy: null,
          },
        ],
      }),
    );

    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    await screen.findByText("Mochi");
    expect(screen.queryByText(/titipan belum kembali/)).not.toBeInTheDocument();
  });

  /*
    THE TWO NOTES ARE NOT ON THIS PAGE EITHER. They are read AND written on the
    animal's own work page; showing a read-only copy here would be a second place
    to look for words that can only be changed in the first.
  */
  it("does not show the animal's notes", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        pets: [
          petGroup(MOCHI, "Mochi", [
            {
              internalNotes: "Takut hairdryer",
              customerNotes: "Sarankan 3 minggu sekali",
            },
          ]),
        ],
      }),
    );

    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    await screen.findByText("Mochi");
    expect(screen.queryByText("Takut hairdryer")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Sarankan 3 minggu sekali"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/catatan internal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/untuk pelanggan/i)).not.toBeInTheDocument();
  });

  /*
    THE CARD ITSELF IS GONE FROM THIS PAGE. Pinned, because leaving both would be
    two places to tick the same box — and two people ticking different copies is
    how an item gets recorded as returned and then quietly un-returned.
  */
  it("does not carry the titipan list itself any more", async () => {
    renderWithAuth(<BookingDetailScreen id="bk-1" />);

    await screen.findByText("Mochi");
    expect(screen.queryByText("Titipan Owner")).not.toBeInTheDocument();
  });
});