/**
 * Membership — packages, the cards that hold them, and what those cards may buy.
 *
 * THE CONTRACT IS `PawCRM-Backend/docs/membership-v1.md` (Promosi V1, 16 October
 * 2026). Every shape here mirrors a section of it, cited beside the type; when
 * the two disagree the doc wins and this file is the bug.
 *
 * A CARD BELONGS TO AN ANIMAL OR TO A CUSTOMER (`attachTo`, since V1). The tier a
 * customer holds as a CUSTOMER (`customerType` on the customer record) is a
 * different thing entirely and keeps working beside this.
 *
 * Money arrives as DECIMAL STRINGS (`"150000.0000"`), never numbers — see the
 * backend's utils/money.js for why, and never parseFloat one to compare it. A
 * percent is a JSON number. A date somebody picks as a calendar day is SENT as
 * `"YYYY-MM-DD"` and comes back as an ISO instant.
 */

/* ────────────────────────────────────────────────────────────── §1 enums */

/** Who holds the allowance. Absent on an old document = `pet`. */
export type AttachTo = "pet" | "customer";

/** A plan's price: one figure, or one per pet variant (`pet` plans only). */
export type PlanPriceMode = "fixed" | "variant";

/** The buyer rule, checked when a card is issued. */
export type Eligibility = "all" | "new_customer" | "renewal" | "referral";

/**
 * What a benefit does — the BENEFIT-level kind, a mirror of `options[0].kind`,
 * or `perk`. `perk` never touches a price and never appears in a quote.
 */
export type BenefitKind =
  | "free_item"
  | "discount_percent"
  | "discount_amount"
  | "special_price"
  | "perk";

/** What one option ("ATAU") does to a line. There is no `perk` option. */
export type OptionKind = Exclude<BenefitKind, "perk">;

/** Only meaningful for `special_price`: one member price, or one per variant. */
export type OptionPriceMode = "same" | "variant";

/** Whether the visit fee (TRV) of an in-home service is waived. Default `zone`. */
export type VisitFee = "free" | "zone";

/** What a benefit may be spent on. See §2.3 for the empty-scope rules. */
export type BenefitTarget = "service" | "product" | "addon" | "any";

/** The bucket a per-period quota resets on. */
export type BenefitPeriod = "week" | "month";

/** How a card counts its periods. Old cards are `calendar`, new ones `anniversary`. */
export type PeriodMode = "calendar" | "anniversary";

/**
 * The six derived states of a card, in the ladder's priority order (§3.2):
 * `cancelled > awaiting_payment > paused > scheduled > expired > active`.
 * There is no stored status. Only `active` spends benefits.
 */
export type MembershipStatus =
  | "scheduled"
  | "active"
  | "paused"
  | "awaiting_payment"
  | "expired"
  | "cancelled";

/**
 * The list's Status filter: the six states plus two questions that are not
 * one. `activeNotExpiring` = active with more than 14 days left, so a card is
 * never counted under both "Aktif" and "Segera berakhir".
 */
export type MembershipStatusFilter = MembershipStatus | "expiringSoon" | "activeNotExpiring";

/** Why a benefit cannot be used right now. Shown, never hidden. */
export type BenefitUnavailableReason =
  | "not_started"
  | "paused"
  | "awaiting_payment"
  | "expired"
  | "cancelled"
  | "quota_exhausted"
  | "period_exhausted";

/**
 * What a quote's `unavailable[]` can say. The same reasons as a card's benefit
 * — a cart that used the quota up reads `quota_exhausted` / `period_exhausted`
 * (there is no per-transaction line limit).
 */
export type QuoteUnavailableReason = BenefitUnavailableReason;

/** What a change-log row records (§3.1 `history`). */
export type MembershipHistoryAction =
  | "issued"
  | "renewed"
  | "updated"
  | "dates_adjusted"
  | "paused"
  | "quota_adjusted"
  | "transferred"
  | "redemption_moved"
  | "payment_received"
  | "cancelled"
  | "refunded";

/**
 * The Kelola reasons — EXACT STRINGS, stored and shown as they are. Every
 * Kelola endpoint and the cancel endpoint takes one of these as `reason`.
 */
