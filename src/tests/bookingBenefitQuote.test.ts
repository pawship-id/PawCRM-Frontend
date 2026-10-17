import {
  benefitRefusalOf,
  bookingQuoteInput,
  cardBenefitView,
  effectivePlan,
  membershipDiscountTotal,
  visitFeeDiscountOf,
} from "@/features/booking/benefitQuote";
import { blankCard, type BookingCardDraft } from "@/features/booking/bookingDraft";
import { ApiError } from "@/services/api-error";
import type {
  BenefitCandidate,
  BenefitQuoteCard,
  BenefitQuoteLineResult,
  BenefitQuoteResponse,
} from "@/types/membership";

/**
 * The booking form's side of membership-v1 §4.4 and §8 — what it asks the
 * quote, what it preselects, what it saves, and what it says when nothing fits.
 */

const PET = "pet-1";
const SVC = "svc-1";

const card = (over: Partial<BookingCardDraft> = {}): BookingCardDraft => ({
  ...blankCard(PET),
  serviceId: SVC,
  ...over,
});

const candidate = (over: Partial<BenefitCandidate> = {}): BenefitCandidate => ({
  membershipId: "mem-1",
  membershipNumber: "MBR-2026-0042",
  virtual: false,
  packageRef: null,
  planName: "Explorer",
  attachTo: "pet",
  benefitId: "ben-groom",
  benefitLabel: "Grooming",
  optionId: "opt-free",
  optionKind: "free_item",
  kind: "quota",
  label: "Jatah Grooming 1/3",
  discount: "100000.0000",
  visitFee: "zone",
  visitFeeDiscount: "0.0000",
  used: 1,
  cap: 3,
  options: [],
  ...over,
} as BenefitCandidate);

const diskon = candidate({
  benefitId: "ben-disc",
  benefitLabel: "Diskon",
  optionId: "opt-disc",
  kind: "unlimited",
  label: "Member · Diskon 10%",
  discount: "10000.0000",
  used: null,
  cap: null,
});

const heldCard = { id: "mem-1", number: "MBR-1", petId: PET, planName: "Explorer", status: "active", benefits: [] } as unknown as BenefitQuoteCard;

const quoteOf = (
  lines: Partial<BenefitQuoteLineResult>[],
  cards: BenefitQuoteCard[] = [heldCard],
): BenefitQuoteResponse => ({
  cards,
  lines: lines.map((line) => ({
    ref: null,
    petId: PET,
    candidates: [],
    recommended: null,
    unavailable: [],
    ...line,
  })),
});

describe("bookingQuoteInput — the §4.4 shorthand", () => {
  const prices = () => ({ amount: "100000", addons: [{ serviceId: "add-1", amount: "25000" }] });

  it("sends one entry per complete card, the booking's date, and no pick on a fresh card", () => {
    const fresh = card();
    const input = bookingQuoteInput({
      cards: [fresh, card({ petId: "" })],
      customerId: "cust-1",
      date: "2026-10-25T03:00:00.000Z",
      pricesOf: prices,
    });

    expect(input).toEqual({
      context: "booking",
      customerId: "cust-1",
      date: "2026-10-25T03:00:00.000Z",
      entries: [
        {
          ref: fresh.key,
          petId: PET,
          serviceId: SVC,
          amount: "100000",
          /* An add-on never takes the booking's jatah. */
          addons: [{ serviceId: "add-1", amount: "25000", noBenefit: true }],
        },
      ],
    });
  });

  it("sends bookingId when editing, the pick, and 'Tanpa member' as noBenefit", () => {
    const picked = card({
      benefitPicked: true,
      plannedBenefit: { membershipId: "mem-1", benefitId: "ben-groom", optionId: "opt-free" },
    });
    const none = card({ benefitPicked: true, plannedBenefit: null });

    const input = bookingQuoteInput({
      cards: [picked, none],
      customerId: "cust-1",
      date: "2026-10-25T03:00:00.000Z",
      bookingId: "bk-1",
      pricesOf: () => ({ amount: "100000", addons: [] }),
    });

    expect(input?.bookingId).toBe("bk-1");
    expect(input?.entries[0]).toMatchObject({
      membershipId: "mem-1",
      benefitId: "ben-groom",
      optionId: "opt-free",
    });
    expect(input?.entries[1]).toMatchObject({ noBenefit: true });
  });

  it("puts the visit fee on the first entry only, and every entry in one visit", () => {
    const input = bookingQuoteInput({
      cards: [card(), card({ petId: "pet-2" })],
      customerId: "cust-1",
      date: "2026-10-25T03:00:00.000Z",
      visitFee: "40000",
      pricesOf: () => ({ amount: "100000", addons: [] }),
    });

    expect(input?.entries.map((entry) => [entry.visitFee, entry.visitGroup])).toEqual([
      ["40000", "visit"],
      [undefined, "visit"],
    ]);
  });

  it("asks nothing without a customer, a date, or a priced card", () => {
    const base = { cards: [card()], pricesOf: prices };
    expect(bookingQuoteInput({ ...base, customerId: null, date: "x" })).toBeNull();
    expect(bookingQuoteInput({ ...base, customerId: "c", date: null })).toBeNull();
    expect(
      bookingQuoteInput({ cards: [card()], customerId: "c", date: "x", pricesOf: () => null }),
    ).toBeNull();
  });
});

