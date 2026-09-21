/**
 * Public surface of the payment-channels feature (Pengaturan → Channel
 * Pembayaran).
 *
 * Pages import from here, never from deep component paths.
 *
 * THE SCREEN MOVED OUT OF KEUANGAN on 20 September 2026. Kas & Bank is an
 * accounting screen now — it lists the ledger accounts money sits in, and lives
 * in `features/accounting` with the rest of them. What is left here is the
 * channel register itself: the buttons a cashier presses, configured once.
 *
 * `CHANNEL_TYPE_LABELS` and `CHANNEL_TYPE_ORDER` are exported because the POS
 * payment panel (Fase 7) renders the same four tabs in the same order with the
 * same words — and two copies of that list is how the settings screen and the
 * till start disagreeing about what "EDC" is called.
 */
export { PaymentChannelsScreen } from "./components/PaymentChannelsScreen";
export { PaymentChannelsTable } from "./components/PaymentChannelsTable";
export { PaymentChannelForm } from "./components/PaymentChannelForm";
export {
  usePaymentChannelList,
  type PaymentChannelRow,
  type PaymentChannelListQueryState,
} from "./hooks/usePaymentChannelList";
export {
  CHANNEL_TYPE_LABELS,
  CHANNEL_TYPE_ORDER,
} from "./labels";
