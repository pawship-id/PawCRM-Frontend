/**
 * Public surface of the booking feature.
 *
 * `/dashboard/booking` is the list screen; `/dashboard/booking/new` is where a
 * booking is taken. That used to be a dialog on the list and outgrew it when a
 * booking could hold several animals — see `BookingCreateForm`.
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
export { BookingDetailScreen } from "./components/BookingDetailScreen";
export { BookingCalendarScreen } from "./components/BookingCalendarScreen";
export { BookingCreateForm } from "./components/BookingCreateForm";
export { BookingStatusActions } from "./components/BookingStatusActions";
export { BookingHistoryDialog } from "./components/BookingHistoryDialog";
export {
  BOOKING_STATUS_ACTIONS,
  canCancel,
  forwardStatuses,
  impliedStatuses,
} from "./statusFlow";
export { BOOKING_CRUMBS, BOOKINGS_CRUMBS } from "./crumbs";
