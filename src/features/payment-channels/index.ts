/**
 * Public surface of the payment-channels feature (Keuangan → Kas & Bank).
 *
 * Pages import from here, never from deep component paths.
 *
 * `CHANNEL_TYPE_LABELS` and `CHANNEL_TYPE_ORDER` are exported because the POS
 * payment panel (Fase 7) renders the same four tabs in the same order with the
 * same words — and two copies of that list is how the settings screen and the
 * till start disagreeing about what "EDC" is called.
 */
export {
  KasBankScreen,
  type KasBankSection,
} from "./components/KasBankScreen";
export { PaymentChannelForm } from "./components/PaymentChannelForm";
export {
  useCashAccounts,
  type CashAccountRow,
  type CashAccountsQuery,
} from "./hooks/useCashAccounts";
export {
  CHANNEL_TYPE_LABELS,
  CHANNEL_TYPE_ORDER,
} from "./hooks/usePaymentChannels";