export const KELOLA_REASONS = [
  "Salah input",
  "Kompensasi: toko tutup atau groomer berhalangan",
  "Hewan sakit atau dalam perawatan",
  "Permintaan pelanggan",
  "Lainnya",
] as const;

export type KelolaReason = (typeof KELOLA_REASONS)[number];

/** Where a redemption was spent. */
export type RedemptionContext = "pos" | "invoice" | "booking" | "manual";

/** Max total paused days per card; "Segera berakhir" window; builder limits. */
export const MEMBERSHIP_LIMITS = {
  maxPauseDays: 30,
  expiringSoonDays: 14,
  maxBenefitsPerPlan: 30,
  maxOptionsPerBenefit: 10,
  maxVariantPriceRows: 100,
} as const;

/* ─────────────────────────────────────────────────── §1.1 variant prices */

/**
 * One per-variant price — a plan's own price or an option's special price.
 *
 * `variantKey` is `"<speciesId>|<sizeId>|<furTypeId>"`, the same three axes
 * the service price grid uses. AN EMPTY SEGMENT MEANS "ANY" (`"<cat>||"` prices
 * every cat), at least one segment is filled, and the most specific matching
 * row wins. Helpers live in `features/memberships/variantKey.ts`.
 */
export interface VariantPrice {
  variantKey: string;
  price: string;
}

/* ─────────────────────────────────────────────── §2 plans and benefits */

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
 * never zero. `perPeriod` and `period` travel together (both or neither).
 *
 * The builder's four choices map onto it (§2.2): "N× per minggu" →
 * `{perPeriod:N, period:"week"}`, "N× per bulan" → `{perPeriod:N,
 * period:"month"}`, "N× selama masa berlaku" → `{total:N}`, "Tidak terbatas" →
 * all null. See `features/memberships/benefitDraft.ts`.
 */
export interface BenefitQuota {
  total: number | null;
  perPeriod: number | null;
  period: BenefitPeriod | null;
}

/**
 * One "ATAU" option of a benefit (§2.2): what it covers and how it prices it.
 * One use of the benefit spends its quota once, whichever option priced the
 * line.
 */
export interface BenefitOption {
  /** On a legacy benefit (stored without options) this is the BENEFIT's id. */
  id: string;
  kind: OptionKind;
  scope: BenefitScope;
  /**
   * Percent (number) for `discount_percent`; rupiah (string) for
   * `discount_amount` and `special_price`+`same`; an optional FALLBACK rupiah
   * for `special_price`+`variant`; `null` for `free_item`.
   */
  value: number | string | null;
  priceMode: OptionPriceMode;
  variantPrices: VariantPrice[];
  visitFee: VisitFee;
  /** "Gratis", "Diskon 10%", "Harga khusus per varian" — composed by the server. */
  summary: string;
}

export interface MembershipBenefit {
  /**
   * THE BENEFIT'S IDENTITY — `plan.benefits[]._id`. Sending it back on an edit
   * is what keeps the benefit (and every redemption pointing at it); omitting
   * it adds a new one.
   */
  id: string;
  label: string;
  kind: BenefitKind;
  /** Mirror of `options[0]`, kept for old readers. `options` is the truth. */
  scope: BenefitScope;
  value: number | string | null;
  quota: BenefitQuota;
  /** `[]` on a perk. A legacy benefit comes back with ONE option. */
  options: BenefitOption[];
  /**
   * The sentence a human reads — "Gratis atau 1 opsi lain · 1× per bulan".
   * COMPOSED BY THE SERVER, and never re-composed for a saved benefit.
   */
  summary: string;
}

/** How a plan appears on the public /membership page. */
export interface PublicDisplay {
  visible: boolean;
  featured: boolean;
  order: number;
  badge: string | null;
}

/* ─────────────────────────────── pengakuan pendapatan (26 Okt 2026) */

/** `immediate` — revenue the day it is sold; `deferred` — Pendapatan Diterima di Muka. */
export type RecognitionMode = "immediate" | "deferred";

/** How a deferred card earns: per day (posted at month end), or per use. */
export type RecognitionMethod = "straight_line" | "per_use";

/**
 * A plan's own choice (BO no. 1: "di paket, prefilled dengan default tenant").
 * Null on any field = whatever the tenant says at the moment of sale.
 */
