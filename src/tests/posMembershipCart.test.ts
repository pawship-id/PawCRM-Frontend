import {
  autoApplyChanges,
  buildQuoteInput,
  candidateOptionLabel,
  groupByPet,
  lineKey,
  matchesBooking,
  newPackageRef,
  petPlans,
  pickOf,
  unavailableChips,
} from "@/features/pos/membershipCart";
import type { PosItem } from "@/types/api";
import type {
  BenefitCandidate,
  BenefitQuoteLineResult,
  BenefitQuoteResponse,
} from "@/types/membership";

/**
 * The till's member-pick rules (Promosi V1, contract §4 and §6.3) — pure, so
 * they are tested without a DOM.
 */
const line = (over: Partial<PosItem> = {}): PosItem =>
  ({
    kind: "service",
    refId: "svc-groom",
    name: "Grooming",
    sku: null,
    qty: "1.0000",
    unitPrice: "100000.0000",
    lineTotal: "100000.0000",
    discount: null,
    hppAtTime: null,
    bookingId: null,
    parentServiceId: null,
    petId: "pet-milo",
    petName: "Milo",
    groomerName: null,
    bookingStatus: null,
    bookingOwned: false,
    bookingNumber: null,
    ...over,
  }) as PosItem;

const candidate = (over: Partial<BenefitCandidate> = {}): BenefitCandidate => ({
  membershipId: "mem-1",
  membershipNumber: "MBR-0042",
  virtual: false,
  packageRef: null,
  planName: "Explorer",
  attachTo: "pet",
  benefitId: "ben-groom",
  benefitLabel: "Grooming",
  optionId: "opt-1",
  optionKind: "free_item",
  kind: "quota",
  label: "Jatah Grooming 2/3",
  discount: "109000.0000",
  visitFee: "zone",
  visitFeeDiscount: "0.0000",
  used: 2,
  cap: 3,
  options: [],
  ...over,
});

const quoteLine = (
  ref: string,
  over: Partial<BenefitQuoteLineResult> = {},
): BenefitQuoteLineResult => ({
  ref,
  petId: "pet-milo",
  lineType: "item",
  candidates: [],
  recommended: null,
  unavailable: [],
  ...over,
});

const quoteOf = (lines: BenefitQuoteLineResult[]): BenefitQuoteResponse => ({
  cards: [],
  lines,
});

describe("buildQuoteInput", () => {
  it("asks nothing without a customer", () => {
    expect(buildQuoteInput({ customerId: null, items: [line()] })).toBeNull();
  });

  it("sends each line by its index, packages as virtual cards, and picks as pins", () => {
    const items = [
      line({
        discount: {
          mode: "amount",
          value: "100000.0000",
          resolvedAmount: "100000.0000",
          approvedBy: null,
          source: "membership",
        },
        benefit: { membershipId: "mem-1", packageRef: null, benefitId: "ben-1", optionId: "opt-1" },
        bookingTripId: "trip-1",
      }),
      line({ kind: "membership", refId: "plan-1", packageRef: "pkg-1", membershipStartDate: null }),
      line({ refId: "svc-addon", parentServiceId: "svc-groom" }),
      line({ refId: "trv", petId: null, homeTripId: "trip-1", lineTotal: "40000.0000" }),
    ];

    const input = buildQuoteInput({ customerId: "cust-1", items });

    expect(input?.customerId).toBe("cust-1");
    expect(input?.packages).toEqual([
      { ref: "pkg-1", planId: "plan-1", petId: "pet-milo" },
    ]);
    expect(input?.lines.map((one) => one.ref)).toEqual(["0", "2", "3"]);
    expect(input?.lines[0]).toEqual(
      expect.objectContaining({
        membershipId: "mem-1",
        benefitId: "ben-1",
        optionId: "opt-1",
        bookingHomeTripId: "trip-1",
        amount: "100000.0000",
      }),
    );
    expect(input?.lines[1].kind).toBe("addon");
    expect(input?.lines[2]).toEqual(expect.objectContaining({ homeTripId: "trip-1", kind: "service" }));
  });

  it("marks a line the cashier set to Tanpa member", () => {
    const items = [line(), line()];
    const input = buildQuoteInput(
      { customerId: "cust-1", items },
      new Set([lineKey(items, 1)]),
    );

    expect(input?.lines[0].noBenefit).toBeUndefined();
    expect(input?.lines[1].noBenefit).toBe(true);
  });
});

describe("lineKey", () => {
  it("tells two identical lines apart by their order", () => {
    const items = [line(), line()];
    expect(lineKey(items, 0)).not.toBe(lineKey(items, 1));
  });
});

