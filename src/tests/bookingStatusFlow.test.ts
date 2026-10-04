import {
  BOOKING_STATUS_ACTIONS,
  bookingStatusAction,
  canCancel,
  canReschedule,
  forwardStatuses,
  hasCompletedWork,
  hasStarted,
  impliedStatuses,
  ladderFor,
  transitionsFor,
} from "@/features/booking/statusFlow";
import { bookingStatusLabel } from "@/features/booking/components/BookingStatusBadge";
import type { BookingLike } from "@/features/booking/statusFlow";
import type { BookingStatus } from "@/types/api";

/**
 * ONE BOOKING CARRIES BOTH HALVES: the rung, and the trip that decides which
 * rungs exist. `at()` builds one, as a one-element tuple so every call reads
 * `verb(...at(status, trip))`.
 */
const at = (
  status: BookingStatus,
  trip: Partial<BookingLike> = {},
): [BookingLike] => [
  {
    status,
    pickupRequested: false,
    deliveryRequested: false,
    ...trip,
  } as BookingLike,
];

/** The booking alone, for `ladderFor` — which is about the trip, not the rung. */
const visit = (trip: Partial<BookingLike> = {}): BookingLike =>
  at("draft", trip)[0];

/**
 * THE LADDER IS A FUNCTION OF THE BOOKING, NOT A CONSTANT.
 *
 * The two trip legs are conditional on what the customer asked for, so what
 * counts as "the next rung" depends on the booking in hand. This file is a
 * MIRROR of `booking.model.js`; the server refuses an illegal move whatever it
 * says, and what it buys is a menu that offers only moves that will be accepted.
 */
describe("the booking ladder", () => {
  it("leaves out a trip leg nobody asked for", () => {
    expect(ladderFor(visit())).not.toContain("pickup");
    expect(ladderFor(visit())).not.toContain("delivery");
  });

  it("puts pickup before arrival and delivery before going home", () => {
    // A van fetches the animal BEFORE it is here, and takes it home before it
    // is with its owner. Either the other way round describes nothing.
    const ladder = ladderFor(
      visit({ pickupRequested: true, deliveryRequested: true }),
    );

    expect(ladder.indexOf("pickup")).toBeLessThan(ladder.indexOf("arrived"));
    expect(ladder.indexOf("delivery")).toBeLessThan(
      ladder.indexOf("return_to_pawrents"),
    );
  });

  it("never offers a leg the booking did not book", () => {
    /*
      THE SHARPEST EDGE OF THE CONDITIONAL RUNGS. A menu built from the status
      alone would offer "Mulai penjemputan" on a visit with no van booked — and
      the server would refuse it, one 409 at a time.
    */
    expect(forwardStatuses(...at("confirmed"))).not.toContain("pickup");
    expect(
      forwardStatuses(...at("confirmed", { pickupRequested: true })),
    ).toContain("pickup");
  });

  it("backfills only the rungs THIS booking passes through", () => {
    // Implied rungs are what the trail records; inventing `pickup` behind a
    // move would put a van journey in it that never left the shop.
    expect(impliedStatuses(...at("confirmed"), "in_progress")).toEqual([
      "arrived",
    ]);
    expect(
      impliedStatuses(
        ...at("confirmed", { pickupRequested: true }),
        "in_progress",
      ),
    ).toEqual(["pickup", "arrived"]);
  });

  it("keeps a draft from jumping past the animal arriving", () => {
    /*
      A DRAFT IS NOT A COMMITMENT — a line in a basket somebody may yet empty.
      Landing one on `completed` would mint a finished, commissioned visit out of
      something nobody ever agreed to.
    */
    expect(forwardStatuses(...at("draft"))).toEqual([
      "requested",
      "confirmed",
      "arrived",
    ]);
  });

  it("ends a visit at return_to_pawrents, not at completed", () => {
    /*
      `completed` USED TO BE TERMINAL. The work being finished is not the end of
      a visit: the animal is still at the shop, and what happens next is exactly
      the part a customer notices.
    */
    expect(forwardStatuses(...at("completed"))).toEqual(["return_to_pawrents"]);
    expect(transitionsFor(...at("return_to_pawrents"))).toEqual([]);
  });

  it("stops offering cancellation once the work is done", () => {
    // Undoing that is correcting money rather than a schedule.
    expect(canCancel(...at("in_progress"))).toBe(true);
    expect(canCancel(...at("completed"))).toBe(false);
  });

  it("closes the money guard at completed, not at the end of the visit", () => {
    /*
      THE DISTINCTION THE WIDER LADDER CREATED. Commission is computed at
      `completed` and the money is usually taken; a guard left on "is it over"
      would let somebody re-price or re-crew a finished groom for as long as the
      van was on its way home.
    */
    expect(hasCompletedWork(...at("in_progress"))).toBe(false);
    expect(hasCompletedWork(...at("completed"))).toBe(true);
    expect(
      hasCompletedWork(...at("delivery", { deliveryRequested: true })),
    ).toBe(true);
  });

  it("lets an appointment be moved only before the animal is here", () => {
    // Moving the date of a visit that is happening describes nothing — that is
    // a new booking.
    expect(canReschedule(...at("requested"))).toBe(true);
    expect(canReschedule(...at("confirmed"))).toBe(true);
    expect(canReschedule(...at("arrived"))).toBe(false);
    expect(canReschedule(...at("in_progress"))).toBe(false);
  });

  it("refuses to reschedule a draft — its date is edited on the form", () => {
    // Landing it on `confirmed` through a button labelled "reschedule" would
    // confirm an appointment nobody agreed to.
    expect(canReschedule(...at("draft"))).toBe(false);
  });

  it("moves nowhere from `rescheduled`, which nothing is ever in", () => {
    // A trail entry, not a place to stand. A booking found in it is corrupt,
    // and offering it moves would paper over that.
    expect(transitionsFor(...at("rescheduled"))).toEqual([]);
  });

  it("names every status as an act, not as an adjective", () => {
    // A menu row is something somebody DOES. Every status needs one, including
    // the two that never appear in the menu, because the map is exhaustive.
    Object.values(BOOKING_STATUS_ACTIONS).forEach((label) => {
      expect(label.length).toBeGreaterThan(0);
    });
  });
});

