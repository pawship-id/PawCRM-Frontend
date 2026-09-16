/**
 * Public surface of the booking feature.
 *
 * `/dashboard/booking` is HARI INI — the day board, every line of business on
 * one screen (`TodayScreen`); `/dashboard/booking/kalender` is the same day as
 * an hour grid per groomer; `/dashboard/booking/new` is where bookings are
 * taken — one card per booking, one animal and one main service each — and
 * `/dashboard/booking/:id` is one booking, whole.
 *
 * THE PAGED LIST THAT USED TO LIVE AT `/dashboard/booking` IS GONE (16
 * September 2026, on request). Searching a booking by animal or number, the
 * "belum ditagih" lens and the status filters live on the per-line boards —
 * Layanan › Grooming — which is where somebody goes looking for one.
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

export { TodayScreen } from "./components/TodayScreen";
export { BookingSessionSteps } from "./components/BookingSessionSteps";
export { BILLING_BADGES, billingOf, type BillingState } from "./billing";
export * from "./today";
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
export { BOOKING_CRUMBS, TODAY_CRUMBS } from "./crumbs";
