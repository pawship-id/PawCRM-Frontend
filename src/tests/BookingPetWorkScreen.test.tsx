import { screen, waitFor, within } from "@testing-library/react";
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
/**
 * ONE ANIMAL, WITH ITS SERVICES AND THE TURNS INSIDE THEM.
 *
 * ⚠️ `sessions` IS THE UNIT THE WORK SCREEN RENDERS. A service is a card; each
 * turn inside it is a row. The shorthand below still says `groomerName: "Sinta"`
 * because that is how a test describes its case — it is turned into the
 * one-person crew the API sends.
 *
 * A SERVICE WITH `sessions: []` IS A REAL CASE and the screen must still draw
 * its card, with "belum ada sesi" inside it: work nobody has been told to do is
 * what a groomer opening this page most needs to see.
 */
const session = (over: Record<string, unknown> = {}) => ({
  sessionId: "se-1",
  sessionName: "mandi",
  groomers: [{ _id: "user-1", name: "Mbak Sari", offReason: null }],
  status: "pending",
  startedAt: null,
  finishedAt: null,
  notesSession: null,
  notesInternalSession: null,
  media: [],
  ...over,
});

const petGroup = (
  petId: string,
  petName: string,
  services: Record<string, unknown>[] = [{}],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => ({
  petItemId: `pi-${petId}`,
  petId,
  petName,
  /* ⚠️ `in_progress`, NOT `arrived`. A turn can only be worked once the ANIMAL
     is on the table — see `canStartWork`. An arrived dog is one nobody has
     started, and every case below that presses Mulai would be asserting against
     a disabled button. */
  status: "in_progress",
  statusHistory: [],
  nextStatuses: [],
  cancelReason: null,
  internalNotes: null,
  customerNotes: null,
  notes: null,
  belongings: [],
  pulledToCartAt: null,
  pulledToInvoiceAt: null,
  services: services.map((service) => ({
    itemId: "row-mochi",
    serviceId: "svc-1",
    name: "Grooming Full Service",
    serviceType: "Grooming",
    price: "150000.0000",
    durationMin: 90,
    status: "pending",
    statusHistory: [],
    startedAt: null,
    finishedAt: null,
    sessions: [session()],
    addons: [],
    ...service,
  })),
});

/**
 * ONE ANIMAL WHOSE SERVICE HAS THE TURNS GIVEN.
 *
 * ⚠️ THE WORK ROWS READ `pets[].services[].sessions[]`, NOT `items[]`. The flat
 * array is the compatibility view the till and the invoice still use; setting a
 * `workStatus` there moves nothing on this screen, which is what several of
 * these tests used to do before the turns existed.
 */
const withSessions = (...sessions: Record<string, unknown>[]) => ({
  pets: [
    petGroup(MOCHI, "Mochi", [
      { sessions: sessions.map((one) => session(one)) },
    ]),
    petGroup(COCO, "Coco", [{ itemId: "row-coco", name: "Potong Kuku" }]),
  ],
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
    statusHistory: [],
    billingState: "unbilled",
    petCount: 2,
    items: [
      row(),
      row({
        _id: "row-coco",
        petId: COCO,
        petName: "Coco",
        name: "Potong Kuku",
      }),
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
  /*
    ⚠️ THE ROW IS NAMED BY ITS TURN, NOT BY ITS SERVICE. The service names the
    CARD above it; the row inside names the turn — "mandi", "blow dry". A turn
    carrying the service's own name reads as "Sesi" rather than printing
    "Grooming Full Service" twice on one block.
  */
  await userEvent.click(await screen.findByRole("button", { name: /mandi/i }));
}

const FULL = [{ feature: "bookings", actions: ["read", "update"] }];
const LADDER_ONLY = [
  { feature: "bookings", actions: ["read", "advanceStatus"] },
];

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
  bookings.setSessionCrew.mockResolvedValue(booking());
  customers.getById.mockResolvedValue({
    _id: "cust-1",
    name: "Bu Lisa",
    phone: "0812-3456-7890",
  } as never);
  branches.getById.mockResolvedValue({
    _id: "branch-1",
    name: "Cibubur",
  } as never);
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
      screen.getByRole("button", { name: /^mulai$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^selesai$/i }),
    ).not.toBeInTheDocument();
  });

  it("moves one row and nothing else", async () => {
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await openSession();
    await userEvent.click(screen.getByRole("button", { name: /^mulai$/i }));

    await waitFor(() => expect(bookings.advanceItemWork).toHaveBeenCalled());
    /* ⚠️ THE SESSION'S ID, NOT THE SERVICE'S. The work verbs address one TURN;
       sending a service id gets a 404 naming a session nobody mentioned. */
    expect(bookings.advanceItemWork).toHaveBeenCalledWith(
      "bk-1",
      "se-1",
      "in_progress",
    );
  });

  it("offers no way to reopen finished work", async () => {
    /*
      ⚠️ THIS CASE USED TO ASSERT THE OPPOSITE — that "Buka lagi" reopened a
      finished turn. The button was removed on the shop's request: work marked
      done is done, and an undo sitting beside the button that finishes it
      invited the pair to be pressed as a toggle.

      THE SERVER STILL ALLOWS THE MOVE (`WORK_TRANSITIONS`: done → in_progress),
      so a real correction remains possible through the API. What went is the
      affordance, which is why this asserts on the BUTTON and not on the verb.
    */
    bookings.getById.mockResolvedValue(
      booking(
        withSessions({
          status: "done",
          startedAt: "2026-09-03T02:00:00.000Z",
          finishedAt: "2026-09-03T03:30:00.000Z",
        }),
      ),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await openSession();

    /* The stamps are there — the turn IS finished and open, so this is not
       passing because the row failed to render. */
    expect(screen.getByText(/09\.00\s*–\s*10\.30/)).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /buka lagi/i }),
    ).not.toBeInTheDocument();
    expect(bookings.advanceItemWork).not.toHaveBeenCalled();
  });

  it("shows the clock in the shop's own hours, not UTC", async () => {
    /*
      A start of 09.00 in Jakarta is 02.00 UTC. Reading it through UTC is the
      bug the calendar shipped with once, and here it would put the work on the
      wrong day as well as the wrong hour.
    */
    bookings.getById.mockResolvedValue(
      booking(
        withSessions({
          status: "in_progress",
          startedAt: new Date("2026-09-03T09:05:00").toISOString(),
        }),
      ),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    /*
      ⚠️ READ, NOT TYPED. There were two text fields here and they asked somebody
      to write down a time they had just lived through; the buttons record it
      instead. What still matters is the TIMEZONE: 09.05 in Jakarta is 02.05 UTC,
      and reading it through UTC would put the work on the wrong hour and, near
      midnight, the wrong day.
    */
    expect(await screen.findByText("09.05")).toBeInTheDocument();
  });

  it("still offers the ladder to somebody who may only move the work", async () => {
    /*
      ⚠️ THIS USED TO BE "hides the clock from…". The clock was two editable
      fields, and editing them is `update` while moving the work is
      `advanceStatus` — so the fields were hidden from a groomer and the buttons
      were not.

      THE FIELDS ARE GONE: the buttons stamp the time, and stamping it IS moving
      the work. What survives of the old test is the half that still means
      something — a groomer who may only advance the ladder still can.
    */
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: LADDER_ONLY as never,
    });

    await openSession();
    expect(screen.queryByLabelText(/jam mulai/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^mulai$/i }),
    ).toBeInTheDocument();
  });

  /*
    ⚠️ "sends a corrected time back on the row's own day" WAS HERE AND IS GONE.

    It drove two text fields that no longer exist — the clock is stamped by the
    buttons now. `PATCH .../times` still exists on the server and is still
    audited, because a groomer with wet hands presses the button late and that
    correction decides the duration a commission matrix is read against. It has
    no way in from this screen until somebody builds one, and this note is here
    so that gap is a known one rather than a discovery.
  */

  it("carries the leave warning onto this page too", async () => {
    bookings.getById.mockResolvedValue(
      /*
        ⚠️ THE WARNING TRAVELS WITH THE PERSON, not with the row. Two people on
        one turn can be off on different days, so it hangs off each groomer in
        the crew — `items[]` is the flat compatibility view and the screen does
        not read it for this.
      */
      booking({
        pets: [
          petGroup(MOCHI, "Mochi", [
            {
              sessions: [
                session({
                  groomers: [
                    {
                      _id: "user-1",
                      name: "Mbak Sari",
                      offReason: "Libur setiap Kamis",
                    },
                  ],
                }),
              ],
            },
          ]),
          petGroup(COCO, "Coco", [{ itemId: "row-coco", name: "Potong Kuku" }]),
        ],
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
      /* TWO TURNS OF ONE SERVICE — which is what folding is for: the one being
         worked on opens itself, the rest stay shut. */
      booking(
        withSessions(
          { sessionId: "se-a", sessionName: "Mandi" },
          {
            sessionId: "se-b",
            sessionName: "Blow Dry",
            status: "in_progress",
            startedAt: "2026-09-03T03:00:00.000Z",
          },
        ),
      ),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    /*
      ⚠️ NAMED BY `aria-expanded`, NOT BY TEXT ALONE. The turn's own controls —
      "Hapus sesi", the crew's remove buttons — carry its name too, so a bare
      text match finds several. The toggle is the one that folds.
    */
    const toggles = await screen.findAllByRole("button", { expanded: false });
    const mandi = toggles.find((node) =>
      /mandi/i.test(node.textContent ?? ""),
    )!;
    const [blow] = screen
      .getAllByRole("button", { expanded: true })
      .filter((node) => /blow dry/i.test(node.textContent ?? ""));

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
/**
 * ─── ADDING A TURN: NAME, SAVE, AND THE BUTTON COMES BACK ───────────────────
 *
 * It used to ask for a GROOMER in the same breath, and the select was what
 * saved — so adding a turn meant answering a question the person adding it
 * usually cannot yet. The roster is read when the dog is on the table, not while
 * somebody is writing down that a blow dry is needed.
 */
/**
 * ─── THE BUTTON IS THE CLOCK ────────────────────────────────────────────────
 *
 * "Mulai" moves the turn to `in_progress` and the SERVER stamps `startedAt`;
 * "Selesai" moves it to `done` and stamps `finishedAt`. Nobody types a time on
 * this screen — the two text fields that used to ask for one were asking
 * somebody to write down a moment they had just lived through.
 */
describe("BookingPetWorkScreen — starting and finishing a turn", () => {
  it("starts the turn, and the button becomes the one that finishes it", async () => {
    /*
      ⚠️ THE ANSWER, NOT A REMOUNT. `PATCH .../work` returns the same document a
      GET would, and the screen puts it straight into state — so the button
      changes IN PLACE. This case used to render the component a second time
      against a re-mocked `getById`, which proved the fixture and not the page.
    */
    bookings.advanceItemWork.mockResolvedValue(
      booking(withSessions({ status: "in_progress" })),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await openSession();
    await userEvent.click(screen.getByRole("button", { name: /^mulai$/i }));

    await waitFor(() =>
      expect(bookings.advanceItemWork).toHaveBeenCalledWith(
        "bk-1",
        "se-1",
        "in_progress",
      ),
    );

    /* THE SAME BUTTON, ONE RUNG ON. A turn under way offers finishing and
       nothing else — a jump straight to done from not-started would record a
       start that never happened. */
    expect(
      await screen.findByRole("button", { name: /^selesai$/i }),
    ).toBeInTheDocument();

    /* And the page never went back to the server for it. */
    expect(bookings.getById).toHaveBeenCalledTimes(1);
  });

  it("shows the stamps it recorded, and offers no way to type one", async () => {
    bookings.getById.mockResolvedValue(
      booking(
        withSessions({
          status: "done",
          startedAt: new Date("2026-09-03T09:05:00").toISOString(),
          finishedAt: new Date("2026-09-03T10:35:00").toISOString(),
        }),
      ),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await openSession();

    expect(screen.getByText("09.05")).toBeInTheDocument();
    expect(screen.getByText("10.35")).toBeInTheDocument();
    /* ⚠️ NO EDITABLE CLOCK. A regression that puts the fields back fails here. */
    expect(screen.queryByLabelText(/jam mulai/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/jam selesai/i)).not.toBeInTheDocument();

    /*
      ⚠️ AND NO "ESTIMASI" COLUMN ON THE TURN. It is the SERVICE's number — a
      bath split into three turns does not take 60 minutes EACH — so it is shown
      once, on the card heading this row.

      ASSERTED ON THE COLUMN LABEL, not on the figure: "est 90 mnt" also appears
      in the card's own description, and matching the number would pass with the
      column still there.
    */
    expect(screen.queryByText(/^estimasi$/i)).not.toBeInTheDocument();
  });
});

/**
 * ─── THROWING A TURN AWAY ───────────────────────────────────────────────────
 *
 * Nothing guarded this before, which is how the button lived in the middle of
 * the crew controls, firing on one click, for as long as it did. Both halves
 * matter: that it ASKS, and that saying no leaves the turn alone.
 */
describe("BookingPetWorkScreen — removing a session", () => {
  /** Opens `mandi`, the turn the fixture crews. */
  async function openTurn() {
    const toggles = await screen.findAllByRole("button", { expanded: false });
    await userEvent.click(
      toggles.find((node) => /mandi/i.test(node.textContent ?? ""))!,
    );
  }

  it("asks before it throws the turn away", async () => {
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await openTurn();
    await userEvent.click(
      screen.getAllByRole("button", { name: /hapus sesi/i })[0],
    );

    /* ⚠️ NOTHING HAS BEEN SENT YET. A red trash beside the button a groomer
       presses every time they finish is one slip from an unrecoverable one. */
    expect(bookings.setSessionCrew).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /hapus sesi/i }),
    );

    await waitFor(() =>
      expect(bookings.setSessionCrew).toHaveBeenCalledWith("bk-1", {
        sessionId: "se-1",
        remove: true,
      }),
    );
  });

  it("leaves the turn alone when the answer is no", async () => {
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await openTurn();
    await userEvent.click(
      screen.getAllByRole("button", { name: /hapus sesi/i })[0],
    );

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /batal/i }),
    );

    expect(bookings.setSessionCrew).not.toHaveBeenCalled();
  });
});

/**
 * ─── WORK CANNOT BEGIN ON A VISIT NOBODY AGREED TO ──────────────────────────
 *
 * The server refuses to start a turn while the animal is still Draft or
 * Requested. This is the screen keeping step: a board full of Mulai buttons
 * that all answer 409 is worse than a board with none.
 */
/**
 * ─── WHAT STANDS BETWEEN THIS VISIT AND "COMPLETED" ─────────────────────────
 *
 * Said in red before the status control is touched, so nobody discovers it as a
 * 409. It mirrors `BookingService#changeStatus`, and the mirror has to be exact
 * — a warning that stays quiet for turns the server refuses over is worse than
 * no warning, because it reads as permission.
 */
describe("BookingPetWorkScreen — what blocks completing", () => {
  const render = (...turns: Record<string, unknown>[]) => {
    bookings.getById.mockResolvedValue(booking(withSessions(...turns)));
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });
  };

  /**
   * ⚠️ EVERY CREWED TURN ON THE WHOLE VISIT IS FINISHED, and one crewless turn
   * is not. That is the ONLY arrangement that can tell the two builds apart.
   *
   * The warning no longer names a service, so it is one string either way — the
   * only observable is whether it appears at all. Coco's nail clip has a crew
   * and is pending in the shared fixture, which would keep the warning on the
   * screen under EITHER reading; so it has to be finished here for Mochi's
   * unattended turn to be the only thing left.
   */
  const onlyCrewlessLeft = () => {
    const one = booking(withSessions({ groomers: [], status: "pending" }));

    one.pets = one.pets.map((entry) =>
      entry.petId === MOCHI
        ? entry
        : {
            ...entry,
            services: entry.services.map((service) => ({
              ...service,
              sessions: service.sessions.map((turn) => ({
                ...turn,
                status: "done" as const,
              })),
            })),
          },
    );

    bookings.getById.mockResolvedValue(one);
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });
  };

  it("counts a seeded turn nobody was put on", async () => {
    /*
      ⚠️ THE CASE THE OLD MIRROR MISSED. It also required a crew, matching a
      server exemption since withdrawn — and sessions now arrive SEEDED from the
      catalogue, so "nobody on it, nothing done" is what an untouched booking of
      Basic Grooming looks like. Silence here would read as permission.
    */
    onlyCrewlessLeft();

    expect(
      await screen.findByText(/^Layanan belum selesai$/i),
    ).toBeInTheDocument();
  });

  it("says nothing once every turn on the WHOLE visit is done", async () => {
    /*
      ⚠️ COCO'S TURN COUNTS TOO, and that is not an oversight in the fixture.
      The warning is about the VISIT — the same set the server refuses to
      complete over — so finishing Mochi's board while Coco's nail clip is still
      pending must still say so. Building this case is what proves it.
    */
    const one = booking(withSessions({ groomers: [], status: "done" }));
    one.pets = one.pets.map((entry: (typeof one.pets)[number]) => ({
      ...entry,
      services: entry.services.map((service) => ({
        ...service,
        sessions: service.sessions.map((turn) => ({ ...turn, status: "done" })),
      })),
    }));
    bookings.getById.mockResolvedValue(one);

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await screen.findAllByRole("button", { expanded: false });

    expect(screen.queryByText(/belum selesai/i)).not.toBeInTheDocument();
  });
});

