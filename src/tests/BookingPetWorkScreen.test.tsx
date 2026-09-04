import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingPetWorkScreen } from "@/features/booking";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import type { Booking } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/branch.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const bookings = bookingService as jest.Mocked<typeof bookingService>;
const pets = petService as jest.Mocked<typeof petService>;
const customers = customerService as jest.Mocked<typeof customerService>;
const branches = branchService as jest.Mocked<typeof branchService>;

const MOCHI = "pet-1";
const COCO = "pet-2";

const row = (over: Record<string, unknown> = {}) => ({
  _id: "row-mochi",
  petId: MOCHI,
  petName: "Mochi",
  serviceId: "svc-1",
  name: "Grooming Full Service",
  price: "120000.0000",
  durationMin: 90,
  notes: null,
  pulledToCartAt: null,
  pulledToInvoiceAt: null,
  groomerUserId: "user-1",
  groomerName: "Sinta",
  groomerOffReason: null,
  workStatus: "pending",
  startedAt: null,
  finishedAt: null,
  ...over,
});

const booking = (over: Record<string, unknown> = {}): Booking =>
  ({
    _id: "bk-1",
    bookingNumber: "BK-260903-001",
    customerId: "cust-1",
    customerName: "Bu Lisa",
    branchId: "branch-1",
    scheduledAt: "2026-09-03T02:00:00.000Z",
    createdAt: "2026-08-30T04:52:00.000Z",
    createdByName: "Fitria",
    createdByRoleName: "Staff",
    status: "check_in",
    statusHistory: [],
    billingState: "unbilled",
    petCount: 2,
    items: [
      row(),
      row({ _id: "row-coco", petId: COCO, petName: "Coco", name: "Potong Kuku" }),
    ],
    ...over,
  }) as unknown as Booking;

/**
 * Opens the first session.
 *
 * SESSIONS ARE FOLDED BY DEFAULT — the one being worked on opens itself, the
 * rest stay shut, which is the reference's own rule: a closed row already
 * answers who, where, and how many minutes. Opening is for what you change.
 */
async function openSession() {
  await userEvent.click(
    await screen.findByRole("button", { name: /grooming full service/i }),
  );
}

const FULL = [{ feature: "bookings", actions: ["read", "update"] }];
const LADDER_ONLY = [{ feature: "bookings", actions: ["read", "advanceStatus"] }];

beforeEach(() => {
  jest.clearAllMocks();
  bookings.getById.mockResolvedValue(booking());
  bookings.advanceItemWork.mockResolvedValue(booking());
  bookings.correctItemTimes.mockResolvedValue(booking());
  bookings.changeStatus.mockResolvedValue(booking({ status: "in_progress" }));
  /*
    WHO MAY BE BOOKED THAT DAY — read by the per-session crew editor. Best
    effort in the component; stubbed here so the cases that are about the clock
    and the ladder are not about a rejected fetch.
  */
  bookings.availability.mockResolvedValue([
    { _id: "user-1", fullName: "Mbak Sari", offReason: null },
  ] as never);
  bookings.setItemGroomers.mockResolvedValue(booking());
  customers.getById.mockResolvedValue({
    _id: "cust-1",
    name: "Bu Lisa",
    phone: "0812-3456-7890",
  } as never);
  branches.getById.mockResolvedValue({ _id: "branch-1", name: "Cibubur" } as never);
  pets.getById.mockResolvedValue({
    _id: MOCHI,
    name: "Mochi",
    preferences: { text: null, tags: [] },
    medical: {
      allergies: [],
      conditions: [],
      medications: [],
      vaccinations: [],
      vet: { clinicName: null, phone: null },
    },
  } as never);
});

/**
 * ONE ANIMAL'S WORK IN ONE VISIT.
 *
 * "Mochi sudah selesai mandi tapi Coco belum" was a sentence this system had no
 * way to hold: status lived on the booking, so a visit with two animals had one
 * answer for both.
 */
