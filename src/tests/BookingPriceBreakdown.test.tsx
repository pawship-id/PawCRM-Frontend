import { render, screen } from "@testing-library/react";

import { BookingPriceBreakdown } from "@/features/booking/components/BookingPriceBreakdown";
import type { Booking } from "@/types/api";

/*
  THE BILL'S DISCOUNTS ON THE BOOKING PAGE (20 November 2026, on request) — a
  membership benefit and a promo are priced when a booking is billed, so the
  booking's own lines never carried them. The page reads them off the faktur or
  the till's sale (`billedDiscounts`) and the Total follows the bill.
*/
const SERVICE_ID = "svc-grooming";
const ADDON_ID = "svc-parfum";

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    _id: "bk-1",
    totalAmount: "120000.0000",
    netAmount: "120000.0000",
    discountAmount: null,
    homeTrip: null,
    service: {
      serviceId: SERVICE_ID,
      name: "Basic Grooming",
      serviceType: "Grooming",
      price: "100000.0000",
      discount: null,
      discountAmount: null,
      durationMin: 60,
      addons: [
        {
          itemId: "item-1",
          serviceId: ADDON_ID,
          name: "Parfum",
          price: "20000.0000",
          discount: null,
          discountAmount: null,
          durationMin: 5,
        },
      ],
    },
    ...overrides,
  } as unknown as Booking;
}

describe("BookingPriceBreakdown — potongan dari tagihan", () => {
  it("shows membership and promo the faktur took off, and totals what it charged", () => {
    render(
      <BookingPriceBreakdown
        booking={booking({
          billedDiscounts: {
            via: "invoice",
            documentNumber: "INV-0001",
            lines: [
              {
                refId: SERVICE_ID,
                parentServiceId: null,
                discountAmount: "20000.0000",
                membershipDiscount: "20000.0000",
                benefitLabel: "Diskon member 20%",
                promoDiscount: null,
                promos: [],
              },
              {
                refId: ADDON_ID,
                parentServiceId: SERVICE_ID,
                discountAmount: "5000.0000",
                membershipDiscount: null,
                benefitLabel: null,
                promoDiscount: "5000.0000",
                promos: [{ name: "Flash Sale", label: null }],
              },
            ],
          },
        })}
      />,
    );

    expect(screen.getByText("Diskon membership")).toBeInTheDocument();
    expect(screen.getByText("Diskon member 20%")).toBeInTheDocument();
    expect(screen.getByText("Potongan promo")).toBeInTheDocument();
    expect(screen.getByText("Flash Sale")).toBeInTheDocument();
    expect(screen.getByText("Rp 95.000")).toBeInTheDocument();
    expect(screen.getByText("Potongan sesuai faktur INV-0001")).toBeInTheDocument();
  });

  it("names a discount typed at the till on top of the booking's", () => {
    render(
      <BookingPriceBreakdown
        booking={booking({
          billedDiscounts: {
            via: "pos",
            documentNumber: "POS-0001",
            lines: [
              {
                refId: SERVICE_ID,
                parentServiceId: null,
                discountAmount: "10000.0000",
                membershipDiscount: null,
                benefitLabel: null,
                promoDiscount: null,
                promos: [],
              },
            ],
          },
        })}
      />,
    );

    expect(screen.getByText("Diskon lain di kasir")).toBeInTheDocument();
    expect(screen.getByText("Rp 110.000")).toBeInTheDocument();
  });

  it("draws nothing extra before the booking is billed", () => {
    render(<BookingPriceBreakdown booking={booking({ billedDiscounts: null })} />);

    expect(screen.queryByText("Diskon membership")).not.toBeInTheDocument();
    expect(screen.queryByText(/Potongan sesuai/)).not.toBeInTheDocument();
    expect(screen.getByText("Rp 120.000")).toBeInTheDocument();
  });
});