describe("BookingPetWorkScreen — before the animal is on the table", () => {
  /** Opens `mandi`, whose crew is Mbak Sari, on a pet at the given rung. */
  async function openTurnAt(
    status: string,
    turn: Record<string, unknown> = {},
  ) {
    const one = booking(withSessions(turn));
    one.pets = one.pets.map((entry) =>
      entry.petId === MOCHI
        ? { ...entry, status: status as (typeof entry)["status"] }
        : entry,
    );
    bookings.getById.mockResolvedValue(one);

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    const toggles = await screen.findAllByRole("button", { expanded: false });
    const mandi = toggles.find((node) => /mandi/i.test(node.textContent ?? ""));
    if (mandi) await userEvent.click(mandi);
  }

  it.each(["draft", "requested", "confirmed", "arrived"])(
    "shows Mulai DISABLED while the animal is %s",
    async (status) => {
      await openTurnAt(status);

      /*
        ⚠️ PRESENT AND DISABLED, NOT ABSENT. A button that vanishes teaches
        nothing — somebody looking for "Mulai" and not finding it has no way to
        learn that the DOG has to be started first.
      */
      expect(
        await screen.findByRole("button", { name: /^mulai$/i }),
      ).toBeDisabled();
      expect(await screen.findByText(/sudah In Progress/i)).toBeInTheDocument();
    },
  );

  it("names the rung, not the crew, when BOTH would block", async () => {
    /*
      ⚠️ A CREWLESS TURN ON A DOG NOBODY HAS STARTED — the case where the two
      reasons compete. Told about the rung, because sending somebody to fix the
      crew on an animal still at Arrived changes nothing: the server refuses on
      the rung either way, and they would come back having done the work for no
      result.
    */
    await openTurnAt("arrived", { groomers: [] });

    expect(await screen.findByText(/sudah In Progress/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/tentukan groomernya dulu/i),
    ).not.toBeInTheDocument();
  });

  it("goes back to naming the crew once the rung is no longer the blocker", async () => {
    await openTurnAt("in_progress", { groomers: [] });

    expect(
      await screen.findByText(/tentukan groomernya dulu/i),
    ).toBeInTheDocument();
  });

  it("lets Mulai be pressed once the animal is on the table", async () => {
    await openTurnAt("in_progress");

    expect(
      await screen.findByRole("button", { name: /^mulai$/i }),
    ).toBeEnabled();
    expect(screen.queryByText(/sudah In Progress/i)).not.toBeInTheDocument();
  });
});

