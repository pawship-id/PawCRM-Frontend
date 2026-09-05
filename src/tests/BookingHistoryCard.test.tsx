import { render, screen, within } from "@testing-library/react";

import { BookingHistoryCard } from "@/features/booking/components/BookingHistoryCard";
import type { Booking, BookingStatusEvent } from "@/types/api";

const event = (over: Partial<BookingStatusEvent> = {}): BookingStatusEvent => ({
  status: "confirmed",
  at: "2026-09-03T04:52:00.000Z",
  by: "user-1",
  byName: "Fitria",
  byRoleName: "Ops",
  implied: false,
  ...over,
});

const booking = (over: Partial<Booking> = {}): Booking =>
  ({
    _id: "bk-1",
    createdAt: "2026-09-03T04:52:00.000Z",
    createdByName: "Fitria",
    createdByRoleName: "Ops",
    statusHistory: [event()],
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

/**
 * THE TRAIL, ON THE CARD THAT SITS OPEN BESIDE THE WORK.
 *
 * WHAT THESE PIN: that a reader sees a status in words rather than the API's own
 * value, that the person is named WITH the hat they were wearing, and that the
 * trail starts at the beginning rather than at the first status move.
 */
describe("BookingHistoryCard", () => {
  it("names the status, rather than printing the API's value", () => {
    /*
      "in_progress" IS A STORED VALUE and a shop reads "In Progress". The status
      NAMES are English by decision (ui-rules §12, the one sanctioned exception)
      — but a raw enum with an underscore in it is not a name in any language.
    */
    render(<BookingHistoryCard booking={booking({ statusHistory: [event({ status: "in_progress" })] })} />);

    expect(screen.getByText(/In Progress/)).toBeInTheDocument();
    expect(screen.queryByText(/in_progress/)).not.toBeInTheDocument();
  });

  it("says who moved it and which hat they were wearing", () => {
    /*
      A TRAIL IS READ BY SOMEBODY WHO WAS NOT THERE. "Fitria" alone assumes the
      reader knows who Fitria is; the role answers whether the person who moved
      this was at the counter or at the table.
    */
    render(<BookingHistoryCard booking={booking()} />);

    expect(screen.getAllByText(/Fitria \(ops\)/).length).toBeGreaterThan(0);
  });

  it("shows the name alone when there is genuinely no role", () => {
    /*
      THE SUPER-ADMIN CASE. An owner reaches every permission by bypass rather
      than an assigned role, so inventing "(admin)" would be a guess about how
      they got in.
    */
    render(
      <BookingHistoryCard
        booking={booking({
          statusHistory: [event({ byName: "Jess", byRoleName: null })],
          createdByName: "Jess",
          createdByRoleName: null,
        })}
      />,
    );

    expect(screen.getAllByText(/Jess/)[0]).toBeInTheDocument();
    expect(screen.queryByText(/Jess \(/)).not.toBeInTheDocument();
  });

  it("says 'Sistem' when nothing human moved it", () => {
    // A booking settled by a paid sale moves without anybody choosing to; a
    // blank there reads as a field that failed to load.
    render(
      <BookingHistoryCard
        booking={booking({
          statusHistory: [event({ by: null, byName: null, byRoleName: null })],
        })}
      />,
    );

    expect(screen.getAllByText(/Sistem/)[0]).toBeInTheDocument();
  });

  it("begins the trail at 'Booking dibuat'", () => {
    /*
      WITHOUT IT the trail starts at "Confirmed" and reads as though the
      booking sprang into existence already confirmed. It comes from
      `createdAt`, which is recorded data — not an invention.
    */
    render(<BookingHistoryCard booking={booking()} />);

    const entries = screen.getAllByRole("listitem");
    expect(entries).toHaveLength(2);
    expect(entries[entries.length - 1]).toHaveTextContent("Booking dibuat");
  });

  it("puts the newest first — this card is glanced at, not read as a story", () => {
    render(
      <BookingHistoryCard
        booking={booking({
          statusHistory: [
            event({ status: "confirmed", at: "2026-09-03T01:00:00.000Z" }),
            event({ status: "in_progress", at: "2026-09-03T02:00:00.000Z" }),
          ],
        })}
      />,
    );

    const entries = screen.getAllByRole("listitem");
    expect(entries[0]).toHaveTextContent("In Progress");
    expect(entries[1]).toHaveTextContent("Confirmed");
  });

  it("marks a rung that was filled in behind a skipped step", () => {
    /*
      Two entries stamped at the same second would otherwise claim two separate
      decisions were taken at once. This says which one somebody actually made.
    */
    render(
      <BookingHistoryCard
        booking={booking({
          statusHistory: [
            event({ status: "confirmed", implied: true }),
            event({ status: "arrived", implied: false }),
          ],
        })}
      />,
    );

    const entries = screen.getAllByRole("listitem");
    const confirmed = entries.find((entry) =>
      entry.textContent?.includes("Confirmed"),
    );

    expect(within(confirmed as HTMLElement).getByText(/otomatis/)).toBeInTheDocument();
    expect(entries[0]).not.toHaveTextContent("otomatis");
  });

  it("counts what it shows, including the creation line", () => {
    render(
      <BookingHistoryCard
        booking={booking({
          statusHistory: [event({ status: "confirmed" }), event({ status: "arrived" })],
        })}
      />,
    );

    expect(screen.getByText("3 aktivitas")).toBeInTheDocument();
  });

  it("leaves a gap between entries, and none after the last", () => {
    /*
      ─── THE BUG THIS PINS ───────────────────────────────────────────────────

      The gap was written `pb-4 last:pb-0` on the content div. That div is the
      only sibling of the timeline rail, so it is ALWAYS its `<li>`'s last child
      — `last:pb-0` matched on every entry and every gap collapsed to zero. The
      trail rendered correctly in every other respect, which is why nothing else
      caught it: it was legible, just unreadably tight.

      Asserting a class is a blunt instrument and it is the right one here. There
      is no layout in jsdom, so spacing has no other observable; the alternative
      is a rule that only a person looking at the screen can check, which is what
      let this through the first time.
    */
    render(
      <BookingHistoryCard
        booking={booking({
          statusHistory: [
            event({ status: "confirmed" }),
            event({ status: "arrived" }),
          ],
        })}
      />,
    );

    const bodies = screen
      .getAllByRole("listitem")
      .map((entry) => entry.lastElementChild as HTMLElement);

    for (const body of bodies.slice(0, -1)) {
      expect(body.className).toMatch(/\bpb-\d/);
    }
    // The final entry sits on the card's own padding; a gap under it is a hole.
    expect(bodies[bodies.length - 1].className).not.toMatch(/\bpb-\d/);
  });

  it("still has one honest line when the trail predates the feature", () => {
    // Bookings made before the trail existed carry an empty one. The card is
    // not blank: the booking was still created, by somebody, at some point.
    render(<BookingHistoryCard booking={booking({ statusHistory: [] })} />);

    expect(screen.getByText("Booking dibuat")).toBeInTheDocument();
    expect(screen.getByText("1 aktivitas")).toBeInTheDocument();
  });
});
