/**
 * Public surface of the booking feature.
 *
 * NO LIST SCREEN AND NO ROUTE YET, deliberately: Fase 4 of the POS plan builds
 * the Booking Bridge and nothing else. `/dashboard/booking` keeps its
 * placeholder until the Booking module proper — with a calendar, a roster and
 * clash detection — is built on top of this.
 *
 * `BookingBridgeDialog` is what the POS cart panel mounts in Fase 6.
 */
export { BookingBridgeDialog } from "./components/BookingBridgeDialog";
export { AddServiceTab } from "./components/AddServiceTab";
export {
  BookingStatusBadge,
  BOOKING_STATUS_LABELS,
} from "./components/BookingStatusBadge";
export { useBookingBridge } from "./hooks/useBookingBridge";
