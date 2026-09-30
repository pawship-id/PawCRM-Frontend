/**
 * Membership — packages, the cards animals hold, and what those cards may buy.
 *
 * MEMBERSHIP BELONGS TO AN ANIMAL, not to a customer. The tier a CUSTOMER holds
 * is `customerType` on the customer record and is a different thing entirely.
 *
 * Mirrors the API shapes in PawCRM-Backend/src/models/membershipPlan.model.js
 * and petMembership.model.js. Money arrives as DECIMAL STRINGS, never numbers —
 * see the backend's utils/money.js for why, and never parseFloat one to compare
 * it.
 */

/** What a benefit does. `perk` never touches a price. */
export type BenefitKind =
  | "free_item"
  | "discount_percent"
  | "discount_amount"
  | "perk";

/** What a benefit may be spent on. */
export type BenefitTarget = "service" | "product" | "addon" | "any";

/** The calendar bucket a per-period quota resets on. */
export type BenefitPeriod = "week" | "month";

export interface BenefitScope {
  target: BenefitTarget;
  serviceIds: string[];
  productIds: string[];
  categoryIds: string[];
  serviceKinds: string[];
}

/**
 * How often a benefit may be spent.
 *
 * `total` AND `perPeriod` ARE INDEPENDENT and may both apply — "1× seminggu,
 * maksimal 24×" is one benefit with both set. `null` means unlimited in either,
 * never zero.
 */
export interface BenefitQuota {
  total: number | null;
  perPeriod: number | null;
  period: BenefitPeriod | null;
}

export interface MembershipBenefit {
  /**
   * THE BENEFIT'S IDENTITY — `plan.benefits[]._id` (29 September 2026).
   *
   * It was a slug minted from the label. The slug was a SECOND identity for a
   * row that already had one, and it made that identity hostage to the label:
   * the redemption ledger pointed at it, so it could never be rewritten, and a
   * mistyped benefit name was stuck in the history forever. Same argument that
   * moved a pet's species and breed from codes to ids.
   *
   * ABSENT ON A BENEFIT BEING TYPED — see `BenefitInput`. Sending one back is
   * what preserves a benefit across an edit; omitting it adds a new one.
   */
  id: string;
  label: string;
  kind: BenefitKind;
  scope: BenefitScope;
  /** A number for `discount_percent`; a decimal STRING for `discount_amount`. */
  value: number | string | null;
  quota: BenefitQuota;
  maxPerTransaction: number;
  /**
   * The sentence a human reads — "Gratis · 2× per bulan, maksimal 24× selama
   * kartu berlaku".
   *
   * COMPOSED BY THE SERVER, and never re-composed here. Four screens show the
   * same benefit and four hand-rolled descriptions is four chances to describe
   * one quota differently.
   */
  summary: string;
}

export interface MembershipPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  serviceKinds: string[];
  price: string;
  durationDays: number;
  renewalOfferDays: number;
  isActive: boolean;
  benefits: MembershipBenefit[];
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

/** The four derived states of a card. There is no stored status — see the model. */
export type MembershipStatus = "scheduled" | "active" | "expired" | "cancelled";

/** The list's Status filter: the four states plus one question that is not one. */
export type MembershipStatusFilter = MembershipStatus | "expiringSoon";

/** Why a benefit cannot be used right now. Shown, never hidden. */
export type BenefitUnavailableReason =
  | "not_started"
  | "expired"
  | "cancelled"
  | "quota_exhausted"
  | "period_exhausted";

/** A benefit with its live counters — what the pet profile and the till read. */
export interface BenefitAvailability extends Omit<MembershipBenefit, "summary"> {
  usedTotal: number;
  usedThisPeriod: number;
  /** Null means unlimited, in both. Never confuse with 0, which means none left. */
  remainingTotal: number | null;
  remainingThisPeriod: number | null;
  /** When the period allowance comes back. Null if the lifetime quota is gone. */
  nextAvailableAt: string | null;
  periodLabel: string | null;
  available: boolean;
  reason: BenefitUnavailableReason | null;
}

export interface PetMembership {
  id: string;
  number: string;
  petId: string;
  petName: string | null;
  customerId: string;
  customerName: string | null;
  customerPhone?: string | null;
  branchId: string | null;
  planId: string;
  plan: {
    code: string | null;
    name: string | null;
    description: string | null;
    serviceKinds: string[];
    price: string | null;
    durationDays: number | null;
    renewalOfferDays: number;
    benefits: MembershipBenefit[];
  };
  status: MembershipStatus;
  /** When the money was agreed. Genuinely different from `startDate` — §3.1. */
  purchasedAt: string;
  /** When cover begins. Never before `purchasedAt`. */
  startDate: string;
  endDate: string;
  daysLeft: number;
  /** "Time to offer a renewal" — computed server-side from the plan's window. */
  renewalDue: boolean;
  activatedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  source: "manual" | "invoice" | "pos";
  sourceInvoiceId: string | null;
  sourcePosTransactionId: string | null;
  renewedFromId: string | null;
  note: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Present on the detail and pet-profile reads only. */
  benefits?: BenefitAvailability[];
  history?: MembershipRedemption[];
}