describe("BookingPetWorkScreen", () => {
  it("shows only this animal's services", async () => {
    /*
      THE WHOLE POINT OF THE PAGE. Coco's nail trim on Mochi's page is the
      confusion it exists to remove — there must be no doubt whose button was
      pressed.
    */
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    /*
      TWICE ON PURPOSE — once in Detail Appointment, once as a session — which
      is the reference's own layout. What matters is that COCO's service is
      nowhere: this page is one animal's work.
    */
    expect(
      (await screen.findAllByText("Grooming Full Service")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Potong Kuku")).not.toBeInTheDocument();
  });

  it("offers only the next rung, never a jump", async () => {
    /*
      A FREE JUMP IS WHAT THE REFERENCE OFFERS AND IT IS NOT COPIED. The ladder
      exists so the trail can be read afterwards; skipping to "done" from "not
      started" records a start that never happened.
    */
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await openSession();
    expect(
      screen.getByRole("button", { name: /mulai kerjakan/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /tandai selesai/i }),
    ).not.toBeInTheDocument();
  });

  it("moves one row and nothing else", async () => {
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await openSession();
    await userEvent.click(
      screen.getByRole("button", { name: /mulai kerjakan/i }),
    );

    await waitFor(() => expect(bookings.advanceItemWork).toHaveBeenCalled());
    expect(bookings.advanceItemWork).toHaveBeenCalledWith(
      "bk-1",
      "row-mochi",
      "in_progress",
    );
  });

  it("lets finished work be reopened", async () => {
    /*
      A dog handed back wet comes off the table again. Refusing it would send the
      correction onto paper, where nothing can read it.
    */
    bookings.getById.mockResolvedValue(
      booking({
        items: [row({ workStatus: "done", startedAt: "2026-09-03T02:00:00.000Z", finishedAt: "2026-09-03T03:30:00.000Z" })],
      }),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await openSession();
    await userEvent.click(screen.getByRole("button", { name: /buka lagi/i }));

    await waitFor(() =>
      expect(bookings.advanceItemWork).toHaveBeenCalledWith(
        "bk-1",
        "row-mochi",
        "in_progress",
      ),
    );
  });

  it("shows the clock in the shop's own hours, not UTC", async () => {
    /*
      A start of 09.00 in Jakarta is 02.00 UTC. Reading it through UTC is the
      bug the calendar shipped with once, and here it would put the work on the
      wrong day as well as the wrong hour.
    */
    bookings.getById.mockResolvedValue(
      booking({
        items: [row({ workStatus: "in_progress", startedAt: new Date("2026-09-03T09:05:00").toISOString() })],
      }),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    expect(await screen.findByLabelText(/jam mulai/i)).toHaveValue("09.05");
  });

  it("hides the clock from somebody who may only move the work", async () => {
    /*
      CORRECTING THE CLOCK IS `update`, NOT `advanceStatus`, and the difference
      is money: these times decide duration, and duration is what a commission
      matrix is read against. The server refuses it either way; hiding the field
      stops somebody filling one in and being told no afterwards.
    */
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: LADDER_ONLY as never,
    });

    await openSession();
    expect(screen.queryByLabelText(/jam mulai/i)).not.toBeInTheDocument();
    /* But the ladder is still theirs. */
    expect(
      screen.getByRole("button", { name: /mulai kerjakan/i }),
    ).toBeInTheDocument();
  });

  it("sends a corrected time back on the row's own day", async () => {
    /*
      ANCHORED TO THE ROW'S DATE. A bare time has no date, and taking today's
      would move a correction made on Thursday onto Thursday when the work
      happened on Wednesday.
    */
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await openSession();
    const field = screen.getByLabelText(/jam mulai/i);
    await userEvent.type(field, "09.05");
    await userEvent.tab();

    await waitFor(() => expect(bookings.correctItemTimes).toHaveBeenCalled());
    const [, , times] = bookings.correctItemTimes.mock.calls[0];
    expect(new Date(times.startedAt!).getDate()).toBe(
      new Date("2026-09-03T02:00:00.000Z").getDate(),
    );
  });

  it("carries the leave warning onto this page too", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        items: [row({ groomerOffReason: "Libur setiap Kamis" })],
      }),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    /* Inside the session, so it has to be opened — like every other control. */
    await openSession();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/libur setiap kamis/i);
  });

  it("says plainly when this animal is not on the booking", async () => {
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId="pet-9" />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    expect(
      await screen.findByText(/tidak punya layanan di booking/i),
    ).toBeInTheDocument();
  });

  it("still shows the work when the pet profile cannot be read", async () => {
    /*
      The rows carry the name already. A page that refused to show the work
      because a second call timed out would send somebody to the table with
      nothing.
    */
    pets.getById.mockRejectedValue(new Error("offline"));

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    expect(
      (await screen.findAllByText("Grooming Full Service")).length,
    ).toBeGreaterThan(0);
    /* And it says so, rather than leaving a blank where the animal was. */
    expect(
      screen.getByText(/profil hewan tidak bisa dimuat/i),
    ).toBeInTheDocument();
  });

  /*
    ─── FOLDING, THE REFERENCE'S OWN RULE ────────────────────────────────────

    Closed by default; the one being worked on opens itself. A closed row already
    carries what is looked at most — who is on it, where it stands, how many
    minutes — and opening is for the things you change.
  */
  it("keeps sessions folded, and opens the one being worked on", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        items: [
          row({ _id: "row-a", name: "Mandi" }),
          row({
            _id: "row-b",
            name: "Blow Dry",
            workStatus: "in_progress",
            startedAt: "2026-09-03T03:00:00.000Z",
          }),
        ],
      }),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    const mandi = await screen.findByRole("button", { name: /mandi/i });
    const blow = screen.getByRole("button", { name: /blow dry/i });

    expect(mandi).toHaveAttribute("aria-expanded", "false");
    expect(blow).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the branch and the customer's number", async () => {
    /*
      THE NUMBER IS THE POINT of that block: it is who to ring when the groomer
      turns out to be on leave, or the dog needs something the owner did not ask
      for.
    */
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    expect(await screen.findByText("0812-3456-7890")).toBeInTheDocument();
    expect(screen.getByText("Cibubur")).toBeInTheDocument();
  });

  it("still renders when the branch and customer cannot be read", async () => {
    customers.getById.mockRejectedValue(new Error("offline"));
    branches.getById.mockRejectedValue(new Error("offline"));

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    expect(
      (await screen.findAllByText("Grooming Full Service")).length,
    ).toBeGreaterThan(0);
  });

  it("points at the commission report rather than showing the money", async () => {
    /*
      THE REFERENCE'S OWN NOTE, and it is right: this page is open at the counter
      all day. Commission figures are payroll, and payroll has its own grant.
    */
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    const link = await screen.findByRole("link", { name: /laporan/i });
    expect(link).toHaveAttribute("href", "/dashboard/reports/commissions");
  });
});