describe("the default pick and the reset", () => {
  it("preselects the recommended candidate on a card nobody answered", () => {
    const fresh = card();
    const quote = quoteOf([{ ref: fresh.key, candidates: [candidate(), diskon], recommended: candidate() }]);

    expect(cardBenefitView(fresh, quote).selectedKey).toBe("mem-1|ben-groom");
    expect(effectivePlan(fresh, quote)).toEqual({
      membershipId: "mem-1",
      benefitId: "ben-groom",
      optionId: "opt-free",
    });
    expect(membershipDiscountTotal([fresh], quote)).toBe("100000.0000");
  });

  it("keeps what somebody picked while it is still a candidate", () => {
    const picked = card({
      benefitPicked: true,
      plannedBenefit: { membershipId: "mem-1", benefitId: "ben-disc", optionId: "opt-disc" },
    });
    /* A stale quote still recommending the jatah — the click shows at once. */
    const quote = quoteOf([{ ref: picked.key, candidates: [candidate(), diskon], recommended: candidate() }]);

    expect(cardBenefitView(picked, quote)).toMatchObject({
      selectedKey: "mem-1|ben-disc",
      discount: "10000.0000",
    });
    expect(effectivePlan(picked, quote)?.benefitId).toBe("ben-disc");
  });

  it("drops a pick the re-quote no longer offers, back to the recommended one", () => {
    const picked = card({
      benefitPicked: true,
      plannedBenefit: { membershipId: "mem-1", benefitId: "ben-groom", optionId: "opt-free" },
    });
    /* The date moved into a period whose jatah is gone. */
    const quote = quoteOf([{ ref: picked.key, candidates: [diskon], recommended: diskon }]);

    expect(cardBenefitView(picked, quote).selectedKey).toBe("mem-1|ben-disc");
    expect(effectivePlan(picked, quote)?.benefitId).toBe("ben-disc");
  });

  it("saves nothing on 'Tanpa member'", () => {
    const none = card({ benefitPicked: true, plannedBenefit: null });
    const quote = quoteOf([{ ref: none.key, candidates: [candidate()], recommended: null }]);

    expect(cardBenefitView(none, quote)).toMatchObject({ selectedKey: null, discount: "0" });
    expect(effectivePlan(none, quote)).toBeNull();
  });

  it("falls back to the card's own answer when there is no quote", () => {
    const fresh = card();
    expect(effectivePlan(fresh, null)).toBeNull();

    const stored = card({
      benefitPicked: true,
      plannedBenefit: { membershipId: "m", benefitId: "b", optionId: null },
    });
    expect(effectivePlan(stored, null)).toEqual({ membershipId: "m", benefitId: "b", optionId: null });
  });

  it("ignores a line from before the card's animal changed", () => {
    const moved = card({ petId: "pet-2" });
    const quote = quoteOf([{ ref: moved.key, petId: PET, candidates: [candidate()], recommended: candidate() }]);
    expect(cardBenefitView(moved, quote).show).toBe(false);
    expect(effectivePlan(moved, quote)).toBeNull();
  });
});

