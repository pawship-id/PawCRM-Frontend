/**
 * Promo failures read exactly like membership's (ui-rules §9: a failed act is
 * a toast, one problem quoted whole, several counted) — the BE promo schema
 * carries Indonesian `.label()`s and messages, so the same reader applies.
 * One reader, not a copy of it.
 */
export { membershipFailure as promoFailure, type MembershipFailure as PromoFailure } from "@/features/memberships/errors";