/**
 * ─── THE TRACK UNDER "STATUS SEJAK" ─────────────────────────────────────────
 *
 * It used to be one segment per SESSION, coloured by work status — which made it
 * a second, quieter version of the sentence beside it ("0 dari 3 selesai"),
 * sitting under a heading about the ladder. It now draws the animal's PATH.
 */
describe("BookingPetWorkScreen — the status track", () => {
  const show = (over: Record<string, unknown> = {}, status?: string) => {
    const one = booking(over);
    if (status) {
      one.pets = one.pets.map((entry) =>
        entry.petId === MOCHI
          ? { ...entry, status: status as (typeof entry)["status"] }
          : entry,
      );
    }
    bookings.getById.mockResolvedValue(one);

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });
  };

  /** The track's own segments — it is the one `role="img"` on the page. */
  const segments = async () =>
    Array.from(
      (await screen.findByRole("img", { name: /tahap|alur kunjungan/i }))
        .children,
    );

  it("has one segment per rung of the visit, and none for draft", async () => {
    /* No van, so no trip legs: requested · confirmed · arrived · in progress ·
       completed · return to pawrents. `draft` is not a step somebody walks. */
    show({}, "in_progress");

    expect(await segments()).toHaveLength(6);
  });

  it("grows the track when a van was booked", async () => {
    /*
      ⚠️ THE TRIP LEGS ARE THE BOOKING'S, not the animal's — one van fetches both
      dogs — so a track built off a fixed list would show `pickup` on a visit
      that never left the shop.
    */
    show({ pickupRequested: true, deliveryRequested: true }, "in_progress");

    expect(await segments()).toHaveLength(8);
  });

  it("fills up to the rung the animal has reached, and no further", async () => {
    show({}, "arrived");

    const bars = await segments();

    /* requested · confirmed · arrived */
    expect(
      bars.slice(0, 3).every((bar) => /bg-primary/.test(bar.className)),
    ).toBe(true);
    expect(bars.slice(3).every((bar) => /bg-border/.test(bar.className))).toBe(
      true,
    );
  });

  it("says where the animal is, in words, for a reader who cannot see it", async () => {
    show({}, "arrived");

    expect(
      await screen.findByRole("img", { name: /3 dari 6 tahap: Arrived/i }),
    ).toBeInTheDocument();
  });

  it("draws an empty track for a status that is not a rung", async () => {
    /*
      `cancelled` is a way OUT, not a step along the way, and `draft` is where a
      booking sits before it is an appointment. Neither has walked any of this,
      and inventing a position for them would be a guess.
    */
    show({}, "cancelled");

    const bars = await segments();

    expect(bars.every((bar) => /bg-border/.test(bar.className))).toBe(true);
  });
});

