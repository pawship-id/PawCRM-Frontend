import { apiClient } from "./api-client";
import type {
  AdjustDatesInput,
  AdjustQuotaInput,
  BenefitQuoteInput,
  BenefitQuoteResponse,
  BookingBenefitQuoteInput,
  CancelMembershipInput,
  CreateMembershipPlanInput,
  IssueMembershipInput,
  MembershipAttention,
  MembershipAttentionQuery,
  MembershipEligibility,
  MembershipEligibilityQuery,
  MembershipPlan,
  MembershipPlanListQuery,
  MembershipPlanListResponse,
  MembershipReport,
  MembershipSummary,
  MembershipSummaryQuery,
  MoveRedemptionInput,
  PauseMembershipInput,
  PetMembership,
  PetMembershipListQuery,
  PetMembershipListResponse,
  PetMembershipsByPet,
  RecognitionRunResult,
  RecognitionSchedule,
  RecognitionSummary,
  RefundMembershipInput,
  RefundPreview,
  RenewMembershipInput,
  TransferMembershipInput,
  UpdateMembershipPlanInput,
} from "@/types/membership";

/**
 * Membership, against /api/membership-plans and /api/pet-memberships — the V1
 * contract in PawCRM-Backend/docs/membership-v1.md, every endpoint of it.
 *
 * TWO RESOURCES, ONE FILE, because they are one module and never used apart:
 * every screen that lists cards also needs the packages behind them.
 *
 * BENEFITS HAVE NO CALLS OF THEIR OWN. A benefit is edited by sending the plan's
 * whole `benefits` array through `updatePlan` — the server matches each entry
 * (and each of its `options`) by the `id` it handed back, which is what keeps a
 * benefit's redemption history attached across an edit. Omit the id and you
 * have added a new one; leave one out and you have removed it.
 *
 * One typed operation per apiClient request, no React. The tenant comes from the
 * session cookie.
 */

/** The API's hard page-size cap (`LIST_MAX_LIMIT` on both models). */
const MAX_PAGE_LIMIT = 100;