/**
 * ─── THE HEADER'S BOOKING-LEVEL CONTROLS ────────────────────────────────────
 *
 * Reported against a reference screenshot, 3 September 2026: the header card
 * was missing the primary status action, the "Status lain" menu, print and
 * WhatsApp — everything the reference's `.phead .stbar` carries except the
 * per-session progress track, which this page keeps because a fixed six-rung
 * bar would summarise several animals' different work into one line.
 */
describe("BookingPetWorkScreen — the header's booking-level controls", () => {
  it("offers the very next rung as the primary action", async () => {
    // `check_in`'s next rung is `in_progress` — "Mulai dikerjakan".
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read", "update"] }] as never,
    });

    expect(
      await screen.findByRole("button", { name: /mulai dikerjakan →/i }),
    ).toBeInTheDocument();
  });

  it("warns which animal is blocking completion, before the button is pressed", async () => {
    /*
      THE SAME SENTENCE THE SERVER WOULD ANSWER WITH — said first, so pressing
      through is a decision made with the fact already in view, not a 409
      somebody has to interpret afterwards.
    */
    bookings.getById.mockResolvedValue(
      booking({
        items: [
          row({ workStatus: "done", startedAt: "x", finishedAt: "y" }),
          row({ _id: "row-coco", petId: COCO, petName: "Coco", name: "Potong Kuku" }),
        ],
      }),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read", "update"] }] as never,
    });

    expect(await screen.findByText(/potong kuku.*belum selesai/i)).toBeInTheDocument();
  });

  it("says nothing is blocking once every assigned row is done", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        items: [
          row({ workStatus: "done", startedAt: "x", finishedAt: "y" }),
          row({ _id: "row-coco", petId: COCO, petName: "Coco", workStatus: "done", startedAt: "x", finishedAt: "y" }),
        ],
      }),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read", "update"] }] as never,
    });

    await screen.findByRole("heading", { name: "Mochi" });
    expect(screen.queryByText(/belum selesai/i)).not.toBeInTheDocument();
  });

  it("links Cetak at the printable pet card, not a dead button", async () => {
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read"] }] as never,
    });

    const link = await screen.findByRole("link", { name: /cetak/i });
    expect(link).toHaveAttribute("href", `/dashboard/master/pets/${MOCHI}/print`);
  });

  it("builds a working wa.me link from a locally-formatted number", async () => {
    // "0812-3456-7890" is what the customer form actually stores — not E.164.
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read"] }] as never,
    });

    const link = await screen.findByRole("link", { name: /whatsapp/i });
    expect(link).toHaveAttribute("href", "https://wa.me/6281234567890");
  });

  it("offers no WhatsApp button when the customer has no number", async () => {
    // A button that opens WhatsApp to nowhere is worse than no button.
    customers.getById.mockResolvedValue({
      _id: "cust-1",
      name: "Bu Lisa",
      phone: null,
    } as never);

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read"] }] as never,
    });

    await screen.findByRole("link", { name: /cetak/i });
    expect(
      screen.queryByRole("link", { name: /whatsapp/i }),
    ).not.toBeInTheDocument();
  });

  it("moving the booking from this page's header re-reads the whole page", async () => {
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read", "update"] }] as never,
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /mulai dikerjakan →/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Mulai dikerjakan", hidden: false }),
    );

    await waitFor(() => expect(bookings.changeStatus).toHaveBeenCalledWith(
      "bk-1",
      "in_progress",
      null,
    ));
    // getById is called once on mount and once more after the nonce bumps.
    await waitFor(() => expect(bookings.getById.mock.calls.length).toBeGreaterThan(1));
  });
});

