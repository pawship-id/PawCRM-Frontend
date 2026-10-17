/**
 * Promosi — the module that sets every member price and allowance (V1:
 * membership only; loyalti, promo and voucher come later).
 *
 * The membership screens themselves live in `features/memberships`; this
 * feature owns the module chrome and its front page.
 */
export {
  PromosiModuleHeader,
  PROMOSI_TABS,
} from "./components/PromosiModuleHeader";
export { PromosiSummaryScreen } from "./components/PromosiSummaryScreen";