/*
  ─── A RIDE WALKS FOUR RUNGS (23 September 2026) ───────────────────────────

  The mirror of `RIDE_LADDER` in booking.model.js. These pin the ORDER and the
  two rungs that are NOT on it, which no type can check.
*/
describe("the antar-jemput ladder", () => {
  const ride = (status: BookingStatus): [BookingLike] =>
    at(status, { tripLeg: "pickup" });

  it("walks Draft, Confirmed, On the Way, Arrived", () => {
    expect(ladderFor(visit({ tripLeg: "pickup" }))).toEqual([
      "draft",
      "confirmed",
      "in_progress",
      "completed",
    ]);
  });

  it("has no `requested` and no `arrived`", () => {
    const ladder = ladderFor(visit({ tripLeg: "pickup" }));

    expect(ladder).not.toContain("requested");
    expect(ladder).not.toContain("arrived");
  });

  it("never offers the trip rungs, whatever the flags say", () => {
    const ladder = ladderFor(
      visit({ tripLeg: "pickup", pickupRequested: true, deliveryRequested: true }),
    );

    expect(ladder).not.toContain("pickup");
    expect(ladder).not.toContain("delivery");
  });

  it("stops a draft ride at confirmed", () => {
    expect(transitionsFor(...ride("draft"))).toEqual(["confirmed", "cancelled"]);
  });

  it("offers the rungs ahead from confirmed", () => {
    expect(transitionsFor(...ride("confirmed"))).toEqual([
      "in_progress",
      "completed",
      "cancelled",
    ]);
  });

  it("is final once the van has arrived", () => {
    expect(transitionsFor(...ride("completed"))).toEqual([]);
  });

  /*
    ⚠️ THE REGRESSION GUARD for the refactor that made room for this: the draft
    ceiling stopped naming `arrived` and started asking for the rung before
    `in_progress`. On the full ladder they are the same rung.
  */
  it("leaves an ordinary booking's ladder exactly where it was", () => {
    expect(transitionsFor(...at("draft"))).toEqual([
      "requested",
      "confirmed",
      "arrived",
      "cancelled",
    ]);
  });

  /*
    A RIDE'S DATE MOVES UNTIL THE VAN DOES. Asked through `hasStarted`: a
    comparison naming `arrived` finds nothing on this ladder, answers -1, and
    calls every van "already started" — including one booked for next Tuesday.
  */
  it("reschedules a confirmed ride and refuses one already on the way", () => {
    expect(canReschedule(...ride("confirmed"))).toBe(true);
    expect(canReschedule(...ride("in_progress"))).toBe(false);
  });

  it("still cuts an ordinary booking off at the animal arriving", () => {
    expect(hasStarted(...at("confirmed"))).toBe(false);
    expect(hasStarted(...at("arrived"))).toBe(true);
  });

  /* The shop's words, and the one place a label leaves its stored value. */
  it("calls the last two rungs On the Way and Arrived", () => {
    expect(bookingStatusLabel("in_progress", { tripLeg: "pickup" })).toBe("On the Way");
    expect(bookingStatusLabel("completed", { tripLeg: "pickup" })).toBe("Arrived");
    expect(bookingStatusLabel("confirmed", { tripLeg: "pickup" })).toBe("Confirmed");
  });

  it("leaves an ordinary booking's words alone", () => {
    expect(bookingStatusLabel("in_progress")).toBe("In Progress");
    expect(bookingStatusLabel("completed")).toBe("Completed");
  });

  it("says what pressing the row does, in a driver's words", () => {
    expect(bookingStatusAction("in_progress", { tripLeg: "pickup" })).toBe("Start the trip");
    expect(bookingStatusAction("completed", { tripLeg: "pickup" })).toBe("Mark arrived");
    expect(bookingStatusAction("in_progress")).toBe("Start work");
  });
});
