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

/** One animal's entry in the API's grouped view — see `Booking["pets"]`. */
const petGroup = (
  petId: string,
  petName: string,
  services: Record<string, unknown>[] = [{}],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => ({
  petId,
  petName,
  services: services.map((service) => ({
    itemId: "row-mochi",
    serviceId: "svc-1",
    name: "Grooming Full Service",
    serviceType: "Grooming",
    price: "150000.0000",
    durationMin: 90,
    groomerUserId: "user-1",
    groomerName: "Mbak Sari",
    groomerOffReason: null,
    assistantGroomers: [],
    workStatus: "pending",
    startedAt: null,
    finishedAt: null,
    notes: null,
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    addons: [],
    ...service,
  })),
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
    /*
      THE SAME ROWS GROUPED, the way the API hands them over: one entry per
      animal, services inside, add-ons under each. The Detail Appointment card
      reads this so an add-on hangs off its service rather than sitting beside
      it; `items` above still answers the row questions.
    */
    pets: [
      petGroup(MOCHI, "Mochi"),
      petGroup(COCO, "Coco", [{ itemId: "row-coco", name: "Potong Kuku" }]),
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
    /*
      THE BRANCH READS WITH THE LOCATION, as one answer: "Di rumah pelanggan"
      without the branch says nothing about who is driving.
    */
    expect(screen.getByText(/Di toko · Cibubur/i)).toBeInTheDocument();
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
/**
 * ─── THE ANIMAL, AT ARM'S LENGTH ────────────────────────────────────────────
 *
 * A groomer reads this card while holding a dog. What it has to answer without
 * being opened: which animal, the facts that decide how it is handled, and
 * anything that must not be done to it.
 */
/**
 * ─── DETAIL APPOINTMENT ─────────────────────────────────────────────────────
 *
 * What is being charged, and what was added to it. The add-on is the part that
 * has to read as attached: nobody chooses "Parfum" on its own.
 */
describe("BookingPetWorkScreen — the Detail Appointment card", () => {
  const withAddon = () =>
    bookings.getById.mockResolvedValue(
      booking({
        pets: [
          petGroup(MOCHI, "Mochi", [
            {
              name: "Basic Grooming",
              price: "199000.0000",
              durationMin: 110,
              addons: [
                {
                  itemId: "row-detangle",
                  serviceId: "svc-detangle",
                  name: "Minor Full Body Detangling",
                  price: "75000.0000",
                  durationMin: 30,
                  pulledToCartAt: null,
                  pulledToInvoiceAt: null,
                },
              ],
            },
          ]),
        ],
        items: [
          row({ name: "Basic Grooming", price: "199000.0000", durationMin: 110 }),
          row({
            _id: "row-detangle",
            name: "Minor Full Body Detangling",
            price: "75000.0000",
            durationMin: 30,
            parentItemId: "row-mochi",
          }),
        ],
      }),
    );

  it("hangs the add-on off its service, with its own extra minutes", async () => {
    withAddon();

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />);

    expect(
      await screen.findByText(/\+ Minor Full Body Detangling · \+30 mnt/),
    ).toBeInTheDocument();
  });

  it("counts the add-on in the final total", async () => {
    // 199.000 + 75.000 — a total that ignored it would disagree with the bill.
    withAddon();

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />);

    expect(await screen.findByText(/total akhir/i)).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?274[.,]000/)).toBeInTheDocument();
  });

  it("says when the visit ends, not only when it starts", async () => {
    /*
      "09.00" answers when to arrive; "09.00 – 11.20" answers when the animal
      goes home, which is what the owner asks at the counter. 110 + 30 minutes.
    */
    withAddon();

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />);

    expect(await screen.findByText(/09\.00 – 11\.20/)).toBeInTheDocument();
  });

  it("spells out that there is no trip rather than leaving it blank", async () => {
    // "Tidak ada" is a real answer a driver needs; blank reads as undecided.
    withAddon();

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />);

    expect(await screen.findByText("Tidak ada")).toBeInTheDocument();
  });

  it("names the trip when there is one", async () => {
    bookings.getById.mockResolvedValue(
      booking({ pickupRequested: true, deliveryRequested: true }),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />);

    expect(await screen.findByText(/jemput & antar pulang/i)).toBeInTheDocument();
  });

  it("offers the way to correct the price, on the card that states it", async () => {
    withAddon();

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    const edit = await screen.findByRole("link", {
      name: /edit layanan & harga/i,
    });
    expect(edit).toHaveAttribute("href", "/dashboard/booking/bk-1/edit");
  });

  it("keeps that link away from somebody who may not reprice", async () => {
    withAddon();

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read"] }] as never,
    });

    await screen.findByText(/total akhir/i);
    expect(
      screen.queryByRole("link", { name: /edit layanan & harga/i }),
    ).not.toBeInTheDocument();
  });
});