export interface PlanAccounting {
  recognition: RecognitionMode | null;
  method: RecognitionMethod | null;
  revenueSubAccountId: string | null;
}

/** The headline a card carries; the schedule is `GET /:id/recognition`. */
export interface CardRecognition {
  mode: RecognitionMode;
  method: RecognitionMethod | null;
  amount: string;
  recognized: string;
  closedAt: string | null;
  refundedAmount: string | null;
  refundedAt: string | null;
}

/** One row of the card's "Pengakuan pendapatan" table. */
export interface RecognitionRow {
  id: string | null;
  kind: "period" | "use" | "forfeit" | "closing" | "sale";
  key: string;
  label: string | null;
  date: string | null;
  amount: string;
  /** `planned` rows are projections from today's dates — not posted yet. */
  status: "posted" | "planned" | "reversed";
  journalEntryId: string | null;
}

export interface RecognitionSchedule {
  /** `legacy` — sold before recognition existed; nothing else is filled. */
  mode: RecognitionMode | "legacy";
  method?: RecognitionMethod | null;
  amount?: string;
  recognized?: string;
  remaining?: string;
  totalDays?: number;
  perDay?: string | null;
  closedAt?: string | null;
  refundedAmount?: string | null;
  refundedAt?: string | null;
  refundTransactionId?: string | null;
  revenueAccount?: string | null;
  unearnedAccount?: string | null;
  units?: { benefitId: string; label: string | null; qty: number; used: number; total: string; perUse: string }[];
  rows: RecognitionRow[];
}

export interface RecognitionSummary {
  recognition: RecognitionMode;
  unrecognized: string;
  cards: number;
}

export interface RecognitionRunResult {
  cards: number;
  posted: number;
  failures: { membershipId: string; number: string; message: string }[];
}

export interface RefundPreview {
  mode: RecognitionMode;
  method: RecognitionMethod | null;
  paid: string;
  recognized: string;
  /** What a straight-line card earns for the days of this month before the refund. */
  earnedNow: string;
  suggested: string;
  max: string;
}

export interface RefundMembershipInput {
  /** A Kas & Bank account. */
  accountId: string;
  /** Omit to refund the suggested amount. */
  amount?: string | null;
  reason: string;
  note?: string | null;
}

/** §2.1 — a plan as the API returns it. */
export interface MembershipPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  serviceKinds: string[];
  /** On a `variant` plan: the LOWEST variant price ("mulai dari"). */
  price: string;
  /** Fallback for `durationMonths`, or the real length of an old day-based plan. */
  durationDays: number;
  /** Wins when set. `null` = an old, day-based plan. */
  durationMonths: number | null;
  attachTo: AttachTo;
  /** Pet-option ids. `[]` = every species. */
  petSpecies: string[];
  priceMode: PlanPriceMode;
  variantPrices: VariantPrice[];
  eligibility: Eligibility;
  /** `[]` = sellable at every branch. */
  branchIds: string[];
  publicDisplay: PublicDisplay;
  renewalOfferDays: number;
  isActive: boolean;
  /** Pengakuan pendapatan — see `PlanAccounting`. */
  accounting?: PlanAccounting;
  benefits: MembershipBenefit[];
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  /**
   * List items only: cards on this plan that are not cancelled and cover now
   * (paused and unpaid count). Absent on detail/create/update.
   */
  activeMembers?: number;
}

/* ────────────────────────────────────────────────────── §3 cards */

/** A benefit with its live counters (§3.3) — what the card, the till and the pet profile read. */
export interface BenefitAvailability extends MembershipBenefit {
  /** No quota at all (`cap`/`used`/`remaining` are then null). */
  unlimited: boolean;
  usedTotal: number;
  usedThisPeriod: number;
  /** Null means unlimited, in both. Never confuse with 0, which means none left. */
  remainingTotal: number | null;
  remainingThisPeriod: number | null;
  capTotal: number | null;
  capThisPeriod: number | null;
  /**
   * The HEADLINE counter a chip prints ("1/2"): the period figures if the
   * benefit has `perPeriod`, else lifetime figures if it has `total`, else null.
   * Caps already include the current bucket's quota corrections.
   */
  cap: number | null;
  used: number | null;
  remaining: number | null;
  /** The correction (delta) counted in the bucket asked about. */
  adjustment: number;
  periodKey: string | null;
  /** 1-based on anniversary cards ("bulan ke-3"), null on calendar cards. */
  periodIndex: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** First instant of the next bucket; null past the card's end. */
  resetsAt: string | null;
  /** Only when `reason === "period_exhausted"` and the next bucket is inside the card. */
  nextAvailableAt: string | null;
  periodLabel: string | null;
  available: boolean;
  reason: BenefitUnavailableReason | null;
  /**
   * Unbilled bookings holding this quota (§3.3) — already off `remaining`.
   * `reserved` is the headline bucket's count (period, else lifetime), null
   * when unlimited; `reservedBy` names them.
   */
  reserved?: number | null;
  reservedBy?: MembershipReservation[];
}

