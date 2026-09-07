import {
  BOOKING_STATUS_ACTIONS,
  canCancel,
  canReschedule,
  forwardStatuses,
  hasCompletedWork,
  impliedStatuses,
  ladderFor,
  transitionsFor,
} from "@/features/booking/statusFlow";
import type { BookingLike } from "@/features/booking/statusFlow";
import type { BookingStatus } from "@/types/api";

const at = (status: BookingStatus, trip: Partial<BookingLike> = {}): BookingLike =>
  ({ status, pickupRequested: false, deliveryRequested: false, ...trip }) as BookingLike;

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
    expect(ladderFor(at("confirmed"))).not.toContain("pickup");
    expect(ladderFor(at("confirmed"))).not.toContain("delivery");
  });

  it("puts pickup before arrival and delivery before going home", () => {
    // A van fetches the animal BEFORE it is here, and takes it home before it
    // is with its owner. Either the other way round describes nothing.
    const ladder = ladderFor(
      at("confirmed", { pickupRequested: true, deliveryRequested: true }),
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
    expect(forwardStatuses(at("confirmed"))).not.toContain("pickup");
    expect(
      forwardStatuses(at("confirmed", { pickupRequested: true })),
    ).toContain("pickup");
  });

  it("backfills only the rungs THIS booking passes through", () => {
    // Implied rungs are what the trail records; inventing `pickup` behind a
    // move would put a van journey in it that never left the shop.
    expect(impliedStatuses(at("confirmed"), "in_progress")).toEqual(["arrived"]);
    expect(
      impliedStatuses(at("confirmed", { pickupRequested: true }), "in_progress"),
    ).toEqual(["pickup", "arrived"]);
  });

  it("keeps a draft from jumping past the animal arriving", () => {
    /*
      A DRAFT IS NOT A COMMITMENT — a line in a basket somebody may yet empty.
      Landing one on `completed` would mint a finished, commissioned visit out of
      something nobody ever agreed to.
    */
    expect(forwardStatuses(at("draft"))).toEqual([
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
    expect(forwardStatuses(at("completed"))).toEqual(["return_to_pawrents"]);
    expect(transitionsFor(at("return_to_pawrents"))).toEqual([]);
  });

  it("stops offering cancellation once the work is done", () => {
    // Undoing that is correcting money rather than a schedule.
    expect(canCancel(at("in_progress"))).toBe(true);
    expect(canCancel(at("completed"))).toBe(false);
  });

  it("closes the money guard at completed, not at the end of the visit", () => {
    /*
      THE DISTINCTION THE WIDER LADDER CREATED. Commission is computed at
      `completed` and the money is usually taken; a guard left on "is it over"
      would let somebody re-price or re-crew a finished groom for as long as the
      van was on its way home.
    */
    expect(hasCompletedWork(at("in_progress"))).toBe(false);
    expect(hasCompletedWork(at("completed"))).toBe(true);
    expect(
      hasCompletedWork(at("delivery", { deliveryRequested: true })),
    ).toBe(true);
  });

  it("lets an appointment be moved only before the animal is here", () => {
    // Moving the date of a visit that is happening describes nothing — that is
    // a new booking.
    expect(canReschedule(at("requested"))).toBe(true);
    expect(canReschedule(at("confirmed"))).toBe(true);
    expect(canReschedule(at("arrived"))).toBe(false);
    expect(canReschedule(at("in_progress"))).toBe(false);
  });

  it("refuses to reschedule a draft — its date is edited on the form", () => {
    // Landing it on `confirmed` through a button labelled "reschedule" would
    // confirm an appointment nobody agreed to.
    expect(canReschedule(at("draft"))).toBe(false);
  });

  it("moves nowhere from `rescheduled`, which nothing is ever in", () => {
    // A trail entry, not a place to stand. A booking found in it is corrupt,
    // and offering it moves would paper over that.
    expect(transitionsFor(at("rescheduled"))).toEqual([]);
  });

  it("names every status as an act, not as an adjective", () => {
    // A menu row is something somebody DOES. Every status needs one, including
    // the two that never appear in the menu, because the map is exhaustive.
    Object.values(BOOKING_STATUS_ACTIONS).forEach((label) => {
      expect(label.length).toBeGreaterThan(0);
    });
  });
});