describe("BookingPetWorkScreen — the Hewan & Pelanggan card", () => {
  const brownie = {
    _id: MOCHI,
    name: "Brownie",
    species: "cat",
    breed: "domestic",
    weightKg: 6.8,
    size: "medium",
    furType: "long hair",
    preferences: {
      text: "Dryer jangan dekat telinga.",
      tags: ["kusut-berat"],
    },
    medical: {
      allergies: [],
      conditions: [],
      medications: [],
      vaccinations: [],
      vet: { clinicName: null, phone: null },
    },
  } as never;

  it("names the animal and the three facts under it", async () => {
    pets.getById.mockResolvedValue(brownie);

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />);

    expect(await screen.findByText("Brownie")).toBeInTheDocument();
    // breed · weight · species, in the shop's own words.
    expect(screen.getByText(/6\.8 kg/)).toBeInTheDocument();
    expect(screen.getByText(/Kucing/)).toBeInTheDocument();
  });

  it("shows size and coat as chips — the two a variant price is quoted from", async () => {
    pets.getById.mockResolvedValue(brownie);

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />);

    expect(await screen.findByText("Sedang")).toBeInTheDocument();
    expect(screen.getByText("Bulu panjang")).toBeInTheDocument();
  });

  it("leaves the chips out entirely when nobody recorded them", async () => {
    // An empty chip is a thing to decode; absence says the same and reads faster.
    pets.getById.mockResolvedValue({
      ...(brownie as object),
      size: null,
      furType: null,
    } as never);

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />);

    await screen.findByText("Brownie");
    expect(screen.queryByText("Sedang")).not.toBeInTheDocument();
    expect(screen.queryByText(/Bulu/)).not.toBeInTheDocument();
  });

  it("gives the handling note its own heading", async () => {
    /*
      It is an instruction somebody is about to follow, and it comes from the
      profile rather than from this visit — the heading is what separates it from
      the booking's own note a few centimetres away.
    */
    pets.getById.mockResolvedValue(brownie);

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />);

    expect(await screen.findByText(/catatan penanganan/i)).toBeInTheDocument();
    expect(
      screen.getByText(/dryer jangan dekat telinga/i),
    ).toBeInTheDocument();
  });

  it("still works the booking when the profile cannot be read", async () => {
    // The card degrades; the work does not.
    pets.getById.mockRejectedValue(new Error("no"));

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />);

    expect(
      await screen.findByText(/profil hewan tidak bisa dimuat/i),
    ).toBeInTheDocument();
  });
});

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

/**
 * TITIPAN OWNER, ON THE ANIMAL'S PAGE.
 *
 * It was one card on the booking overview, grouped by animal. Handing a collar
 * back happens at the table next to the animal it belongs to, and the overview
 * made somebody scroll past two other animals' things to tick one. What these
 * pin is that it landed here and that it shows ONE animal's things — the card's
 * own behaviour is `BookingBelongingsCard.test.tsx`.
 */
describe("BookingPetWorkScreen — titipan owner", () => {
  const carrier = {
    _id: "bel-1",
    petId: MOCHI,
    name: "Carrier biru",
    checkedInAt: "2026-09-02T03:00:00.000Z",
    checkedOutAt: null,
    checkedInBy: null,
    checkedOutBy: null,
  };

  it("carries the list, and only this animal's things", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        belongings: [
          carrier,
          { ...carrier, _id: "bel-2", petId: COCO, name: "Kalung merah" },
        ],
      }) as never,
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    expect(await screen.findByText("Titipan Owner")).toBeInTheDocument();
    expect(screen.getByText("Carrier biru")).toBeInTheDocument();
    expect(screen.queryByText("Kalung merah")).not.toBeInTheDocument();
    expect(screen.getByText("1 belum kembali")).toBeInTheDocument();
  });

  it("ticks a thing back out from here", async () => {
    // The act the move was for: one request, against one item, on the page
    // somebody has open while the owner is standing there.
    bookings.getById.mockResolvedValue(
      booking({ belongings: [carrier] }) as never,
    );
    bookings.checkBelonging.mockResolvedValue(
      booking({ belongings: [] }) as never,
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await userEvent.click(await screen.findByLabelText(/carrier biru keluar/i));

    await waitFor(() =>
      expect(bookings.checkBelonging).toHaveBeenCalledWith("bk-1", "bel-1", {
        checkedOut: true,
      }),
    );
  });
});
