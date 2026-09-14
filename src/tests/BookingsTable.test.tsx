import { render, screen } from "@testing-library/react";

import { BookingsTable } from "@/features/booking/components/BookingsTable";
import type { Booking } from "@/types/api";

/**
 * ONE ROW PER BOOKING — and a booking is one animal and one main service.
 *
 * ─── WHAT THIS GUARDS ────────────────────────────────────────────────────────
 *
 * The list used to split a visit into one row per animal under merged cells.
 * A customer who brings two dogs now has two bookings, so the list is two plain
 * rows tied by `groupId`, and nothing on the row counts animals.
 *
 * THE MONEY ASSERTION STAYS THE POINT. A total that summed only the service
 * would read cheaper than the bill the customer gets; the add-on is in the
 * fixture so that omission fails here rather than at a counter.
 */

const booking = (over: Partial<Booking> = {}): Booking =>
  ({
    _id: "b1",
    groupId: "66e5a1b2c3d4e5f6a7b8c9d0",
    bookingNumber: "BK-260906-002",
    customerName: "Salwa",
    petId: "pet-cici",
    petName: "Cici",
    status: "requested",
    scheduledAt: "2026-09-06T01:00:00.000Z",
    origin: "booking",
    posTransactionId: null,
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    billingState: "unbilled",
    service: {
      serviceId: "svc-groom",
      name: "Full Grooming",
      serviceType: "Grooming",
      price: "150000",
      durationMin: null,
      status: "pending",
      statusHistory: [],
      startedAt: null,
      finishedAt: null,
      sessions: [],
      addons: [
        {
          itemId: "add-1",
          serviceId: "svc-parfum",
          name: "Parfum",
          price: "20000",
          durationMin: null,
        },
      ],
    },
    ...over,
  }) as Booking;

test("draws one plain row per booking, with the add-on in its total", () => {
  const { container } = render(
    <BookingsTable
      bookings={[
        booking(),
        booking({
          _id: "b2",
          bookingNumber: "BK-260906-003",
          petId: "pet-cilang",
          petName: "Cilang",
          status: "arrived",
          service: { ...booking().service, price: "110000", addons: [] },
        }),
      ]}
    />,
  );

  expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  /* Nothing merged: two bookings of one customer are two whole rows. */
  expect(container.querySelectorAll("td[rowspan]")).toHaveLength(0);

  expect(screen.getByText("Cici")).toBeInTheDocument();
  expect(screen.getByText("Cilang")).toBeInTheDocument();
  expect(screen.getByText("Rp 170.000")).toBeInTheDocument(); // 150k + parfum 20k
  expect(screen.getByText("Rp 110.000")).toBeInTheDocument();

  /* No "2 hewan" anywhere — a booking holds one. */
  expect(screen.queryByText(/\d+\s*hewan/i)).not.toBeInTheDocument();
});

test("opens the booking itself, never an animal page under it", () => {
  const { container } = render(<BookingsTable bookings={[booking()]} />);

  expect(
    screen.getByRole("link", { name: /buka BK-260906-002/i }),
  ).toHaveAttribute("href", "/dashboard/booking/b1");
  expect(container.querySelector('a[href*="/hewan/"]')).toBeNull();
});

test("says what the badge cannot, off the booking's own claim", () => {
  render(
    <BookingsTable
      bookings={[
        booking({
          status: "confirmed",
          pulledToCartAt: "2026-09-06T02:00:00.000Z",
          posTransactionId: "sale-1",
          billingState: "billed",
        }),
      ]}
    />,
  );

  expect(
    screen.getByText(/sudah dibayar — belum dikerjakan/i),
  ).toBeInTheDocument();
});