describe("autoApplyChanges", () => {
  it("applies the recommended pick on every line with none", () => {
    const items = [line(), line({ refId: "svc-nail" })];
    const quote = quoteOf([
      quoteLine("0", { candidates: [candidate()], recommended: candidate() }),
      quoteLine("1", {
        candidates: [candidate({ benefitId: "ben-10", kind: "unlimited" })],
        recommended: candidate({ benefitId: "ben-10", kind: "unlimited" }),
      }),
    ]);

    expect(autoApplyChanges(items, quote)).toEqual([
      { index: 0, benefit: { membershipId: "mem-1", benefitId: "ben-groom", optionId: "opt-1" } },
      { index: 1, benefit: { membershipId: "mem-1", benefitId: "ben-10", optionId: "opt-1" } },
    ]);
  });

  it("names a same-cart package by its packageRef, never its throw-away id", () => {
    const items = [line()];
    const virtual = candidate({ virtual: true, packageRef: "pkg-1", membershipId: "tmp-123" });
    const quote = quoteOf([quoteLine("0", { candidates: [virtual], recommended: virtual })]);

    expect(autoApplyChanges(items, quote)).toEqual([
      { index: 0, benefit: { packageRef: "pkg-1", benefitId: "ben-groom", optionId: "opt-1" } },
    ]);
  });

  it("leaves a line that already carries a pick alone", () => {
    const items = [
      line({ benefit: { membershipId: "mem-1", benefitId: "ben-10", optionId: null } }),
    ];
    const quote = quoteOf([quoteLine("0", { candidates: [candidate()], recommended: candidate() })]);

    expect(autoApplyChanges(items, quote)).toEqual([]);
  });

  it("respects Tanpa member", () => {
    const items = [line()];
    const quote = quoteOf([quoteLine("0", { candidates: [candidate()], recommended: candidate() })]);

    expect(autoApplyChanges(items, quote, new Set([lineKey(items, 0)]))).toEqual([]);
  });

  it("skips package lines, visit-fee lines and lines with nothing recommended", () => {
    const items = [
      line({ kind: "membership", refId: "plan-1" }),
      line({ homeTripId: "trip-1", petId: null }),
      line(),
    ];
    const quote = quoteOf([
      quoteLine("0", { recommended: candidate() }),
      quoteLine("1", { lineType: "visit_fee", recommended: null }),
      quoteLine("2", { candidates: [], recommended: null }),
    ]);

    expect(autoApplyChanges(items, quote)).toEqual([]);
  });

  /* A booking's planned pick is pinned by the server → arrives as recommended. */
  it("applies a booking's planned pick like any recommendation", () => {
    const items = [line({ bookingId: "bk-1", fromBooking: true })];
    const planned = candidate({ benefitId: "ben-planned" });
    const quote = quoteOf([
      quoteLine("0", {
        candidates: [candidate(), planned],
        recommended: planned,
        plannedApplied: true,
      }),
    ]);

    expect(autoApplyChanges(items, quote)[0].benefit.benefitId).toBe("ben-planned");
  });

  /* "Tanpa member" agreed at booking for an add-on (22 October 2026). */
  it("never auto-applies a booking add-on agreed Tanpa member, but keeps a pick made anyway", () => {
    const addon = line({
      refId: "svc-parfum",
      bookingId: "bk-1",
      parentServiceId: "svc-groom",
      fromBooking: true,
      plannedNoBenefit: true,
    });
    const quote = quoteOf([
      quoteLine("0", { candidates: [candidate()], recommended: candidate() }),
    ]);

    /* The server would recommend nothing; even if a stale quote does, it is not applied. */
    expect(autoApplyChanges([addon], quote)).toEqual([]);
    expect(buildQuoteInput({ customerId: "cust-1", items: [addon] })?.lines[0]).toMatchObject({
      kind: "addon",
      noBenefit: true,
    });
    expect(matchesBooking(addon)).toBe(true);

    const picked = { ...addon, benefit: { membershipId: "mem-1", benefitId: "ben-groom", optionId: null } };
    expect(buildQuoteInput({ customerId: "cust-1", items: [picked] })?.lines[0]).toMatchObject({
      membershipId: "mem-1",
      benefitId: "ben-groom",
    });
    expect(buildQuoteInput({ customerId: "cust-1", items: [picked] })?.lines[0].noBenefit).toBeUndefined();
    expect(matchesBooking(picked)).toBe(false);
  });
});

