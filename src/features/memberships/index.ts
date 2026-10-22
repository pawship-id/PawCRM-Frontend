/**
 * Membership — packages, the cards animals hold, and what those cards may buy.
 *
 * MEMBERSHIP BELONGS TO AN ANIMAL. The tier a CUSTOMER holds lives on the
 * customer record (`customerType`) and is a different thing that keeps working
 * unchanged beside this.
 *
 * Every panel here is handed its own state by the page above it, exactly as the
 * Pelanggan tabs are: the module header belongs to the module, not to any one
 * screen.
 */
export { MembershipPlansPanel } from "./components/MembershipPlansPanel";
export { MembershipPlanForm } from "./components/MembershipPlanForm";
export { MembershipPlanDetail } from "./components/MembershipPlanDetail";
export { MembershipCardsPanel } from "./components/MembershipCardsPanel";
export { MembershipCardDetail } from "./components/MembershipCardDetail";
export { PetMembershipPanel } from "./components/PetMembershipPanel";
export { CustomerMembershipSection } from "./components/CustomerMembershipSection";
export { KelolaDialog, type KelolaTarget } from "./components/KelolaDialog";
export { JatahRows, JatahChips } from "./components/JatahRows";
export { IssueMembershipDialog } from "./components/IssueMembershipDialog";
export { MembershipStatusBadge, ToneBadge } from "./components/MembershipStatusBadge";
export { BenefitList } from "./components/BenefitList";
export {
  MembershipSubTabs,
  MEMBERSHIP_TABS,
} from "./components/MembershipSubTabs";

export { useMembershipPlans } from "./hooks/useMembershipPlans";
export { useMembershipPlan } from "./hooks/useMembershipPlan";
export { usePetMemberships } from "./hooks/usePetMemberships";
export { usePetMembershipCards } from "./hooks/usePetMembershipCards";
export { useCustomerMemberships } from "./hooks/useCustomerMemberships";
export { useMembershipCard } from "./hooks/useMembershipCard";
export { useBenefitQuote } from "./hooks/useBenefitQuote";

export {
  PROMOSI_HREF,
  PROMOSI_SUMMARY_HREF,
  MEMBERSHIP_HREF,
  MEMBERSHIP_PLANS_HREF,
  MEMBERSHIP_NEW_PLAN_HREF,
  MEMBERSHIP_CARDS_HREF,
  MEMBERSHIP_RENEWALS_HREF,
  cardHref,
  planEditHref,
  formatDate,
  formatDuration,
  formatPlanDuration,
  formatRupiah,
  planHref,
  quotaText,
  benefitChip,
  remainingLabel,
  STATUS_LABEL,
  STATUS_TONE,
  STATUS_HINT,
  EXPIRING_SOON_LABEL,
  ATTACH_TO_LABEL,
  ELIGIBILITY_LABEL,
  KELOLA_ACTIONS,
  KELOLA_REASON_OPTIONS,
  HISTORY_ACTION_LABEL,
  QUOTE_REASON_LABEL,
  REASON_LABEL,
  QUOTA_CHOICE_LABEL,
} from "./labels";
export {
  buildVariantKey,
  matchVariantPrice,
  parseVariantKey,
  serviceVariantKey,
  serviceVariantPrices,
  variantKeyLabel,
} from "./variantKey";
