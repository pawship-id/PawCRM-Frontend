import { screen, waitFor, within } from "@testing-library/react";

import { AntarJemputBookingDetailScreen } from "@/features/antar-jemput";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import type { Booking, BookingGroupMember, BookingSession } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/services/branch.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

/* ⚠️ ONE ROUTER OBJECT — the load effect depends on it, and a fresh one per
   render would re-run that effect for ever. Next's own is stable. */
const replace = jest.fn();
const router = { replace, push: jest.fn(), refresh: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/dashboard/layanan/antar-jemput/bk-aj",
}));

const bookings = bookingService as jest.Mocked<typeof bookingService>;
const branches = branchService as jest.Mocked<typeof branchService>;

const session = (over: Partial<BookingSession> = {}): BookingSession => ({
  sessionId: "se-1",
  sessionName: "Perjalanan",
  groomers: [{ _id: "user-1", name: "Anto", offReason: null }],
  status: "pending",
  startedAt: null,
  finishedAt: null,
  notesSession: null,
  notesInternalSession: null,
  media: [],
  commissionWeight: null,
  ...over,
});

type Overrides = Omit<Partial<Booking>, "service"> & {
  service?: Partial<Booking["service"]>;
};

/**
 * ONE RIDE, in the shape `GET /bookings/:id` sends it: no `petId`, its animals
 * in `passengers`, and two pinned ends.
 */
const ride = ({ service, ...over }: Overrides = {}): Booking =>
  ({
    _id: "bk-aj",
    tenantId: "t1",
    branchId: "branch-1",
    bookingNumber: "AJ-260923-001",
    groupId: "grp-1",
    customerId: "cust-1",
    customerName: "Ibu Rina",
    petId: null,
    petName: null,
    petSize: null,
    status: "in_progress",
    statusHistory: [],
    nextStatuses: [],
    cancelReason: null,
    scheduledAt: "2026-09-23T02:00:00.000Z",
    origin: "booking",
    posTransactionId: null,
    location: "in_home",
    pickupRequested: false,
    deliveryRequested: false,
    tripAddress: null,
    tripLeg: "pickup",
    tripOrigin: { address: "Jl. Mawar No. 12", lat: -7.24, lng: 112.75 },
    tripDestination: { address: "Cabang Barat", lat: -7.26, lng: 112.75 },
    passengers: [
      { _id: "pet-1", name: "Bella", petSize: "opt-size-kecil" },
      { _id: "pet-2", name: "Milo", petSize: "opt-size-sedang" },
    ],
    passengerPetIds: ["pet-1", "pet-2"],
    linkedBookingIds: [],
    service: {
      serviceId: "svc-aj",
      name: "Antar-Jemput",
      serviceType: "Antar-Jemput",
      price: "45000.0000",
      durationMin: 30,
      status: "pending",
      statusHistory: [],
      startedAt: null,
      finishedAt: null,
      sessions: [session()],
      addons: [],
      zone: { name: "Zona A", distanceKm: 2.4 },
      ...service,
    },
    groomerName: "Anto",
    belongings: [],
    internalNotes: null,
    customerNotes: null,
    notes: null,
    media: [],
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    billingState: "unbilled",
    totalAmount: "45000.0000",
    netAmount: "45000.0000",
    totalDurationMin: 30,
    createdBy: "user-9",
    createdByName: "Fitria",
    createdByRoleName: "Staff",
    createdAt: "2026-09-22T04:52:00.000Z",
    updatedAt: "2026-09-22T04:52:00.000Z",
    ...over,
  }) as Booking;