/**
 * ─── WHO MOVED THIS ANIMAL LAST ─────────────────────────────────────────────
 */
describe("BookingPetWorkScreen — Status sejak", () => {
  it("names the last move of THIS animal, not of the visit", async () => {
    /*
      ⚠️ THE MERGED TRAIL IS A DECOY HERE. Read from `booking.statusHistory`,
      this line reported whoever moved ANY dog last — so opening Mochi could name
      the person who had just sent Coco home, at a time Mochi never moved.
    */
    const one = booking();
    one.statusHistory = [
      {
        petId: COCO,
        petName: "Coco",
        status: "return_to_pawrents",
        at: "2026-09-03T10:26:00.000Z",
        by: "u-2",
        byName: "Jess",
        byRoleName: null,
        implied: false,
      },
    ];
    one.pets = one.pets.map((entry) =>
      entry.petId === MOCHI
        ? {
            ...entry,
            statusHistory: [
              {
                status: "arrived" as const,
                at: "2026-09-03T02:15:00.000Z",
                by: "u-1",
                /* A name that appears NOWHERE ELSE on the page — "Fitria" is
                   also the fixture's creator, and the created-by line would
                   have made this pass whatever the strip read. */
                byName: "Wulan",
                byRoleName: "Ops",
                implied: false,
              },
            ],
          }
        : entry,
    );
    bookings.getById.mockResolvedValue(one);

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    /*
      SCOPED TO THE "Status sejak" BLOCK. Wulan also appears on the Riwayat card
      below — correctly, it reads the same animal's trail — so a page-wide match
      would be ambiguous rather than wrong.
    */
    const label = await screen.findByText(/status sejak/i);
    const block = label.parentElement!;

    expect(within(block).getByText(/Wulan/)).toBeInTheDocument();

    /* And Coco's mover appears NOWHERE on Mochi's page. */
    expect(screen.queryByText(/Jess/)).not.toBeInTheDocument();
  });
});