/** The plan as it was SOLD — frozen into the card at issue (§3.1 `plan`). */
export interface MembershipPlanSnapshot {
  code: string | null;
  name: string | null;
  description: string | null;
  serviceKinds: string[];
  /** What THIS holder paid (the variant row on a variant plan). */
  price: string | null;
  durationDays: number | null;
  durationMonths: number | null;
  renewalOfferDays: number;
  attachTo: AttachTo;
  petSpecies: string[];
  priceMode: PlanPriceMode;
  variantPrices?: VariantPrice[];
  eligibility: Eligibility;
  branchIds?: string[];
  benefits: MembershipBenefit[];
}

/** Which month (or week) of an anniversary card we are in. Null on calendar cards. */
export interface MembershipCycle {
  index: number;
  of: number;
  start: string;
  end: string;
}

export interface MembershipPause {
  id: string;
  startDate: string;
  /** Exclusive: the pause covers `[startDate, endDate)`. */
  endDate: string;
  days: number;
  reason: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

export interface QuotaAdjustment {
  id: string;
  benefitId: string;
  /** Null for a total-only benefit (the lifetime cap). */
  periodKey: string | null;
  delta: number;
  reason: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

/** One row of the card's CHANGE LOG (§3.1 `history`), newest first. */
export interface MembershipHistoryEntry {
  id: string;
  at: string;
  by: string | null;
  byName: string | null;
  action: MembershipHistoryAction;
  /** Ready to print — "Ditunda 20 Okt 2026 selama 7 hari, …". */
  summary: string;
  reason: string | null;
  note: string | null;
}

/** §3.1 — a card. */
export interface PetMembership {
  id: string;
  number: string;
  attachTo: AttachTo;
  /** Null on a customer's card. */
  petId: string | null;
  petName: string | null;
  customerId: string;
  customerName: string | null;
  /** On the list, by-pet, expiring, detail and kelola reads. */
  customerPhone?: string | null;
  branchId: string | null;
  planId: string;
  plan: MembershipPlanSnapshot;
  status: MembershipStatus;
  /** `status === "active" && daysLeft <= 14`. */
  expiringSoon: boolean;
  periodMode: PeriodMode;
  /** The pet's key frozen at issue; null on customer / old cards. */
  variantKey: string | null;
  referralCode: string | null;
  awaitingPayment: boolean;
  /** When the money was agreed. Genuinely different from `startDate`. */
  purchasedAt: string;
  /** When cover begins. Never before `purchasedAt`. */
  startDate: string;
  endDate: string;
  daysLeft: number;
  cycle: MembershipCycle | null;
  /** Expired, or active with `daysLeft <= plan.renewalOfferDays`. */
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
  /** Null on a card sold before recognition existed, or issued by hand. */
  recognition?: CardRecognition | null;
  activePause: MembershipPause | null;
  /** In write order. */
  pauses: MembershipPause[];
  /** In write order. */
  quotaAdjustments: QuotaAdjustment[];
  /**
   * THE CHANGE LOG, newest first. ⚠️ BREAKING (V1): the detail endpoint used to
   * return the redemption ledger under this name; the ledger is `redemptions`.
   */
  history: MembershipHistoryEntry[];
  createdAt: string | null;
  updatedAt: string | null;
  /** Live counters — on the list, by-pet, detail and kelola reads. */
  benefits?: BenefitAvailability[];
  /** The ledger (up to 100 newest rows) — detail and kelola reads only. */
  redemptions?: MembershipRedemption[];
}

/** §3.4 — one ledger row. */
export interface MembershipRedemption {
  id: string;
  benefitId: string;
  benefitLabel: string | null;
  /** Null on rows written before options existed. */
  optionId: string | null;
  optionKind: OptionKind | null;
  /** May be null: a customer card, or a line without an animal. */
  petId: string | null;
  usedAt: string;
  /** Set the first time the row is moved ("Ubah tanggal pakai"). */
  originalUsedAt: string | null;
  movedAt: string | null;
  /** `M{k}`/`W{k}` on anniversary cards, `2026-10`/`2026-W41` on calendar ones. */
  periodKey: string | null;
  /** `-1` on a reversal row — that is how a void gives the quota back. */
  amount: number;
  value: string | null;
  context: RedemptionContext;
  posTransactionId: string | null;
  invoiceId: string | null;
  bookingId: string | null;
  lineIndex: number | null;
  reversedAt: string | null;
  reversedReason: string | null;
  reversalOf: string | null;
  /** POS receipt no., else invoice no., else booking no. Null for manual rows. */
  documentNumber?: string | null;
  /** The source line's name (receipt/invoice item, or the booking's service). */
  itemName?: string | null;
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

/** `GET /pet-memberships/by-pet/:petId`. */
export interface PetMembershipsByPet {
  petId: string;
  items: PetMembership[];
  /** The owner's customer-held cards — "Juga berlaku dari pelanggan". */
  customerCards: PetMembership[];
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
  /** `pet` also matches old plans. */
  attachTo?: AttachTo;
  /** `all` also matches old plans. */
  eligibility?: Eligibility;
}

export interface PetMembershipListQuery {
  page?: number;
  limit?: number;
  sort?: "newest" | "oldest" | "endingSoonest" | "endingLatest" | string;
  petId?: string;
  customerId?: string;
  planId?: string;
  branchId?: string;
  source?: "manual" | "invoice" | "pos";
  attachTo?: AttachTo;
  /** One or many, OR'd. */
  status?: MembershipStatusFilter[];
  /** 1–365; the default for `expiringSoon` is 14. */
  expiringWithinDays?: number;
  /** Only cards in `attention.unusedQuota` (14-day window). */
  hasUnusedQuota?: boolean;
  /** Card number, plan name, customer name/phone or pet name. */
  search?: string;
}

/* ──────────────────────────────────────────────── §2.4 plan writes */

/** One option as the builder sends it. Omit `id` for a new option. */
export interface BenefitOptionInput {
  id?: string;
  kind: OptionKind;
  scope: Partial<BenefitScope> & { target: BenefitTarget };
  value?: number | string | null;
  priceMode?: OptionPriceMode;
  variantPrices?: VariantPrice[];
  visitFee?: VisitFee;
}

/**
 * A benefit as it is written in a form.
 *
 * SEND EITHER `options` (the V1 shape; `kind` optional, `perk` refused with
 * options) OR a perk (`kind: "perk"`, no options). The legacy single-option
 * shape (`kind`/`scope`/`value` without options) is still accepted by the API
 * and kept here for old callers.
 */
export interface BenefitInput {
  /** Absent on a NEW benefit. Sending the id back is what preserves its history. */
  id?: string;
  label: string;
  kind?: BenefitKind;
  scope?: Partial<BenefitScope>;
  value?: number | string | null;
  quota?: Partial<BenefitQuota>;
  options?: BenefitOptionInput[];
}

export interface CreateMembershipPlanInput {
  /** Empty or absent → auto `MSP-0001`. */
  code?: string;
  name: string;
  description?: string | null;
  serviceKinds?: string[];
  /** Required unless `priceMode: "variant"`. */
  price?: string;
  /** `durationMonths` OR `durationDays` is required; months win. */
  durationMonths?: number | null;
  durationDays?: number;
  attachTo?: AttachTo;
  petSpecies?: string[];
  priceMode?: PlanPriceMode;
  variantPrices?: VariantPrice[];
  eligibility?: Eligibility;
  branchIds?: string[];
  publicDisplay?: Partial<PublicDisplay>;
  renewalOfferDays?: number;
  isActive?: boolean;
  accounting?: Partial<PlanAccounting>;
  /** On PATCH this REPLACES the whole list — send back ids to keep benefits. */
  benefits?: BenefitInput[];
}

export type UpdateMembershipPlanInput = Partial<CreateMembershipPlanInput>;

/* ──────────────────────────────────────────────── §3.6 card writes */

export interface IssueMembershipInput {
  planId: string;
  /** For a pet plan. The owner is always taken from the pet. */
  petId?: string | null;
  /** For a customer plan. */
  customerId?: string | null;
  branchId?: string | null;
  /** `"YYYY-MM-DD"`. */
  purchasedAt?: string;
  /** `"YYYY-MM-DD"`. */
  startDate?: string;
  referralCode?: string | null;
  note?: string | null;
}

export interface RenewMembershipInput {
  planId?: string;
  startDate?: string;
  purchasedAt?: string;
  referralCode?: string | null;
  note?: string | null;
}

/** `PATCH /:id/cancel` — `reason` is REQUIRED (send a Kelola reason). */
export interface CancelMembershipInput {
  reason: KelolaReason | string;
  note?: string | null;
}

/** Every Kelola body carries a reason and an optional note (§3.7). */
interface KelolaBase {
  reason: KelolaReason;
  note?: string | null;
}

/** `POST /:id/adjust-dates` — `date` is `"YYYY-MM-DD"`. */
export interface AdjustDatesInput extends KelolaBase {
  mode: "start" | "end";
  date: string;
}

/** `POST /:id/pause` — `days` 1–30, total paused days per card ≤ 30. */
export interface PauseMembershipInput extends KelolaBase {
  startDate: string;
  days: number;
}

/** `POST /:id/adjust-quota` — `delta` −99…99, not 0, one row per benefit. */
export interface AdjustQuotaInput extends KelolaBase {
  adjustments: Array<{ benefitId: string; delta: number }>;
}

/** `POST /:id/transfer` — pet cards only, same owner. */
export interface TransferMembershipInput extends KelolaBase {
  petId: string;
}

/** `POST /:id/redemptions/:rid/move` — `usedAt` is `"YYYY-MM-DD"` inside the card. */
export interface MoveRedemptionInput extends KelolaBase {
  usedAt: string;
}

/* ──────────────────────────────────────────────── §3.9 eligibility */

export type EligibilityReasonCode =
  | "plan_inactive"
  | "branch_not_allowed"
  | "species_not_allowed"
  | "variant_price_missing"
  | "not_new_customer"
  | "not_renewal"
  | "referral_required"
  | "overlap"
  | "pet_required"
  | "pet_not_owned";

export interface EligibilityReason {
  code: EligibilityReasonCode;
  field: string | null;
  message: string;
  /** On `overlap`: the card in the way. */
  card?: { id: string; number: string; startDate: string; endDate: string };
}

export interface MembershipEligibilityQuery {
  planId: string;
  customerId?: string;
  petId?: string;
  branchId?: string;
  startDate?: string;
  /** Send `""` to make `referral_required` blocking. */
  referralCode?: string;
}

export interface MembershipEligibility {
  ok: boolean;
  reasons: EligibilityReason[];
  planId: string;
  attachTo: AttachTo;
  petId: string | null;
  customerId: string | null;
  /** What this holder pays; null when the variant has no price. */
  price: string | null;
  variantKey: string | null;
  /** The holder's latest card not cancelled and not ended. */
  activeCard: {
    id: string;
    number: string;
    planName: string | null;
    startDate: string;
    endDate: string;
    status: MembershipStatus;
  } | null;
  /** `activeCard.endDate + 1 day`, else now — "Setelah yang aktif berakhir". */
  suggestedStartDate: string;
  startDate: string;
  endDate: string;
}

/* ──────────────────────────────────────────────── §3.10 attention */

/** The short card every attention row carries. */
export interface AttentionCard {
  id: string;
  number: string;
  attachTo: AttachTo;
  petId: string | null;
  petName: string | null;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  planId: string;
  planName: string | null;
  startDate: string;
  endDate: string;
  daysLeft: number;
  status: MembershipStatus;
}

export interface AttentionUnusedQuota {
  card: AttentionCard;
  benefit: { id: string; label: string; period: BenefitPeriod };
  used: number;
  /** Booking holds in this bucket — already taken off `remaining`. */
  reserved?: number;
  cap: number;
  remaining: number;
  periodStart: string;
  /** min(bucket end, card end). */
  periodEnd: string;
  daysLeft: number;
}

export interface MembershipAttention {
  withinDays: number;
  /** Active cards ending within the window, soonest first (max 100). */
  expiring: AttentionCard[];
  /** Week/month allowances with something left whose bucket closes in the window. */
  unusedQuota: AttentionUnusedQuota[];
}

export interface MembershipAttentionQuery {
  branchId?: string;
  /** 1–60, default 14. */
  withinDays?: number;
}

/* ──────────────────────────────────────────────── §3.11 summary */

export interface MembershipSummary {
  range: { dateFrom: string | null; dateTo: string | null };
  branchId: string | null;
  /** Non-cancelled cards by `purchasedAt` in range. */
  packagesSold: { count: number; revenue: string; renewals: number };
  /** Redemptions by `usedAt` in range, net of reversals. */
  benefitValue: { amount: string; uses: number; customers: number; pets: number };
  /** Cards covering NOW (`active` or `paused`) — not limited by the range. */
  activeMembers: { count: number; customers: number; pets: number };
}

export interface MembershipSummaryQuery {
  branchId?: string;
  /** `"YYYY-MM-DD"`, tenant timezone. */
  dateFrom?: string;
  dateTo?: string;
}

/* ──────────────────────────────────────────────── §4 quote */

/** One cart line, as the benefit engine wants to be asked about it. */
export interface BenefitQuoteLine {
  ref?: string;
  kind: "service" | "product" | "addon";
  refId: string;
  petId?: string | null;
  /** Line total BEFORE any discount, as a decimal string. */
  amount: string;
  /** Units (default 1) — multiplies a `special_price`. */
  qty?: number;
  categoryId?: string | null;
  serviceKind?: string | null;
  parentServiceId?: string | null;
  parentServiceKind?: string | null;
  serviceKinds?: string[];
  /** The animal's key, if the caller knows it. */
  variantKey?: string | null;
  /** This line IS the visit-fee (TRV) line of that home trip. */
  homeTripId?: string | null;
  /** The trip this service line's booking rides. */
  bookingHomeTripId?: string | null;
  /** The cashier's current pick — kept as `recommended` while still a candidate. */
  membershipId?: string | null;
  benefitId?: string | null;
  optionId?: string | null;
  /** "Tanpa member": nothing recommended, nothing consumed. */
  noBenefit?: boolean;
  bookingId?: string | null;
}

/** A package line in the same cart, not paid yet → a virtual card (§4.3). */
export interface BenefitQuotePackage {
  ref: string;
  planId: string;
  petId?: string | null;
  customerId?: string | null;
  startDate?: string | null;
}

export interface BenefitQuoteInput {
  customerId?: string;
  /** The instant quotas are judged at (default now). `date` is a synonym. */
  at?: string;
  date?: string;
  /** Accepted, reserved for the booking quota hold. */
  bookingId?: string | null;
  packages?: BenefitQuotePackage[];
  lines: BenefitQuoteLine[];
}

/** One covering option of a candidate — for a per-line option dropdown. */
export interface BenefitCandidateOption {
  optionId: string;
  optionKind: OptionKind;
  summary: string;
  discount: string;
  visitFee: VisitFee;
  visitFeeDiscount: string;
  units?: number;
}

export interface BenefitCandidate {
  membershipId: string;
  membershipNumber: string;
  /** From a package bought in the same cart. `membershipId` is then throw-away. */
  virtual: boolean;
  packageRef: string | null;
  planName: string | null;
  attachTo: AttachTo;
  benefitId: string;
  benefitLabel: string;
  optionId: string;
  optionKind: OptionKind;
  /** `quota` (the benefit has perPeriod or total) sorts before `unlimited`. */
  kind: "quota" | "unlimited";
  /** A ready default — "Jatah Grooming 0/1", "Member · Diskon 10%". */
  label: string;
  /** What it would take off this line, as a decimal string. */
  discount: string;
  visitFee: VisitFee;
  visitFeeDiscount: string;
  /** Already includes earlier lines of this cart. Null when unlimited. */
  used: number | null;
  cap: number | null;
  /** Quota uses this pick spends (>1 only for a free item on qty > 1). */
  units?: number;
  /** Booking holds inside `used`. Null when unlimited. */
  reserved?: number | null;
  options: BenefitCandidateOption[];
}

/** A live, unbilled booking holding a benefit's quota (§3.3 `reservedBy`). */
export interface MembershipReservation {
  bookingId: string;
  /** Null on a draft. */
  bookingNumber: string | null;
  scheduledAt: string;
  petId: string | null;
}

export interface BenefitQuoteUnavailable {
  membershipId: string;
  benefitId: string;
  benefitLabel: string;
  /** `reserved` = held by another booking (§3.3). */
  reason: QuoteUnavailableReason | "reserved";
  /** The server's sentence (§1) — "Jatah periode ini sudah dipesan booking lain". */
  message?: string;
  nextAvailableAt?: string | null;
  reservedBy?: MembershipReservation[];
}

/** A card as the quote describes it (real or virtual). */
export interface BenefitQuoteCard {
  id: string;
  number: string;
  virtual?: boolean;
  packageRef?: string | null;
  attachTo?: AttachTo;
  petId: string | null;
  customerId?: string | null;
  planId?: string;
  planName: string | null;
  planCode?: string | null;
  periodMode?: PeriodMode;
  variantKey?: string | null;
  status: MembershipStatus;
  purchasedAt?: string;
  startDate?: string;
  endDate?: string;
  daysLeft?: number;
  benefits: BenefitAvailability[];
}

export interface BenefitQuoteLineResult {
  ref: string | null;
  petId: string | null;
  /** `visit_fee` for a trip's TRV line. Absent on an older server = `item`. */
  lineType?: "item" | "visit_fee";
  homeTripId?: string | null;
  candidates: BenefitCandidate[];
  /** The first candidate, or the pinned pick; null on `noBenefit`. */
  recommended: BenefitCandidate | null;
  unavailable?: BenefitQuoteUnavailable[];
  /** On a visit-fee line: the waived amount ("0.0000" when not waived). */
  visitFeeDiscount?: string;
  /** On a visit-fee line: the service line whose pick waived it. */
  coveredByRef?: string | null;
  /** Phase B: the booking this line bills, and its agreed pick (main line only). */
  bookingId?: string | null;
  fromBooking?: boolean;
  plannedBenefit?: { membershipId: string; benefitId: string; optionId: string | null } | null;
  /** `recommended` is the booking's plan — show "sesuai booking". */
  plannedApplied?: boolean;
  /** A booking add-on agreed "Tanpa member" — quoted as `noBenefit` unless pinned. */
  plannedNoBenefit?: boolean;
}

export interface BenefitQuoteResponse {
  cards: BenefitQuoteCard[];
  lines: BenefitQuoteLineResult[];
}

/* ── §4.4 the booking form's shorthand (`context: "booking"`) ── */

/** One add-on under a booking entry. */
export interface BookingBenefitQuoteAddon {
  serviceId: string;
  amount: string;
  membershipId?: string | null;
  benefitId?: string | null;
  optionId?: string | null;
  noBenefit?: boolean;
}

/** One animal's booking; the server builds `<ref>`, `<ref>:addon:<i>`, `<ref>:visit`. */
export interface BookingBenefitQuoteEntry {
  ref: string;
  petId: string;
  serviceId: string;
  /** The form's price for the main service, before any discount. */
  amount: string;
  addons?: BookingBenefitQuoteAddon[];
  /** The home visit's fee — on ONE entry of a `visitGroup`. */
  visitFee?: string;
  visitGroup?: string;
  /** The current pick (radio). */
  membershipId?: string | null;
  benefitId?: string | null;
  optionId?: string | null;
  noBenefit?: boolean;
}

export interface BookingBenefitQuoteInput {
  context: "booking";
  customerId: string;
  /** The booking's `scheduledAt` — the period is the booking's, not today's. */
  date: string;
  /** The booking being edited — its own hold is not counted against it. */
  bookingId?: string | null;
  entries: BookingBenefitQuoteEntry[];
}

/* ──────────────────────────────────────────────── reports */

/**
 * Membership, in the three numbers that decide whether the programme works —
 * `GET /reports/membership` (dates only, no cabang).
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
   * One row per benefit actually spent. A BENEFIT NOBODY EVER USED HAS NO ROW —
   * that absence is what the screen has to make visible.
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
