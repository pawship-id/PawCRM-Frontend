/**
 * Public surface of the booking feature.
 *
 * `/dashboard/booking` is the list screen; `/dashboard/booking/new` is where
 * bookings are taken — one card per booking, one animal and one main service
 * each — and `/dashboard/booking/:id` is one booking, whole. See `BookingForm`
 * and `BookingDetailScreen`.
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
export { BookingForm } from "./components/BookingForm";
export { BookingStatusActions } from "./components/BookingStatusActions";
export {
  BOOKING_STATUS_ACTIONS,
  canCancel,
  canReschedule,
  canStartWork,
  forwardStatuses,
  hasCompletedWork,
  impliedStatuses,
  ladderFor,
  transitionsFor,
  type BookingLike,
} from "./statusFlow";
export { BOOKING_CRUMBS, BOOKINGS_CRUMBS } from "./crumbs";
