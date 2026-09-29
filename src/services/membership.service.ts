import { apiClient } from "./api-client";
import type {
  BenefitQuoteLine,
  BenefitQuoteResponse,
  CreateMembershipPlanInput,
  IssueMembershipInput,
  MembershipPlan,
  MembershipPlanListQuery,
  MembershipPlanListResponse,
  PetMembership,
  PetMembershipListQuery,
  PetMembershipListResponse,
  RenewMembershipInput,
  UpdateMembershipPlanInput,
} from "@/types/membership";

/**
 * Membership, against /api/membership-plans and /api/pet-memberships.
 *
 * TWO RESOURCES, ONE FILE, because they are one module and never used apart:
 * every screen that lists cards also needs the packages behind them.
 *
 * BENEFITS HAVE NO CALLS OF THEIR OWN. A benefit is edited by sending the plan's
 * whole `benefits` array through `updatePlan` — the server matches each entry by
 * the `key` it hands back, which is what keeps a benefit's redemption history
 * attached to it across an edit. Omit the key and you have added a new benefit;
 * leave one out and you have removed it.
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
    apiClient.get<{ petId: string; items: PetMembership[] }>(
      `/pet-memberships/by-pet/${petId}`,
    ),

  /** One card, WITH its live benefit counters and its spend history. */
  getMembership: (id: string) =>
    apiClient.get<PetMembership>(`/pet-memberships/${id}`),

  /**
   * Issue a card by hand.
   *
   * 409 when the animal already holds a live card for this plan — the error
   * carries the existing card's end date, so the caller offers "Perpanjang"
   * rather than simply refusing.
   */
  issue: (input: IssueMembershipInput) =>
    apiClient.post<PetMembership>("/pet-memberships", input),

  /**
   * Withdraw a card. REFUSED once any benefit has been used on it: the card is
   * what explains why a service was free, and deleting that explanation after
   * the fact erases a discharged debt.
   */
  cancel: (id: string, reason?: string) =>
    apiClient.patch<PetMembership>(`/pet-memberships/${id}/cancel`, { reason }),

  /**
   * Sell the next card in the chain. A NEW card with its own number, never an
   * edit of the old one.
   *
   * Cover CONTINUES from the day after the current card ends when it has not
   * lapsed yet, so renewing early costs the customer nothing.
   */
  renew: (id: string, input: RenewMembershipInput = {}) =>
    apiClient.post<PetMembership>(`/pet-memberships/${id}/renew`, input),

  /** The renewal list, most urgent first, with the owner's phone number. */
  expiring: (query: { page?: number; limit?: number; withinDays?: number } = {}) =>
    apiClient.get<PetMembershipListResponse>("/pet-memberships/expiring", {
      query,
    }),

  /**
   * "For this cart, what could this customer be given?"
   *
   * WRITES NOTHING. A POST only because it carries a cart in its body, which a
   * GET cannot. Safe to call on every edit of a cart that has not been saved.
   */
  quote: (input: {
    customerId?: string;
    at?: string;
    lines: BenefitQuoteLine[];
  }) => apiClient.post<BenefitQuoteResponse>("/pet-memberships/quote", input),
};
