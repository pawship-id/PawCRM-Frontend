/**
 * Public surface of the Grooming module — Layanan › Grooming.
 *
 * Three tabs, three routes: the booking board (`/dashboard/layanan/grooming`),
 * Layanan & Harga (`…/katalog`) and Pengaturan (`…/pengaturan` — commission and
 * capacity). Built from `buloo-grooming-v3.html` on the API as it stands.
 */
export { GroomingBookingsScreen } from "./components/GroomingBookingsScreen";
export { GroomingServicesScreen } from "./components/GroomingServicesScreen";
export { GroomingServiceDetailScreen } from "./components/GroomingServiceDetailScreen";
export { GroomingSettingsScreen } from "./components/GroomingSettingsScreen";
export { GroomingModuleHeader } from "./components/GroomingModuleHeader";
export { GROOMING_CATALOG_PATH } from "./paths";