describe("BookingPetWorkScreen — adding a session", () => {
  it("asks for the name only, and saves it", async () => {
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await userEvent.click(
      (await screen.findAllByRole("button", { name: /tambah sesi/i }))[0],
    );

    /* NOTHING ELSE IS ASKED FOR. A groomer select here would be the old flow. */
    expect(
      screen.queryByRole("combobox", { name: /groomer/i }),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("textbox", { name: /nama sesi baru/i }),
      "blow dry",
    );
    await userEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    await waitFor(() =>
      expect(bookings.setSessionCrew).toHaveBeenCalledWith("bk-1", {
        serviceItemId: "row-mochi",
        sessionName: "blow dry",
      }),
    );
  });

  it("refuses to save an empty name", async () => {
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await userEvent.click(
      (await screen.findAllByRole("button", { name: /tambah sesi/i }))[0],
    );

    /* A turn nobody can name is a row the work screen cannot label. */
    expect(screen.getByRole("button", { name: /^simpan$/i })).toBeDisabled();
  });

  it("closes afterwards, so another turn is a deliberate click", async () => {
    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: FULL as never,
    });

    await userEvent.click(
      (await screen.findAllByRole("button", { name: /tambah sesi/i }))[0],
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /nama sesi baru/i }),
      "kuku",
    );
    await userEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    /* The box goes, the button returns — adding a second turn is a click, not
       something that happens by carrying on typing. */
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: /nama sesi baru/i }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findAllByRole("button", { name: /tambah sesi/i }),
    ).not.toHaveLength(0);
  });
});