describe("pickOf", () => {
  it("never treats a visit-fee waiver as a pick", () => {
    expect(
      pickOf(
        line({
          discount: {
            mode: "amount",
            value: "40000.0000",
            resolvedAmount: "40000.0000",
            approvedBy: null,
            source: "membership",
            membershipId: "mem-1",
            benefitId: "ben-1",
            visitFeeWaiver: true,
          },
        }),
      ),
    ).toBeNull();
  });

  it("falls back to the discount on an older response", () => {
    expect(
      pickOf(
        line({
          discount: {
            mode: "amount",
            value: "1.0000",
            resolvedAmount: "1.0000",
            approvedBy: null,
            source: "membership",
            membershipId: "mem-1",
            benefitId: "ben-1",
          },
        }),
      ),
    ).toEqual({ membershipId: "mem-1", packageRef: null, benefitId: "ben-1", optionId: null });
  });
});

describe("what a row says", () => {
  it("labels an option by the benefit alone — the struck price shows the amount", () => {
    expect(candidateOptionLabel(candidate())).toBe("Jatah Grooming 2/3");
    expect(
      candidateOptionLabel(
        candidate({ label: "Member · Diskon 10%", discount: "2500.0000", visitFeeDiscount: "0.0000" }),
      ),
    ).toBe("Member · Diskon 10%");
  });

  it("shortens why a benefit cannot be used", () => {
    expect(
      unavailableChips(
        quoteLine("0", {
          unavailable: [
            { membershipId: "m", benefitId: "b1", benefitLabel: "Grooming", reason: "period_exhausted" },
            { membershipId: "m", benefitId: "b2", benefitLabel: "Mandi", reason: "paused" },
            { membershipId: "m", benefitId: "b3", benefitLabel: "Kuku", reason: "paused" },
          ],
        }),
      ),
    ).toEqual(["Grooming habis", "Member ditunda"]);

    expect(
      unavailableChips(
        quoteLine("0", {
          unavailable: [
            {
              membershipId: "m",
              benefitId: "b1",
              benefitLabel: "Mandi",
              reason: "reserved",
              reservedBy: [{ bookingId: "x", bookingNumber: "BK-0012", scheduledAt: "", petId: null }],
            },
          ],
        }),
      ),
    ).toEqual(["Mandi habis"]);
  });

  it("says sesuai booking only when the pick is the booking's plan", () => {
    const planned = { membershipId: "mem-1", benefitId: "ben-1", optionId: null };
    expect(
      matchesBooking(
        line({ benefit: { membershipId: "mem-1", benefitId: "ben-1" }, plannedBenefit: planned }),
      ),
    ).toBe(true);
    expect(
      matchesBooking(
        line({ benefit: { membershipId: "mem-1", benefitId: "ben-2" }, plannedBenefit: planned }),
      ),
    ).toBe(false);
  });
});

describe("groupByPet", () => {
  it("groups per animal in first-seen order, lines without one last", () => {
    const items = [
      line({ kind: "product", refId: "food", petId: null, petName: null }),
      line({ petId: "pet-luna", petName: "Luna" }),
      line(),
      line({ refId: "svc-nail", petId: "pet-luna", petName: "Luna" }),
      line({ refId: "trv", petId: null, visitFee: { petNames: [], zoneName: null, distanceKm: null, unit: null, homeTripId: "t" } }),
    ];

    const groups = groupByPet(items);

    expect(groups.map((group) => group.petName ?? "Tanpa hewan")).toEqual(["Luna", "Milo", "Tanpa hewan"]);
    expect(groups[0].lines.map((entry) => entry.index)).toEqual([1, 3]);
    expect(groups[2].lines.map((entry) => entry.index)).toEqual([0]);
  });
});

describe("petPlans", () => {
  it("names a package bought now over a card held, and says ditunda", () => {
    const plans = petPlans(
      [line({ kind: "membership", refId: "plan-1", name: "Explorer", petId: "pet-luna" })],
      [
        { petId: "pet-milo", planName: "Gold", status: "paused" },
        { petId: "pet-luna", planName: "Silver", status: "active" },
        { petId: "pet-kopi", planName: "Old", status: "expired" },
      ],
    );

    expect(plans.get("pet-milo")).toEqual({ name: "Gold", state: "paused" });
    expect(plans.get("pet-luna")).toEqual({ name: "Explorer", state: "new" });
    expect(plans.has("pet-kopi")).toBe(false);
  });
});

describe("newPackageRef", () => {
  it("never repeats one already in the basket", () => {
    expect(
      newPackageRef([line({ kind: "membership", packageRef: "pkg-2" })]),
    ).toBe("pkg-3");
  });
});
