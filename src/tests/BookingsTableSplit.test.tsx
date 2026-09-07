import { render, screen } from "@testing-library/react";

import { BookingsTable } from "@/features/booking/components/BookingsTable";
import type { Booking, BookingPet } from "@/types/api";

/**
 * ONE ROW PER ANIMAL, WITH THE VISIT'S OWN CELLS MERGED.
 *
 * ─── WHAT THIS GUARDS ────────────────────────────────────────────────────────
 *
 * A booking is one arrival and several animals, and the two halves of a row
 * answer to different things. Before the split the day sheet showed
 * "Cici, Cilang" in one cell, ONE total covering both, and a stack of badges
 * beside them — three columns the reader had to line up by eye, on exactly the
 * bookings that need reading most carefully.
 *
 * THE MONEY ASSERTION IS THE POINT OF THE FILE. A per-animal total that summed
 * only `services` would read cheaper than the bill the customer gets; the
 * add-on is in the fixture so that omission fails here rather than at a counter.
 * The server's `summarise` has already been caught making it once.
 */

const pet = (over: Partial<BookingPet>): BookingPet =>
  ({
    petItemId: over.petItemId ?? "p1",
    petId: over.petId ?? "pet1",
    petName: over.petName ?? "Cici",
    status: over.status ?? "requested",
    statusHistory: [],
    nextStatuses: [],
    cancelReason: null,
    internalNotes: null,
    customerNotes: null,
    notes: null,
    belongings: [],
    /* The animal's own album — a different array from its turns' evidence. */
    media: [],
    pulledToCartAt: over.pulledToCartAt ?? null,
    pulledToInvoiceAt: over.pulledToInvoiceAt ?? null,
    services: over.services ?? [],
  }) as BookingPet;

const svc = (price: string, addons: string[] = []) =>
  ({
    itemId: Math.random().toString(),
    serviceId: "s",
    name: "Full Grooming",
    serviceType: null,
    price,
    durationMin: null,
    status: "pending",
    statusHistory: [],
    startedAt: null,
    finishedAt: null,
    sessions: [],
    addons: addons.map((p) => ({
      itemId: Math.random().toString(),
      serviceId: "a",
      name: "Parfum",
      price: p,
      durationMin: null,
    })),
  }) as never;

const booking = {
  _id: "b1",
  bookingNumber: "BK-260906-002",
  customerName: "Salwa",
  scheduledAt: "2026-09-06T01:00:00.000Z",
  origin: "booking",
  posTransactionId: null,
  billingState: "unbilled",
  items: [],
  petCount: 2,
  pets: [
    pet({
      petItemId: "pi1",
      petId: "a",
      petName: "Cici",
      services: [svc("150000", ["20000"])],
    }),
    pet({
      petItemId: "pi2",
      petId: "b",
      petName: "Cilang",
      status: "arrived",
      services: [svc("110000")],
    }),
  ],
} as unknown as Booking;

test("splits per animal and merges the visit's cells", () => {
  const { container } = render(<BookingsTable bookings={[booking]} />);

  const rows = container.querySelectorAll("tbody tr");
  expect(rows).toHaveLength(2);

  // Visit cells written once, stretched down.
  const spanned = container.querySelectorAll('tbody td[rowspan="2"]');
  expect(spanned).toHaveLength(4); // nomor, jadwal, pelanggan, aksi

  // Per-animal cells.
  expect(screen.getByText("Cici")).toBeInTheDocument();
  expect(screen.getByText("Cilang")).toBeInTheDocument();
  expect(screen.getByText("Rp 170.000")).toBeInTheDocument(); // 150k + parfum 20k
  expect(screen.getByText("Rp 110.000")).toBeInTheDocument();

  // The visit's own facts appear once, not twice.
  expect(screen.getAllByText("Salwa")).toHaveLength(1);
  expect(screen.getAllByText("BK-260906-002")).toHaveLength(1);
});

/**
 * ─── HOVER HAS TO REACH THE WHOLE VISIT ─────────────────────────────────────
 *
 * `TableRow` carries `hover:bg-muted/50`, and a hover on a `<tr>` reaches that
 * row and nothing else — so a visit split across two rows lit up half of itself,
 * which reads as two unrelated bookings that happen to share a customer.
 *
 * CSS cannot reach a sibling row, so each visit gets its own `<tbody>` — a
 * `<table>` may hold any number of them — and the hover rule hangs off that.
 * Asserted on the STRUCTURE rather than on a colour, because jsdom computes no
 * styles: what can be proved here is that the grouping the selector depends on
 * actually exists.
 */
test("groups each visit in its own tbody so hover reaches every animal", () => {
  const second = {
    ...booking,
    _id: "b2",
    bookingNumber: "BK-260906-003",
    pets: [pet({ petItemId: "pi3", petId: "c", petName: "Momo" })],
  } as unknown as Booking;

  const { container } = render(<BookingsTable bookings={[booking, second]} />);

  const bodies = container.querySelectorAll("tbody");
  expect(bodies).toHaveLength(2);

  /* Two animals in the first visit, one in the second — and each visit's rows
     sit together, which is the whole point of the grouping. */
  expect(bodies[0].querySelectorAll("tr")).toHaveLength(2);
  expect(bodies[1].querySelectorAll("tr")).toHaveLength(1);

  /*
    THE TWO RULES THE HIGHLIGHT DEPENDS ON, pinned by name: a refactor that drops
    either silently restores the half-lit visit this file exists to prevent.

    THE SECOND IS THE ONE THAT IS EASY TO MISS. `TableRow` lights a row while a
    menu inside it is open, and the kebab sits in the FIRST row's spanning cell —
    so without this the open menu lit one animal and left the rest of its visit
    dark, which is the moment it matters most to see which booking is about to be
    acted on.
  */
  expect(bodies[0].className).toContain("[&:hover>tr]:bg-muted/50");
  expect(bodies[0].className).toContain("has-aria-expanded:[&>tr]:bg-muted/50");

  /*
    ⚠️ AND THE SEPARATOR SITS ON THE BODY, NOT ON THE ROW.

    `TableBody` carries `[&_tr:last-child]:border-0`, which was right for one
    body holding the whole list and wrong for one per visit — every booking's
    last row loses its border. Re-adding it on the row collides with that rule at
    equal specificity, so the line is a TOP border on the body instead: a
    different element and a different property, with nothing to collide with.
  */
  expect(bodies[0].className).toContain("[&:not(:first-of-type)]:border-t");
});