describe("BookingPetWorkScreen — the header's booking-level controls", () => {
  /** Puts Mochi on a named rung, leaving everything else as the fixture has it. */
  const atRung = (status: string) => {
    const one = booking();
    one.pets = one.pets.map((entry) =>
      entry.petId === MOCHI
        ? { ...entry, status: status as (typeof entry)["status"] }
        : entry,
    );
    bookings.getById.mockResolvedValue(one);
  };

  it("offers the very next rung as the primary action", async () => {
    /*
      ⚠️ PINNED AT `arrived` RATHER THAN INHERITED. This case is about the
      header offering the NEXT rung, so it has to own the rung it starts from —
      the shared fixture sits at `in_progress` (where a groomer can actually
      work a turn) and inheriting that would silently change what "next" means.
    */
    atRung("arrived");

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "bookings", actions: ["read", "update"] },
      ] as never,
    });

    expect(
      await screen.findByRole("button", { name: /start work →/i }),
    ).toBeInTheDocument();
  });

  it("warns that something is unfinished, before the button is pressed", async () => {
    /*
      THE SAME SENTENCE THE SERVER WOULD ANSWER WITH — said first, so pressing
      through is a decision made with the fact already in view, not a 409
      somebody has to interpret afterwards.
    */
    bookings.getById.mockResolvedValue(
      /*
        ⚠️ THE WARNING READS `pets[].services[].sessions[]`, NOT `items[]`. It
        names the work somebody is standing at and has not finished — which is a
        fact about a TURN, and the flat array has no turns in it.
      */
      booking({
        pets: [
          petGroup(MOCHI, "Mochi", [
            { sessions: [session({ status: "done" })] },
          ]),
          petGroup(COCO, "Coco", [
            {
              itemId: "row-coco",
              name: "Potong Kuku",
              sessions: [session({ sessionId: "se-coco" })],
            },
          ]),
        ],
      }),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "bookings", actions: ["read", "update"] },
      ] as never,
    });

    /*
      ⚠️ THE FACT, NOT THE NAME. This used to assert the SERVICE was named —
      "Potong Kuku belum selesai · +2 lagi". Naming one of three is not enough
      to act on and too much to skim on a strip that also carries the status,
      the clock, the track and a button; WHICH service is unfinished is on the
      cards below, where the turns somebody would move actually are.
    */
    expect(
      await screen.findByText(/^Layanan belum selesai$/i),
    ).toBeInTheDocument();
  });

  it("says nothing is blocking once every assigned row is done", async () => {
    bookings.getById.mockResolvedValue(
      /* EVERY TURN, ON BOTH ANIMALS, DONE — the warning reads the turns. */
      booking({
        pets: [
          petGroup(MOCHI, "Mochi", [
            { sessions: [session({ status: "done" })] },
          ]),
          petGroup(COCO, "Coco", [
            {
              itemId: "row-coco",
              name: "Potong Kuku",
              sessions: [session({ sessionId: "se-coco", status: "done" })],
            },
          ]),
        ],
      }),
    );

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "bookings", actions: ["read", "update"] },
      ] as never,
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
    expect(link).toHaveAttribute(
      "href",
      `/dashboard/master/pets/${MOCHI}/print`,
    );
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

  it("moving the booking updates the page from the ANSWER, without re-reading it", async () => {
    /* Pinned for the same reason as the case above: it presses "Start work",
       which only exists on an animal that has not been started. */
    atRung("arrived");

    /*
      The server answers a status change with the same document a GET would —
      `#named` builds both — so the screen has everything it needs already.
    */
    const moved = booking();
    moved.pets = moved.pets.map((entry) =>
      entry.petId === MOCHI
        ? { ...entry, status: "in_progress" as const }
        : entry,
    );
    bookings.changeStatus.mockResolvedValue(moved);

    renderWithAuth(<BookingPetWorkScreen bookingId="bk-1" petId={MOCHI} />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "bookings", actions: ["read", "update"] },
      ] as never,
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /start work →/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Start work", hidden: false }),
    );

    await waitFor(() =>
      /* ⚠️ THE ANIMAL IS NAMED. The ladder is the animal's since PCR-042, and
         this page is about one dog — the header's control moves that dog and
         leaves its neighbours where they are. */
      expect(bookings.changeStatus).toHaveBeenCalledWith(
        "bk-1",
        "in_progress",
        null,
        MOCHI,
      ),
    );
    /*
      ⚠️ THE BADGE MOVED — proving the page took the answer rather than ignoring
      it. Asserted BEFORE the request count below, because "no second fetch" is
      trivially true of a page that also did not update.
    */
    expect(await screen.findByText("In Progress")).toBeInTheDocument();

    /*
      ⚠️ AND EXACTLY ONE READ — the one on mount.

      This case used to assert the OPPOSITE, back when the control rang a
      doorbell (`setNonce`) and the mount effect re-ran: four requests — booking,
      animal, customer, branch — to learn a status this response already carried,
      with `loading` flipping back to true and blanking the page in between.
    */
    expect(bookings.getById).toHaveBeenCalledTimes(1);
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
          row({
            name: "Basic Grooming",
            price: "199000.0000",
            durationMin: 110,
          }),
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

    expect(
      await screen.findByText(/jemput & antar pulang/i),
    ).toBeInTheDocument();
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
    expect(screen.getByText(/dryer jangan dekat telinga/i)).toBeInTheDocument();
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

    /*
      SCOPED TO THE HEADER LINE. "Fitria (staff)" is now on the page TWICE and
      both are right: the audit line says who took the booking, and the trail's
      "Booking dibuat" entry says the same thing in the story of the visit. An
      unscoped query would have to be loosened to `getAllBy`, which would stop
      pinning that the header itself carries the role.
    */
    const line = await screen.findByText(/dibuat 30 agu 2026, 11\.52/i);

    expect(line).toHaveTextContent("Fitria (staff)");
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
    expect(screen.queryByRole("link", { name: "←" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "←" })).not.toBeInTheDocument();
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
