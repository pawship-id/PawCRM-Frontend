/**
 * Public surface of the booking feature.
 *
 * `/dashboard/booking` is the list screen plus the dialog that takes a booking.
 * The Booking module proper — a calendar, a groomer roster, clash detection — is
 * still ahead and is built on top of this collection rather than replacing it.
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

export { BookingsScreen } from "./components/BookingsScreen";
export { BookingCreateDialog } from "./components/BookingCreateDialog";
export { BookingStatusActions } from "./components/BookingStatusActions";
export { BookingHistoryDialog } from "./components/BookingHistoryDialog";
export {
  BOOKING_STATUS_ACTIONS,
  canCancel,
  forwardStatuses,
  impliedStatuses,
} from "./statusFlow";
