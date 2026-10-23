import cases from "./fixtures/offlinePricingParity.json";

import {
  priceCart,
  resolveServicePrice,
  type LocalCart,
} from "@/features/pos/offline/pricing";
import type { OfflineSnapshot } from "@/features/pos/offline/store";

/**
 * POS OFFLINE MODE (19 October 2026) — the device prices a basket exactly as
 * the server would. The fixture is generated from the BACKEND's money rules and
 * the same file is asserted in PawCRM-Backend/src/tests/offlinePricingParity;
 * a disagreement here is a sale the sync would hold for review.
 */
function snapshotFor(fixture: (typeof cases)[number]): OfflineSnapshot {
  return {
    settings: {
      tax: { rate: fixture.rate, inclusive: fixture.inclusive },
    } as OfflineSnapshot["settings"],
    catalog: {
      items: fixture.lines.map((line, index) => ({
        kind: "product",
        _id: `p${index}`,
        name: `Produk ${index}`,
        code: `SKU${index}`,
        barcode: null,
        batchCode: null,
        image: null,
        price: line.price,
        categoryId: null,
        unit: null,
        productType: "single",
        variantCount: null,
      })),
      categories: [],
    } as unknown as OfflineSnapshot["catalog"],
    stock: { warehouseId: "w1", qty: {}, allowNegativeStock: true },
    customers: { customers: [], pets: [] },
    versions: {},
    fetchedAt: null,
    clockOffsetMs: 0,
  };
}

function cartFor(fixture: (typeof cases)[number]): LocalCart {
  return {
    _id: "local-test",
    branchId: "b1",
    warehouseId: "w1",
    shiftId: "s1",
    customerId: null,
    items: fixture.lines.map((line, index) => ({
      kind: "product",
      refId: `p${index}`,
      qty: line.qty,
      discount: line.discount as LocalCart["cartDiscount"],
    })),
    cartDiscount: fixture.cartDiscount as LocalCart["cartDiscount"],
    otherCharges: fixture.charges.map((amount, index) => ({ label: `Biaya ${index}`, amount })),
    note: null,
    status: "active",
    heldLabel: null,
    createdBy: "u1",
    createdAt: "2026-10-19T00:00:00.000Z",
    updatedAt: "2026-10-19T00:00:00.000Z",
    replacesCartId: null,
  };
}

describe.each(cases)("offline pricing parity — $name", (fixture) => {
  it("matches the server's figures to the last minor unit", () => {
    const priced = priceCart(cartFor(fixture), { snapshot: snapshotFor(fixture), maySetPrice: false });

    priced.items.forEach((item, index) => {
      expect(item.lineTotal).toBe(fixture.expected.lines[index].lineTotal);
      expect(item.discount?.resolvedAmount ?? null).toBe(fixture.expected.lines[index].discount);
    });
    expect(priced.runningTotals).toMatchObject({
      subtotal: fixture.expected.subtotal,
      itemDiscount: fixture.expected.itemDiscount,
      cartDiscount: fixture.expected.cartDiscount,
      otherCharges: fixture.expected.otherCharges,
      net: fixture.expected.net,
      tax: fixture.expected.tax,
      payable: fixture.expected.payable,
    });
  });
});

describe("offline pricing — what it refuses rather than guesses", () => {
  const fixture = cases[0];
  const snapshot = snapshotFor(fixture);
  const base = cartFor(fixture);

  it.each([
    ["a membership package", { kind: "membership", refId: "plan1" }],
    ["a pulled booking", { kind: "service", refId: "s1", bookingId: "b1" }],
    ["a home-visit fee", { kind: "service", refId: "s1", homeTripId: "t1" }],
    ["a hand-picked lot", { kind: "product", refId: "p0", lots: [{ batchId: "x", qty: "1" }] }],
    ["a membership benefit", { kind: "product", refId: "p0", benefit: { membershipId: "m", benefitId: "b" } }],
  ])("refuses %s with a sentence about the connection", (_label, line) => {
    expect(() =>
      priceCart({ ...base, items: [line as never] }, { snapshot, maySetPrice: true }),
    ).toThrow(/butuh koneksi internet/);
  });

  it("refuses a typed price without the set-price grant, and records one with it", () => {
    const typed = { ...base, items: [{ kind: "product" as const, refId: "p0", qty: "1", unitPrice: "30000" }] };
    expect(() => priceCart(typed, { snapshot, maySetPrice: false })).toThrow(/izin mengubah harga/);
    const priced = priceCart(typed, { snapshot, maySetPrice: true });
    expect(priced.items[0]).toMatchObject({ unitPrice: "30000.0000", listPrice: "37500.0000" });
  });
});

describe("resolveServicePrice — the variant a pet's facts pick", () => {
  const service = {
    hasVariants: true,
    variantAxes: ["petType", "sizeCategory", "opt1"],
    price: null,
    variants: [
      { petType: "dog", sizeCategory: "S", furType: null, choices: [{ optionId: "opt1", code: "LONG" }], price: "80000", durationMin: 60 },
      { petType: "dog", sizeCategory: "L", furType: null, choices: [{ optionId: "opt1", code: "LONG" }], price: "120000", durationMin: 90 },
    ],
  };
  const pet = { _id: "pet1", customerId: "c1", name: "Bruno", species: "dog", size: "L", furType: null };

  it("picks the variant matching the animal and the staff's choice", () => {
    expect(resolveServicePrice(service as never, pet, [{ optionId: "opt1", code: "LONG" }])).toBe(1_200_000_000n);
  });

  it("asks for the staff's choice rather than picking one", () => {
    expect(() => resolveServicePrice(service as never, pet, [])).toThrow(/Pilih varian/);
  });

  it("refuses a zone-priced service offline", () => {
    expect(() =>
      resolveServicePrice({ ...service, variantAxes: ["zone"] } as never, pet, []),
    ).toThrow(/butuh koneksi internet/);
  });
});
