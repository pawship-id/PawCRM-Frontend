import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingDetailScreen } from "@/features/booking";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import { petService } from "@/services/pet.service";
import { ApiError } from "@/services/api-error";
import type { Booking, BookingItem, Pet } from "@/types/api";

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
    notes: null,
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    groomerUserId: "user-1",
    groomerName: "Sinta",
    ...overrides,
  }) as BookingItem;

const booking = (overrides: Partial<Booking> = {}): Booking =>
  ({
    _id: "bk-1",
    bookingNumber: "BK-260902-001",
    branchId: "b1",
    customerId: "cust-1",
    customerName: "Bu Lisa",
    pets: [
      { petId: MOCHI, petName: "Mochi" },
      { petId: COCO, petName: "Coco" },
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
  it("says which rows have been billed and which have not", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        billingState: "partial",
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
    expect(await screen.findByText(/check-in/i)).toBeInTheDocument();
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
        items: [
          {
            _id: "it-1",
            petId: "pet-1",
            petName: "Bruno",
            serviceId: "svc-1",
            name: "Grooming Full Service",
            price: "150000.0000",
            durationMin: 90,
            notes: null,
            pulledToCartAt: null,
            pulledToInvoiceAt: null,
            groomerUserId: "user-1",
            groomerName: "Sinta",
            groomerOffReason: "Libur setiap Kamis",
          },
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
});