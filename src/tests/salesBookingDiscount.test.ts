import {
  afterOwnDiscounts,
  bookingShareOf,
  bookingShareOfLine,
  invoiceBookingShares,
  ownDiscountOfLine,
} from "@/features/sales/bookingDiscount";
import type { Booking, InvoiceBooking } from "@/types/api";

/**
 * Cici: Basic Grooming 120.000 with 5.000 of its own off, Extra Handling 20.000
 * with none — and 2.547 of "Diskon seluruh booking" spread across the two
 * (2.170 + 377). The server bills each line at `discountAmount`.
 */
const cici = () =>
  ({
    _id: "bk-3",
    service: {
      name: "Basic Grooming",
      price: "120000.0000",
      discount: { mode: "amount", value: "5000.0000", resolvedAmount: "5000.0000" },
      discountAmount: "7170.0000",
      addons: [
        {
          itemId: "ad-1",
          name: "Extra Handling",
          price: "20000.0000",
          discount: null,
          discountAmount: "377.0000",
        },
      ],
    },
  }) as unknown as Booking;

/* On a SAVED invoice: the share read off the booking view, capped at each line. */
describe("invoiceBookingShares", () => {
  const view = {
    _id: "bk-3",
    service: {
      serviceId: "svc-groom",
      name: "Basic Grooming",
      price: "120000.0000",
      bookingShare: "2170.0000",
      addons: [
        { serviceId: "svc-extra", name: "Extra Handling", price: "20000.0000", bookingShare: "377.0000" },
      ],
    },
  } as unknown as InvoiceBooking;

  const item = (refId: string, off: string | null, parentServiceId: string | null = null) => ({
    bookingId: "bk-3",
    refId,
    parentServiceId,
    discount: off ? { mode: "amount" as const, value: off, resolvedAmount: off } : null,
  });

  it("matches each booked line to its service or add-on", () => {
    expect(
      invoiceBookingShares(
        [item("svc-groom", "7170.0000"), item("svc-extra", "377.0000", "svc-groom")],
        [view],
      ),
    ).toBe("2547.0000");
  });

  it("caps a share at what the line still carries, and ignores unbooked lines", () => {
    expect(
      invoiceBookingShares(
        [
          item("svc-groom", "1000.0000"),
          item("svc-extra", null, "svc-groom"),
          { bookingId: null, refId: "prod-1", parentServiceId: null, discount: null },
        ],
        [view],
      ),
    ).toBe("1000.0000");
  });
});

describe("the invoice's split of a booking's discount", () => {
  it("reads each line's own discount, and the share as the rest", () => {
    const { service } = cici();

    expect(ownDiscountOfLine(service)).toBe("5000.0000");
    expect(bookingShareOfLine(service)).toBe("2170.0000");
    expect(ownDiscountOfLine(service.addons[0])).toBeNull();
    expect(bookingShareOfLine(service.addons[0])).toBe("377.0000");
  });

  it("totals the booking's share, and what it comes to before it", () => {
    expect(bookingShareOf(cici())).toBe("2547.0000");
    expect(afterOwnDiscounts(cici())).toBe("135000.0000");
  });

  it("is all zero for a booking written before discounts existed", () => {
    const plain = {
      service: { price: "150000.0000", addons: [] },
    } as unknown as Booking;

    expect(bookingShareOf(plain)).toBe("0.0000");
    expect(afterOwnDiscounts(plain)).toBe("150000.0000");
  });
});
