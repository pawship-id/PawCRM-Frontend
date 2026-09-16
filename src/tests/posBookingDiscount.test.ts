import { bookingShareOf, ownDiscountOf } from "@/features/pos/bookingDiscount";
import type { PosDiscount } from "@/types/api";

const discount = (over: Partial<PosDiscount> = {}): PosDiscount => ({
  mode: "amount",
  value: "7170.0000",
  resolvedAmount: "7170.0000",
  approvedBy: null,
  ...over,
});

/**
 * A basket line's discount, split the way the till shows it: the line's own on
 * the line, the booking's share of "Diskon seluruh booking" under the booking.
 * The own part is also what the till sends back — the server adds the share.
 */
describe("bookingShareOf", () => {
  it("answers the share, or null when there is none", () => {
    expect(bookingShareOf({ bookingDiscount: "6793.0000" })).toBe("6793.0000");
    expect(bookingShareOf({ bookingDiscount: "0.0000" })).toBeNull();
    expect(bookingShareOf({ bookingDiscount: null })).toBeNull();
    expect(bookingShareOf({})).toBeNull();
  });
});

describe("ownDiscountOf", () => {
  it("is the stored discount, mode and all, when the booking brought no share", () => {
    const typed = discount({ mode: "percent", value: "10", resolvedAmount: "12000.0000" });

    expect(ownDiscountOf({ discount: typed, bookingDiscount: null })).toBe(typed);
  });

  it("takes the share out, as whole rupiah the popover can edit", () => {
    expect(
      ownDiscountOf({ discount: discount(), bookingDiscount: "2170.0000" }),
    ).toEqual({
      mode: "amount",
      value: "5000",
      resolvedAmount: "5000.0000",
      approvedBy: null,
    });
  });

  it("is none when the whole discount is the booking's share", () => {
    expect(
      ownDiscountOf({ discount: discount(), bookingDiscount: "7170.0000" }),
    ).toBeNull();
  });
});
