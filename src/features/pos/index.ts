/**
 * Public surface of the POS feature (Kasir).
 *
 * The route imports `PosScreen` and nothing else — the till is one screen, and
 * every dialog and panel inside it exists only to serve that screen. A component
 * here becoming useful to another feature is the signal to export it, not a
 * reason to export it now.
 */
export { PosScreen } from "./components/PosScreen";
/*
 * The one thing in here a CUSTOMER opens (FR-8) — /struk/:token, outside the
 * dashboard entirely. Exported for the same reason `PosScreen` is: a route
 * imports it and nothing else.
 */
export { PublicReceiptScreen } from "./components/PublicReceiptScreen";
/*
 * POS OFFLINE MODE (19 October 2026): Kasir › Perlu dicek, and Pengaturan ›
 * Perangkat kasir — each a route of its own.
 */
export { OfflineReviewScreen } from "./components/OfflineReviewScreen";
export { PosDevicesScreen } from "./components/PosDevicesScreen";