/**
 * ─── THE HEADER'S AUDIT LINE ────────────────────────────────────────────────
 *
 * Asked for against a reference screenshot, 3 September 2026: "Dibuat 3 Sep
 * 2026 11.52 · Fitria (ops) · BK-260903-003" — when the booking was CREATED,
 * who made it and their role, and its own number. Not the scheduled
 * appointment time repeated a second time; that already has its place in the
 * Detail Appointment card.
 */
describe("BookingPetWorkScreen — the header's audit line", () => {
  it("shows when it was created, who made it, and their role", async () => {
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read"] }] as never,
    });

    expect(
      await screen.findByText(/dibuat 30 agu 2026, 11\.52/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/fitria \(staff\)/i)).toBeInTheDocument();
  });

  it("names the booking number as a link back to the overview", async () => {
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read"] }] as never,
    });

    const link = await screen.findByRole("link", { name: "BK-260903-001" });
    expect(link).toHaveAttribute("href", "/dashboard/booking/bk-1");
  });

  it("says 'sistem' rather than leaving a blank when nobody made it", async () => {
    bookings.getById.mockResolvedValue(
      booking({ createdByName: null, createdByRoleName: null }),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read"] }] as never,
    });

    expect(await screen.findByText(/· sistem ·/i)).toBeInTheDocument();
  });

  it("shows the name with no parentheses when there is no role to show", async () => {
    // The seeded Owner reaches every permission by bypass, not an assigned role.
    bookings.getById.mockResolvedValue(
      booking({ createdByName: "Owner", createdByRoleName: null }),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read"] }] as never,
    });

    expect(await screen.findByText(/· owner ·/i)).toBeInTheDocument();
    expect(screen.queryByText(/\(/)).not.toBeInTheDocument();
  });

  it("has no back-arrow button — the booking number is the way back now", async () => {
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read"] }] as never,
    });

    await screen.findByRole("heading", { name: "Mochi" });
    expect(
      screen.queryByRole("link", { name: "←" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "←" }),
    ).not.toBeInTheDocument();
  });
});
