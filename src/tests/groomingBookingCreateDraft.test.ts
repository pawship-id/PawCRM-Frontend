import {
  BLANK_PRICE,
  allocate,
  blankPetDraft,
  digitsOnly,
  priceLine,
  resolveDiscount,
  splitBookingDiscount,
  toEntry,
} from "@/features/grooming/bookingCreateDraft";
import { toDecimalString, toMinor } from "@/utils/decimal";

const rp = (value: string) => toMinor(value)!;
const asString = (minor: bigint) => toDecimalString(minor);

describe("digitsOnly", () => {
  it("drops the thousands dots and a leading zero", () => {
    expect(digitsOnly("150.000")).toBe("150000");
    expect(digitsOnly("007")).toBe("7");
    expect(digitsOnly("")).toBe("");
  });
});

describe("resolveDiscount — the till's rule", () => {
  it("takes a percent half-up, never past 100", () => {
    expect(asString(resolveDiscount(rp("150000"), "percent", "10"))).toBe("15000.0000");
    expect(asString(resolveDiscount(rp("150000"), "percent", "150"))).toBe("150000.0000");
  });

  it("clamps a nominal to what it is taken from", () => {
    expect(asString(resolveDiscount(rp("40000"), "amount", "50000"))).toBe("40000.0000");
  });

  it("takes nothing for an empty or zero discount", () => {
    expect(resolveDiscount(rp("40000"), "amount", "")).toBe(0n);
    expect(resolveDiscount(rp("40000"), "percent", "0")).toBe(0n);
  });
});

describe("priceLine", () => {
  it("follows the catalogue when nothing is typed, and needs no grant", () => {
    const line = priceLine("150000.0000", BLANK_PRICE);

    expect(asString(line.net)).toBe("150000.0000");
    expect(line.typed).toBe(false);
  });

  it("bills a typed price, measuring the discount against it", () => {
    const line = priceLine("150000.0000", {
      price: "120000",
      discountMode: "percent",
      discountValue: "10",
    });

    expect(asString(line.price!)).toBe("120000.0000");
    expect(asString(line.discount)).toBe("12000.0000");
    expect(asString(line.net)).toBe("108000.0000");
    expect(line.typed).toBe(true);
  });

  it("does not count a typed price equal to the quote as typed", () => {
    expect(priceLine("150000.0000", { ...BLANK_PRICE, price: "150000" }).typed).toBe(false);
  });

  it("answers no price when the catalogue cannot say and nothing is typed", () => {
    expect(priceLine(null, BLANK_PRICE).price).toBeNull();
  });
});

describe("allocate and splitBookingDiscount — tax.allocate / allocateEvenly on the server", () => {
  it("splits by weight and adds up exactly", () => {
    const parts = allocate(10n, [1n, 1n, 1n]);

    expect(parts.reduce((sum, part) => sum + part, 0n)).toBe(10n);
    expect(parts).toEqual([4n, 3n, 3n]);
  });

  it("splits the save's discount evenly across the bookings", () => {
    const { total, shares } = splitBookingDiscount(
      [rp("150000"), rp("35000")],
      "amount",
      "18500",
    );

    expect(asString(total)).toBe("18500.0000");
    expect(shares.map(asString)).toEqual(["9250.0000", "9250.0000"]);
  });

  it("caps a booking at what it comes to and gives the rest to the others", () => {
    const { shares } = splitBookingDiscount(
      [rp("150000"), rp("5000")],
      "amount",
      "20000",
    );

    expect(shares.map(asString)).toEqual(["15000.0000", "5000.0000"]);
  });
});

describe("toEntry", () => {
  const drafted = () => ({
    ...blankPetDraft("pet-1"),
    serviceId: "svc-1",
    addonServiceIds: ["addon-1", "addon-2"],
  });

  it("sends no price or discount for an untouched card", () => {
    const entry = toEntry(drafted());

    expect(entry).toMatchObject({
      petId: "pet-1",
      serviceId: "svc-1",
      groomerUserId: null,
      price: null,
      discount: null,
    });
    expect(entry).not.toHaveProperty("addonPricing");
  });

  it("sends what was typed — never a resolved amount — and only for touched add-ons", () => {
    const entry = toEntry({
      ...drafted(),
      main: { price: "120000", discountMode: "percent", discountValue: "10" },
      addons: {
        "addon-2": { price: "", discountMode: "amount", discountValue: "5000" },
      },
    });

    expect(entry.price).toBe("120000");
    expect(entry.discount).toEqual({ mode: "percent", value: "10" });
    expect(entry.addonPricing).toEqual([
      { serviceId: "addon-2", price: null, discount: { mode: "amount", value: "5000" } },
    ]);
  });
});
