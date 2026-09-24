import { screen, waitFor, within } from "@testing-library/react";

import { AntarJemputBookingDetailScreen } from "@/features/antar-jemput";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import type { Booking, BookingSession } from "@/types/api";

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
      { _id: "pet-1", name: "Bella", petSize: "small" },
      { _id: "pet-2", name: "Milo", petSize: "medium" },
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
    NOTHING IS ADDED TO A PERJALANAN FROM HERE (24 September 2026, on request).
    "Tautkan booking" stays — relating what already exists is not adding — but
    "+ Antar-jemput" is gone from the card everywhere it renders.
  */
  it("offers no way to add another ride from the card", async () => {
    draw();

    await screen.findByRole("heading", { level: 1 });

    expect(
      screen.queryByRole("link", { name: /antar-jemput/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /tautkan booking/i }),
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