describe("when nothing can be offered", () => {
  it("says why, with the booking that holds the jatah", () => {
    const fresh = card();
    const quote = quoteOf([
      {
        ref: fresh.key,
        unavailable: [
          {
            membershipId: "mem-1",
            benefitId: "ben-groom",
            benefitLabel: "Grooming",
            reason: "reserved",
            message: "Jatah Grooming habis periode ini",
            reservedBy: [
              { bookingId: "b", bookingNumber: "BK-2026-0012", scheduledAt: "x", petId: PET },
            ],
          },
        ],
      },
    ]);

    expect(cardBenefitView(fresh, quote)).toMatchObject({
      show: true,
      candidates: [],
      emptyMessage: "Jatah Grooming habis periode ini · dipakai BK-2026-0012",
    });
  });

  it("passes a paused card's sentence through", () => {
    const fresh = card();
    const quote = quoteOf([
      {
        ref: fresh.key,
        unavailable: [
          {
            membershipId: "mem-1",
            benefitId: "ben-groom",
            benefitLabel: "Grooming",
            reason: "paused",
            message: "Membership sedang ditunda",
          },
        ],
      },
    ]);
    expect(cardBenefitView(fresh, quote).emptyMessage).toBe("Membership sedang ditunda");
  });

  it("hides the field when the animal holds no card at all", () => {
    const fresh = card();
    expect(cardBenefitView(fresh, quoteOf([{ ref: fresh.key }], [])).show).toBe(false);
  });

  it("shows a plain sentence when the animal has a card that covers nothing here", () => {
    const fresh = card();
    expect(cardBenefitView(fresh, quoteOf([{ ref: fresh.key }])).emptyMessage).toBe(
      "Tidak ada benefit untuk layanan ini",
    );
  });
});

describe("the visit fee", () => {
  it("reads the waiver off the visit line", () => {
    const quote = quoteOf([{ ref: "c:visit", petId: null, lineType: "visit_fee", visitFeeDiscount: "40000.0000" }]);
    expect(visitFeeDiscountOf(quote)).toBe("40000.0000");
    expect(visitFeeDiscountOf(null)).toBe("0");
  });
});

describe("benefitRefusalOf — §8 refusals", () => {
  it("names the card and who holds the jatah on a 409", () => {
    const error = new ApiError("Benefit membership tidak bisa dipakai untuk booking ini", 409, {
      details: [
        {
          field: "bookings[1].plannedBenefit",
          message: "Jatah periode ini sudah dipesan booking lain",
        },
      ] as never,
      data: {
        code: "reserved",
        reservedBy: [{ bookingId: "b", bookingNumber: "BK-2026-0012", scheduledAt: "x", petId: "p" }],
      },
    });

    expect(benefitRefusalOf(error)).toEqual({
      index: 1,
      message: "Jatah periode ini sudah dipesan booking lain · dipakai BK-2026-0012",
    });
  });

  it("does not repeat a holder the sentence already names", () => {
    const error = new ApiError("x", 409, {
      details: [{ field: "plannedBenefit", message: "Habis — dipakai oleh BK-1" }] as never,
      data: { reservedBy: [{ bookingId: "b", bookingNumber: "BK-1", scheduledAt: "x", petId: "p" }] },
    });
    expect(benefitRefusalOf(error)).toEqual({ index: null, message: "Habis — dipakai oleh BK-1" });
  });

  it("leaves the clash alone", () => {
    expect(benefitRefusalOf(new ApiError("Bentrok", 409, { reason: "BK-9" }))).toBeNull();
  });
});