function draw(found: Booking = ride()) {
  bookings.getById.mockResolvedValue(found);
  branches.getById.mockResolvedValue({ _id: "branch-1", name: "Barat" } as never);
  renderWithAuth(<AntarJemputBookingDetailScreen id={found._id} />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

/*
  THE RUTE CARD ALONE. "Cabang Barat" is the destination AND the branch in the
  sub-heading; "Anto" is the driver AND the crew on the tahapan. Asserting
  across the page would pass on either copy, which is not what these say.
*/
async function ruteCard(): Promise<HTMLElement> {
  const heading = await screen.findByText("Rute");
  const card = heading.closest('[data-slot="card"]');

  if (!card) throw new Error("Kartu Rute tidak ketemu");

  return card as HTMLElement;
}

/** "Rincian & harga" alone — the totals repeat figures the Ringkasan carries. */
async function hargaCard(): Promise<HTMLElement> {
  const heading = await screen.findByText(/Rincian & harga/);
  const card = heading.closest('[data-slot="card"]');

  if (!card) throw new Error("Kartu Rincian & harga tidak ketemu");

  return card as HTMLElement;
}

/** The card whose rows are the bookings this van serves. */
async function terkaitCard(): Promise<HTMLElement> {
  const heading = await screen.findByText("Booking terkait");
  const card = heading.closest('[data-slot="card"]');

  if (!card) throw new Error("Kartu Booking terkait tidak ketemu");

  return card as HTMLElement;
}

/**
 * THE RIDE'S OWN PAGE — `/dashboard/layanan/antar-jemput/:bookingId`
 * (23 September 2026, from `buloo-antar-jemput-v5.html`).
 */
describe("AntarJemputBookingDetailScreen", () => {
  it("makes the number the heading, with the van's status word", async () => {
    draw();

    const heading = await screen.findByRole("heading", { level: 1 });

    expect(heading).toHaveTextContent("AJ-260923-001");
    /* `in_progress` reads "On the Way" on a van — see RIDE_STATUS_LABELS. */
    expect(await screen.findByText("On the Way")).toBeInTheDocument();
  });

  it("names the customer, every animal in the van, and the branch", async () => {
    draw();

    expect(
      await screen.findByText(/Ibu Rina · Bella, Milo · Cabang Barat/),
    ).toBeInTheDocument();
  });

  /*
    BOTH ENDS, NOT ONE. A ride's fare is measured BETWEEN its two pinned
    addresses since 23 September 2026, so a page showing one and implying the
    branch would hide the half that moved.
  */
  it("draws both ends of the journey", async () => {
    draw();

    const rute = within(await ruteCard());

    expect(rute.getByText("Asal")).toBeInTheDocument();
    expect(rute.getByText(/Jl\. Mawar No\. 12/)).toBeInTheDocument();
    expect(rute.getByText("Tujuan")).toBeInTheDocument();
    expect(rute.getByText(/Cabang Barat/)).toBeInTheDocument();
  });

  it("says an end nobody typed is missing, rather than leaving it blank", async () => {
    draw(ride({ tripDestination: null }));

    const rute = within(await ruteCard());

    expect(rute.getByText("Belum diisi")).toBeInTheDocument();
  });

  it("carries the direction, the zone and the driver", async () => {
    draw();

    const rute = within(await ruteCard());

    expect(rute.getByText("Jemput")).toBeInTheDocument();
    expect(rute.getByText("Zona A")).toBeInTheDocument();
    expect(rute.getByText("Anto")).toBeInTheDocument();
  });

  it("counts the animals it carries and names them", async () => {
    draw();

    const rute = within(await ruteCard());

    expect(rute.getByText("Hewan diangkut (2)")).toBeInTheDocument();
    expect(rute.getByText("Bella, Milo")).toBeInTheDocument();
  });

  it("totals the fare from the amount the API sent", async () => {
    draw();

    expect(await screen.findByText("Total")).toBeInTheDocument();
    expect(screen.getAllByText("Rp 45.000").length).toBeGreaterThan(0);
  });

  /*
    ─── THE BOOKING PAGE'S OWN BLOCK (24 September 2026, on request) ────────

    "Buat seperti digambar": the card draws `BookingPriceBreakdown` now — the
    kind chip, what it was priced on, an add-on behind its rule, and the
    Subtotal / Diskon booking / Total foot. The plainer card it replaced did
    not know about "Diskon booking" at all, so a visit discounted across its
    bookings added up differently here than on the grooming it rode for.
  */
  it("names the cards and the zone the fare was quoted on", async () => {
    draw(
      ride({
        service: {
          variantChoices: [
            { optionId: "opt-arah", code: "jemput", name: "Arah", label: "Jemput" },
            { optionId: "opt-hewan", code: "cat", name: "Hewan", label: "Kucing" },
          ],
        },
      }),
    );

    const harga = within(await hargaCard());

    /* The zone carries the distance it was measured at, and the minutes sit at
       the right-hand end of that same line (24 September 2026, on request). */
    expect(
      harga.getByText("Arah: Jemput · Hewan: Kucing · Zona A · 2,4 km · 30 mnt"),
    ).toBeInTheDocument();
    /* Twice: the line's name, and the kind chip beside it — the booking's own
       snapshot of what sort of work this is. */
    expect(harga.getAllByText("Antar-Jemput")).toHaveLength(2);
  });

  /*
    ⚠️ ONE MUTED LINE, NOT TWO. The minutes and the multiplier follow the zone
    and the distance rather than standing above them — a van's line is one
    sentence about how the fare was arrived at.
  */
  it("says the minutes, and how many bookings a per-animal fare is multiplied by", async () => {
    draw(
      ride({
        linkedBookingIds: ["bk-a", "bk-b"],
        service: { billingUnit: "per_pet" },
      }),
    );

    const harga = within(await hargaCard());

    expect(
      harga.getByText("Zona A · 2,4 km · 30 mnt · per booking × 2"),
    ).toBeInTheDocument();
  });

  /*
    ⚠️ EVERY REDUCTION CARRIES ITS WORD — §1.3 does not let a green figure say
    "this comes off" on its own. "Diskon item" is the line's own; "Diskon
    booking" is this booking's share of one typed across the visit, and the two
    are never added into one number.
  */
  it("splits the line's own discount from the visit's share", async () => {
    draw(
      ride({
        totalAmount: "45000.0000",
        netAmount: "38000.0000",
        service: {
          discount: { mode: "amount", value: "2000.0000", resolvedAmount: "2000.0000" },
          /* Own 2.000 plus a 5.000 share of "Diskon seluruh booking". */
          discountAmount: "7000.0000",
        },
      }),
    );

    const harga = within(await hargaCard());

    expect(harga.getByText("Diskon item")).toBeInTheDocument();
    expect(harga.getByText("− Rp 2.000")).toBeInTheDocument();
    expect(harga.getByText("Subtotal")).toBeInTheDocument();
    expect(harga.getByText("Rp 43.000")).toBeInTheDocument();
    expect(harga.getByText("Diskon booking")).toBeInTheDocument();
    expect(harga.getByText("− Rp 5.000")).toBeInTheDocument();
    expect(harga.getByText("Rp 38.000")).toBeInTheDocument();
  });

  it("hangs an add-on off the service it was added to", async () => {
    draw(
      ride({
        service: {
          addons: [
            {
              itemId: "it-1",
              serviceId: "svc-wait",
              name: "Tunggu di lokasi",
              price: "20000.0000",
              durationMin: 15,
            },
          ],
        },
      }),
    );

    const harga = within(await hargaCard());

    expect(harga.getByText(/\+ Tunggu di lokasi · \+15 mnt/)).toBeInTheDocument();
    expect(harga.getByText("Rp 20.000")).toBeInTheDocument();
  });

  /*
    ─── ONE ANTAR JEMPUT, TWO JOURNEYS (24 September 2026, on request) ──────

    Saving "Antar Jemput" writes two bookings, and each page used to speak of
    one direction only — so the Antar read as a one-way trip and the morning
    pickup was nowhere on it.
  */
  const otherLeg = {
    _id: "bk-aj-2",
    bookingNumber: "AJ-260923-002",
    petId: null,
    petName: null,
    serviceName: "Antar-Jemput",
    status: "confirmed",
    scheduledAt: "2026-09-23T10:30:00.000Z",
    pickupRequested: false,
    deliveryRequested: false,
    tripLeg: "delivery",
  } as unknown as BookingGroupMember;

  /* The grooming the van was booked with — a visit member that is NOT a ride. */
  const grooming = {
    _id: "bk-groom",
    bookingNumber: "BK-260923-007",
    petId: "pet-1",
    petName: "Bella",
    serviceName: "Basic Grooming",
    status: "confirmed",
    scheduledAt: "2026-09-23T03:00:00.000Z",
    pickupRequested: false,
    deliveryRequested: false,
    tripLeg: null,
  } as unknown as BookingGroupMember;

  it("says the service is a round trip, and opens the other leg", async () => {
    draw(ride({ group: [otherLeg] }));

    const card = (await screen.findByText("Satu Antar Jemput")).closest(
      '[data-slot="card"]',
    ) as HTMLElement;
    const trip = within(card);

    expect(trip.getByText("2 perjalanan")).toBeInTheDocument();
    expect(trip.getByText("Jemput")).toBeInTheDocument();
    expect(trip.getByText("Antar")).toBeInTheDocument();
    /* The page names itself rather than linking to itself. */
    expect(trip.getByText("Halaman ini")).toBeInTheDocument();
    expect(trip.getByRole("link", { name: /buka/i })).toHaveAttribute(
      "href",
      "/dashboard/layanan/antar-jemput/bk-aj-2",
    );
  });

  it("draws no such card for a one-way ride", async () => {
    draw();

    await screen.findByRole("heading", { level: 1 });

    expect(screen.queryByText("Satu Antar Jemput")).not.toBeInTheDocument();
  });

  /*
    ⚠️ AND THE OTHER LEG IS NOT ALSO A ROW IN BOOKING TERKAIT — one fact, one
    place. Nor can it be let go of here: "Tautkan booking" came off this page,
    so a release would be a door that only opens one way.
  */
  it("keeps the other leg out of Booking terkait", async () => {
    draw(ride({ group: [otherLeg] }));

    const terkait = within(await terkaitCard());

    expect(terkait.queryByText(/AJ-260923-002/)).not.toBeInTheDocument();
    expect(terkait.getByText(/belum melayani booking mana pun/i)).toBeInTheDocument();
  });

  /*
    ⚠️ AND NOTHING IN THAT CARD CAN BE LET GO OF FROM A VAN'S PAGE. The
    grooming this van was booked with IS listed — it is not the other leg — but
    without "Lepas": its pair, "Tautkan booking", came off this page, so a
    release would be a door that only opens one way.
  */
  it("lists the visit's grooming without offering to let it go", async () => {
    draw(ride({ group: [grooming] }));

    const terkait = within(await terkaitCard());

    expect(terkait.getByText("Bella")).toBeInTheDocument();
    expect(terkait.getByText("Satu kunjungan")).toBeInTheDocument();
    expect(terkait.queryByRole("button", { name: /lepas/i })).not.toBeInTheDocument();
  });

  /*
    ─── A SERVED BOOKING IS A NAME AND A NUMBER (24 September 2026) ─────────

    The chip read "Satu antar-jemput" on every row of a card only a van draws,
    and the badge showed ANOTHER booking's rung beside a van whose own status
    is in the heading. Both are off here and both stay on the booking page.
  */
  it("lists what the van serves without a chip or a status", async () => {
    draw(
      ride({
        linkedBookingIds: ["bk-groom"],
        linked: [
          {
            _id: "bk-groom",
            bookingNumber: "BK-260915-004",
            petId: "pet-1",
            petName: "Cilang",
            serviceName: "Basic Grooming",
            status: "confirmed",
            scheduledAt: "2026-09-15T02:00:00.000Z",
            pickupRequested: false,
            deliveryRequested: false,
            tripLeg: null,
          },
        ],
      }),
    );

    const terkait = within(await terkaitCard());

    expect(terkait.getByText("Cilang")).toBeInTheDocument();
    expect(terkait.getByText(/BK-260915-004/)).toBeInTheDocument();
    expect(terkait.queryByText("Satu antar-jemput")).not.toBeInTheDocument();
    expect(terkait.queryByText("Confirmed")).not.toBeInTheDocument();
  });

  /*
    ⚠️ THE OTHER HALF OF THE SPLIT. This page is for rides; an ordinary booking
    typed into this URL goes to its own, exactly as a ride opened on the booking
    page is sent here. Neither URL is a dead end.
  */
  it("sends a booking that is not a ride to the booking page", async () => {
    draw(ride({ _id: "bk-1", tripLeg: null }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/dashboard/booking/bk-1"),
    );
  });

  /*
    NOTHING IS LINKED TO A PERJALANAN FROM HERE (24 September 2026, on request).

    "+ Antar-jemput" went first: nothing is ADDED to a booking once it exists.
    "Tautkan booking" followed, once the ride's own form gained its Tautkan
    section — and it was the more confusing of the two, because on a van it did
    not mean what the card's list says. It moved the ride into another visit
    (`groupId`); what a van serves is `linkedBookingIds`, ticked in its form.

    ⚠️ IT STAYS ON AN ORDINARY BOOKING — see `BookingDetailScreen.test.tsx`,
    where moving a booking into another visit is still the only way to relate
    two of them.
  */
  it("offers no way to link anything from the card", async () => {
    draw();

    await screen.findByRole("heading", { level: 1 });

    expect(
      screen.queryByRole("link", { name: /antar-jemput/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /tautkan booking/i }),
    ).not.toBeInTheDocument();
  });

  it("points at the form when the van serves nothing yet", async () => {
    draw(ride({ linked: [], group: [], related: [] }));

    expect(
      await screen.findByText(/belum melayani booking mana pun/i),
    ).toBeInTheDocument();
  });

  it("says plainly when the ride is not there", async () => {
    bookings.getById.mockRejectedValue(new Error("Booking tidak ditemukan"));
    renderWithAuth(<AntarJemputBookingDetailScreen id="bk-gone" />);

    expect(await screen.findByText("Booking tidak ditemukan")).toBeInTheDocument();
  });

  /* The branch is allowed to fail — a driver still needs the journey. */
  it("still draws the route when the branch cannot be read", async () => {
    bookings.getById.mockResolvedValue(ride());
    branches.getById.mockRejectedValue(new Error("timeout"));
    renderWithAuth(<AntarJemputBookingDetailScreen id="bk-aj" />);

    const rute = within(await ruteCard());

    expect(rute.getByText(/Jl\. Mawar No\. 12/)).toBeInTheDocument();
  });
});
