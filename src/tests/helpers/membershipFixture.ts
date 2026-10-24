import type {
  BenefitAvailability,
  MembershipRedemption,
  PetMembership,
} from "@/types/membership";

/**
 * A membership card and its parts, shaped like the V1 contract
 * (PawCRM-Backend/docs/membership-v1.md §3), for the Anggota / profile suites.
 * Every builder takes overrides; the defaults describe an ordinary active,
 * anniversary card on month 1 of 6 with one monthly Grooming allowance.
 */

export function benefitAvailability(
  overrides: Partial<BenefitAvailability> = {},
): BenefitAvailability {
  return {
    id: "ben-groom",
    label: "Grooming",
    kind: "free_item",
    scope: { target: "service", serviceIds: ["svc-basic"], productIds: [], categoryIds: [], serviceKinds: [] },
    value: null,
    quota: { total: null, perPeriod: 3, period: "month" },
    options: [
      {
        id: "opt-1",
        kind: "free_item",
        scope: { target: "service", serviceIds: ["svc-basic"], productIds: [], categoryIds: [], serviceKinds: [] },
        value: null,
        priceMode: "same",
        variantPrices: [],
        visitFee: "free",
        summary: "Gratis",
      },
    ],
    summary: "Gratis · 3× per bulan",
    unlimited: false,
    usedTotal: 1,
    usedThisPeriod: 1,
    remainingTotal: null,
    remainingThisPeriod: 2,
    capTotal: null,
    capThisPeriod: 3,
    cap: 3,
    used: 1,
    remaining: 2,
    adjustment: 0,
    periodKey: "M1",
    periodIndex: 1,
    periodStart: "2026-10-01T00:00:00.000Z",
    periodEnd: "2026-10-31T23:59:59.999Z",
    resetsAt: "2026-11-01T00:00:00.000Z",
    nextAvailableAt: null,
    periodLabel: "bulan",
    available: true,
    reason: null,
    ...overrides,
  };
}

export function redemption(overrides: Partial<MembershipRedemption> = {}): MembershipRedemption {
  return {
    id: "red-1",
    benefitId: "ben-groom",
    benefitLabel: "Grooming",
    optionId: "opt-1",
    optionKind: "free_item",
    petId: "pet-1",
    usedAt: "2026-10-05T04:00:00.000Z",
    originalUsedAt: null,
    movedAt: null,
    periodKey: "M1",
    amount: 1,
    value: "100000.0000",
    context: "pos",
    posTransactionId: "pos-1",
    invoiceId: null,
    bookingId: null,
    lineIndex: 0,
    reversedAt: null,
    reversedReason: null,
    reversalOf: null,
    ...overrides,
  };
}

export function membershipCard(overrides: Partial<PetMembership> = {}): PetMembership {
  const benefits = overrides.benefits ?? [benefitAvailability()];
  return {
    id: "card-1",
    number: "MBR-2026-0042",
    attachTo: "pet",
    petId: "pet-1",
    petName: "Mochi",
    customerId: "cus-1",
    customerName: "Rina Wijaya",
    customerPhone: "0812-1111-2222",
    branchId: "b1",
    planId: "plan-1",
    plan: {
      code: "MSP-0001",
      name: "Explorer",
      description: null,
      serviceKinds: ["grooming"],
      price: "450000.0000",
      durationDays: 183,
      durationMonths: 6,
      renewalOfferDays: 30,
      attachTo: "pet",
      petSpecies: [],
      priceMode: "fixed",
      eligibility: "all",
      benefits,
    },
    status: "active",
    expiringSoon: false,
    periodMode: "anniversary",
    variantKey: null,
    referralCode: null,
    awaitingPayment: false,
    purchasedAt: "2026-10-01T03:00:00.000Z",
    startDate: "2026-10-01T03:00:00.000Z",
    endDate: "2027-03-31T03:00:00.000Z",
    daysLeft: 166,
    cycle: { index: 1, of: 6, start: "2026-10-01T03:00:00.000Z", end: "2026-10-31T16:59:59.999Z" },
    renewalDue: false,
    activatedAt: "2026-10-01T03:00:00.000Z",
    paidAt: null,
    cancelledAt: null,
    cancelReason: null,
    source: "pos",
    sourceInvoiceId: null,
    sourcePosTransactionId: "pos-1",
    renewedFromId: null,
    note: null,
    activePause: null,
    pauses: [],
    quotaAdjustments: [],
    history: [],
    createdAt: "2026-10-01T03:00:00.000Z",
    updatedAt: "2026-10-01T03:00:00.000Z",
    benefits,
    redemptions: [],
    ...overrides,
  };
}

export function listPage<T>(items: T[], total = items.length) {
  return { items, pagination: { page: 1, limit: 20, total, totalPages: 1 } };
}
