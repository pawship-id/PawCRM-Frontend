import {
  arahCardOf,
  asSlot,
  choicesForLeg,
  legsOf,
  otherLeg,
  rideOf,
  routeOf,
  slotAtOrAfter,
  slotAtOrBefore,
  TIME_SLOTS,
} from "@/features/antar-jemput/ride";
import type { VariantOption } from "@/types/api";

import { makeVariantOption } from "./helpers/variantOptions";

/**
 * A ride's direction, ends and clock — Antar-Jemput, 21 September 2026. Pure,
 * so pinned here without a DOM.
 */

const ARAH: VariantOption = makeVariantOption({
  _id: "vo-arah",
  name: "Arah",
  source: "staff",
  axisKey: "vo-arah",
  values: [
    { code: "jemput", label: "Jemput", sortOrder: 0, isActive: true },
    { code: "antar", label: "Antar", sortOrder: 1, isActive: true },
  ],
});

const LOKASI: VariantOption = makeVariantOption({
  _id: "vo-lokasi",
  name: "Lokasi",
  source: "staff",
  axisKey: "vo-lokasi",
  values: [
    { code: "rumah", label: "Di Rumah", sortOrder: 0, isActive: true },
    { code: "toko", label: "Di Toko", sortOrder: 1, isActive: true },
  ],
});

const ride = { hasVariants: true, variantAxes: ["zone", "vo-arah"] };

describe("the half-hour clock (BO's note 8)", () => {
  it("offers forty-eight slots, every half hour, from midnight", () => {
    expect(TIME_SLOTS).toHaveLength(48);
    expect(TIME_SLOTS[0]).toBe("00:00");
    expect(TIME_SLOTS[19]).toBe("09:30");
    expect(TIME_SLOTS[47]).toBe("23:30");
  });

  it("rounds a moment up for the next ride and down for a van that leaves before", () => {
    expect(slotAtOrAfter(new Date(2026, 8, 22, 9, 10))).toBe("09:30");
    expect(slotAtOrAfter(new Date(2026, 8, 22, 9, 30))).toBe("09:30");
    expect(slotAtOrAfter(new Date(2026, 8, 22, 23, 50))).toBe("23:30");
    expect(slotAtOrBefore(new Date(2026, 8, 22, 9, 10))).toBe("09:00");
    expect(slotAtOrBefore(new Date(2026, 8, 22, 9, 59))).toBe("09:30");
  });

  it("reads a stored time off the half hour as the slot it falls in", () => {
    expect(asSlot("14:30")).toBe("14:30");
    expect(asSlot("14:47")).toBe("14:30");
    expect(asSlot("")).toBe("");
  });
});

describe("directions", () => {
  it("makes two rides of Pulang-pergi, the pickup first", () => {
    expect(legsOf("both")).toEqual(["pickup", "delivery"]);
    expect(legsOf("delivery")).toEqual(["delivery"]);
    expect(otherLeg("pickup")).toBe("delivery");
  });

  it("drives a pickup from the door to the branch, and a delivery back", () => {
    expect(routeOf("pickup", "Jl. Mawar 12", "Cabang Barat")).toEqual({
      from: "Jl. Mawar 12",
      to: "Cabang Barat",
    });
    expect(routeOf("delivery", "Jl. Mawar 12", "Cabang Barat")).toEqual({
      from: "Cabang Barat",
      to: "Jl. Mawar 12",
    });
  });
});

describe("the Arah option (BO's note 7)", () => {
  it("finds the service's card with a value for each direction", () => {
    const found = arahCardOf(ride, [LOKASI, ARAH]);

    expect(found?.card._id).toBe("vo-arah");
    expect(found?.codes).toEqual({ pickup: "jemput", delivery: "antar" });
  });

  it("finds nothing on a service that is not priced by one", () => {
    expect(arahCardOf({ hasVariants: true, variantAxes: ["zone"] }, [ARAH])).toBeNull();
    expect(arahCardOf({ hasVariants: false, variantAxes: [] }, [ARAH])).toBeNull();
  });

  it("does not read a value that says both directions as either", () => {
    const both = makeVariantOption({
      ...ARAH,
      values: [
        { code: "aj", label: "Antar-Jemput", sortOrder: 0, isActive: true },
        { code: "jemput", label: "Jemput", sortOrder: 1, isActive: true },
      ],
    });

    expect(arahCardOf(ride, [both])).toBeNull();
  });

  it("answers the card from the direction, keeping the staff's other choices", () => {
    const service = { hasVariants: true, variantAxes: ["vo-arah", "vo-lokasi"] };

    expect(
      choicesForLeg(service, [ARAH, LOKASI], "delivery", [
        { optionId: "vo-lokasi", code: "rumah" },
        { optionId: "vo-arah", code: "jemput" },
      ]),
    ).toEqual([
      { optionId: "vo-lokasi", code: "rumah" },
      { optionId: "vo-arah", code: "antar" },
    ]);
  });
});

describe("rideOf", () => {
  it("counts the booking's own animal and its passengers, names first", () => {
    expect(
      rideOf({
        tripLeg: "pickup",
        tripAddress: null,
        petName: "Bella",
        passengers: [{ _id: "p2", name: "Milo" }],
      }),
    ).toEqual({ leg: "pickup", address: null, animals: 2, names: ["Bella", "Milo"] });
  });
});