export const membershipService = {
  /* ── the catalogue ───────────────────────────────────────────────── */

  listPlans: (query: MembershipPlanListQuery = {}) =>
    apiClient.get<MembershipPlanListResponse>("/membership-plans", {
      query: {
        ...query,
        limit: query.limit ? Math.min(query.limit, MAX_PAGE_LIMIT) : undefined,
      },
    }),

  getPlan: (id: string) => apiClient.get<MembershipPlan>(`/membership-plans/${id}`),

  createPlan: (input: CreateMembershipPlanInput) =>
    apiClient.post<MembershipPlan>("/membership-plans", input),

  updatePlan: (id: string, input: UpdateMembershipPlanInput) =>
    apiClient.patch<MembershipPlan>(`/membership-plans/${id}`, input),

  /**
   * Soft delete. REFUSED (409) while any card still runs on the plan — retiring
   * a package that has been sold is `updatePlan(id, { isActive: false })`, which
   * stops new sales and leaves every existing card working.
   */
  removePlan: (id: string) =>
    apiClient.delete<MembershipPlan>(`/membership-plans/${id}`),

  restorePlan: (id: string) =>
    apiClient.patch<MembershipPlan>(`/membership-plans/${id}/restore`, {}),

  /* ── the cards ───────────────────────────────────────────────────── */

  listMemberships: (query: PetMembershipListQuery = {}) =>
    apiClient.get<PetMembershipListResponse>("/pet-memberships", {
      query: {
        ...query,
        limit: query.limit ? Math.min(query.limit, MAX_PAGE_LIMIT) : undefined,
      },
    }),

  /**
   * Every card ONE animal holds, with live benefit counters.
   *
   * A SEPARATE CALL FROM `listMemberships({ petId })`, and the difference is the
   * weight: the list is a table and stays light, this one carries a benefit
   * ledger read per card and is drawn once, on one animal's profile.
   */
  listForPet: (petId: string) =>
    apiClient.get<PetMembershipsByPet>(`/pet-memberships/by-pet/${petId}`),

  /**
   * One card, WITH its live benefit counters, its ledger (`redemptions`) and
   * its change log (`history`). ⚠️ The ledger used to come back as `history`.
   */
  getMembership: (id: string) =>
    apiClient.get<PetMembership>(`/pet-memberships/${id}`),

  /**
   * Issue a card by hand — `petId` for a pet plan, `customerId` for a customer
   * plan.
   *
   * 409 when the holder already has a card of ANY plan overlapping the dates
   * (`details[0].field = "startDate"`, `reason` names the card in the way), or
   * when the buyer rule refuses ("Tidak memenuhi syarat paket"). Ask
   * `eligibility` first to offer the right start date instead of a refusal.
   */
  issue: (input: IssueMembershipInput) =>
    apiClient.post<PetMembership>("/pet-memberships", input),

  /**
   * Withdraw a card. `reason` IS REQUIRED (send a Kelola reason). REFUSED once
   * any benefit has been used on it: the card is what explains why a service
   * was free, and deleting that explanation after the fact erases a discharged
   * debt.
   */
  cancel: (id: string, input: CancelMembershipInput) =>
    apiClient.patch<PetMembership>(`/pet-memberships/${id}/cancel`, input),

  /**
   * Sell the next card in the chain. A NEW card with its own number, never an
   * edit of the old one.
   *
   * Cover CONTINUES from the day after the current card ends when it has not
   * lapsed yet, so renewing early costs the customer nothing.
   */
  renew: (id: string, input: RenewMembershipInput = {}) =>
    apiClient.post<PetMembership>(`/pet-memberships/${id}/renew`, input),

  /* ── kelola (§3.7) — permission `petMemberships:manage` ──────────────
     Every one takes a Kelola `reason`, appends a `history` row, and answers
     with the FULL detail card — so the caller swaps its state for the
     response rather than re-fetching. */

  /**
   * Move the start (only while nothing was ever spent) or the end (not before
   * today) of a card. `date` is `"YYYY-MM-DD"`.
   */
  adjustDates: (id: string, input: AdjustDatesInput) =>
    apiClient.post<PetMembership>(`/pet-memberships/${id}/adjust-dates`, input),

  /** Freeze a card for `days` (1–30, ≤ 30 in total); its end moves out by as many. */
  pause: (id: string, input: PauseMembershipInput) =>
    apiClient.post<PetMembership>(`/pet-memberships/${id}/pause`, input),

  /** Add or take back allowance in the CURRENT bucket (or the lifetime cap). */
  adjustQuota: (id: string, input: AdjustQuotaInput) =>
    apiClient.post<PetMembership>(`/pet-memberships/${id}/adjust-quota`, input),

  /** Move a pet card to another animal of the same owner. */
  transfer: (id: string, input: TransferMembershipInput) =>
    apiClient.post<PetMembership>(`/pet-memberships/${id}/transfer`, input),

  /**
   * "Ubah tanggal pakai" — re-date one ledger row inside the card. 409 when the
   * target period is full (suggest Koreksi jatah).
   */
  moveRedemption: (id: string, redemptionId: string, input: MoveRedemptionInput) =>
    apiClient.post<PetMembership>(
      `/pet-memberships/${id}/redemptions/${redemptionId}/move`,
      input,
    ),

  /** Only `note` and `branchId` are editable on a card. */
  updateMembership: (id: string, input: { note?: string | null; branchId?: string | null }) =>
    apiClient.patch<PetMembership>(`/pet-memberships/${id}`, input),

  /* ── questions (§3.9–3.11) ──────────────────────────────────────── */

  /**
   * "May this holder buy this plan, from when, and for how much?" — the sell
   * dialog asks before issuing. `price` is what THIS pet pays on a variant plan.
   */
  eligibility: (query: MembershipEligibilityQuery) =>
    apiClient.get<MembershipEligibility>("/pet-memberships/eligibility", {
      query: { ...query },
    }),

  /**
   * "Perlu tindakan": cards ending within `withinDays` (default 14) and
   * week/month allowances that will lapse unused in that window.
   */
  attention: (query: MembershipAttentionQuery = {}) =>
    apiClient.get<MembershipAttention>("/pet-memberships/attention", {
      query: { ...query },
    }),

  /* ── pengakuan pendapatan (PLAN-Membership-Pengakuan-Pendapatan.md) ── */

  /** The card's schedule — what has been posted, and on a straight-line card what is still to come. */
  recognition: (id: string) =>
    apiClient.get<RecognitionSchedule>(`/pet-memberships/${id}/recognition`),

  /** "Saldo membership belum diakui". */
  recognitionSummary: (query: { branchId?: string } = {}) =>
    apiClient.get<RecognitionSummary>("/pet-memberships/recognition/summary", {
      query: { ...query },
    }),

  /** The month-end job, by hand. Idempotent — a month already posted is skipped. */
  runRecognition: (input: { branchId?: string | null } = {}) =>
    apiClient.post<RecognitionRunResult>("/pet-memberships/recognition/run", input),

  refundPreview: (id: string) =>
    apiClient.get<RefundPreview>(`/pet-memberships/${id}/refund-preview`),

  /** Pays the refund, cancels the card, returns its detail and the BKK/BBK. */
  refund: (id: string, input: RefundMembershipInput) =>
    apiClient.post<{ membership: PetMembership; transaction: { id: string; number: string } }>(
      `/pet-memberships/${id}/refund`,
      input,
    ),

  /** The Ringkasan tiles: packages sold, benefit value spent, active members. */
  summary: (query: MembershipSummaryQuery = {}) =>
    apiClient.get<MembershipSummary>("/pet-memberships/summary", {
      query: { ...query },
    }),

  /** The renewal list, most urgent first, with the owner's phone number. */
  expiring: (query: { page?: number; limit?: number; withinDays?: number } = {}) =>
    apiClient.get<PetMembershipListResponse>("/pet-memberships/expiring", {
      query,
    }),

  /**
   * GET /reports/membership — what the packages brought in and gave away.
   *
   * ONE CALL FOR ALL THREE BLOCKS, because the headline is DERIVED from the
   * per-plan rows: split across calls, a screen could show a summary taken at a
   * different instant from the table under it.
   */
  report: (query: { dateFrom?: string; dateTo?: string } = {}) =>
    apiClient.get<MembershipReport>("/reports/membership", { query }),

  /**
   * "For this cart, what could this customer be given?" — per line, every
   * candidate (jatah first, then unlimited), the recommended one, and why the
   * others cannot be used. `packages` turns unpaid package lines into virtual
   * cards (§4.3).
   *
   * WRITES NOTHING. A POST only because it carries a cart in its body, which a
   * GET cannot. Safe to call on every edit of a cart that has not been saved.
   */
  quote: (input: BenefitQuoteInput) =>
    apiClient.post<BenefitQuoteResponse>("/pet-memberships/quote", input),

  /**
   * The booking form's shorthand (§4.4): one entry per animal, the server
   * builds the lines from the catalogue. Same engine, same response shape —
   * plus `context: "booking"`.
   */
  quoteBooking: (input: BookingBenefitQuoteInput) =>
    apiClient.post<BenefitQuoteResponse>("/pet-memberships/quote", input),
};