export interface MembershipRedemption {
  id: string;
  benefitId: string;
  usedAt: string;
  periodKey: string | null;
  /** Negative on a reversal — that is how a void gives the quota back. */
  amount: number;
  value: string | null;
  context: "pos" | "invoice" | "booking" | "manual";
  posTransactionId: string | null;
  invoiceId: string | null;
  bookingId: string | null;
  reversedAt: string | null;
  reversalOf: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface MembershipPlanListResponse {
  items: MembershipPlan[];
  pagination: Pagination;
}

export interface PetMembershipListResponse {
  items: PetMembership[];
  pagination: Pagination;
}

export interface MembershipPlanListQuery {
  page?: number;
  limit?: number;
  sort?: string;
  isActive?: boolean;
  serviceKind?: string;
  /** Show retired rows too — the only way a deleted plan can be found to restore. */
  includeDeleted?: boolean;
  search?: string;
}

export interface PetMembershipListQuery {
  page?: number;
  limit?: number;
  sort?: string;
  petId?: string;
  customerId?: string;
  planId?: string;
  status?: MembershipStatusFilter[];
  expiringWithinDays?: number;
  search?: string;
}

/** A benefit as it is written in a form — before the server mints its key. */
export interface BenefitInput {
  /** Absent on a NEW benefit. Sending the id back is what preserves its history. */
  id?: string;
  label: string;
  kind: BenefitKind;
  scope?: Partial<BenefitScope>;
  value?: number | string | null;
  quota?: Partial<BenefitQuota>;
  maxPerTransaction?: number;
}

export interface CreateMembershipPlanInput {
  code: string;
  name: string;
  description?: string | null;
  serviceKinds?: string[];
  price: string;
  durationDays: number;
  renewalOfferDays?: number;
  isActive?: boolean;
  benefits?: BenefitInput[];
}

export type UpdateMembershipPlanInput = Partial<CreateMembershipPlanInput>;

export interface IssueMembershipInput {
  petId: string;
  planId: string;
  branchId?: string | null;
  purchasedAt?: string;
  startDate?: string;
  note?: string | null;
}

export interface RenewMembershipInput {
  planId?: string;
  startDate?: string;
  purchasedAt?: string;
  note?: string | null;
}

/** One cart line, as the benefit engine wants to be asked about it. */
export interface BenefitQuoteLine {
  ref?: string;
  kind: "service" | "product" | "addon";
  refId: string;
  petId?: string | null;
  /** Line total BEFORE any discount, as a decimal string. */
  amount: string;
  categoryId?: string | null;
  serviceKind?: string | null;
  parentServiceId?: string | null;
}

export interface BenefitCandidate {
  membershipId: string;
  membershipNumber: string;
  planName: string | null;
  benefitId: string;
  benefitLabel: string;
  kind: BenefitKind;
  /** What it would take off this line, as a decimal string. */
  discount: string;
}

export interface BenefitQuoteResponse {
  cards: Array<{
    id: string;
    number: string;
    petId: string;
    planName: string | null;
    status: MembershipStatus;
    benefits: BenefitAvailability[];
  }>;
  lines: Array<{
    ref: string | null;
    petId: string | null;
    candidates: BenefitCandidate[];
    /** The one worth most to the customer. Not the first declared. */
    recommended: BenefitCandidate | null;
  }>;
}

/**
 * Membership, in the three numbers that decide whether the programme works —
 * `GET /reports/membership`.
 *
 * `margin` IS NOT A PROFIT and is deliberately not called one: it is revenue
 * less what the benefits cost at list price, and it ignores the cost of
 * actually performing those baths. The screen labels it accordingly.
 */
export interface MembershipReport {
  summary: {
    cards: number;
    revenue: string;
    benefitValue: string;
    margin: string;
  };
  plans: Array<{
    planId: string;
    /** The name the card was SOLD under — a later rename does not rewrite history. */
    name: string;
    cards: number;
    revenue: string;
    benefitsUsed: number;
    benefitValue: string;
  }>;
  /**
   * One row per benefit actually spent.
   *
   * A BENEFIT NOBODY EVER USED HAS NO ROW — this is built from the redemption
   * ledger, and an unused benefit has nothing in it. That absence is the point:
   * it is what the screen has to make visible.
   */
  benefits: Array<{
    benefitId: string;
    planId: string;
    planName: string;
    label: string;
    used: number;
    value: string;
    lastUsedAt: string | null;
  }>;
}
