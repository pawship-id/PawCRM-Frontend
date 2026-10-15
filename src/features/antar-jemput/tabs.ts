import type { GatedTab } from "@/features/permissions";

import { ANTAR_JEMPUT_LINE } from "./line";

/**
 * Antar-Jemput's tabs as gated targets, for its landing route's redirect — a
 * role given Layanan & Harga or Pengaturan but not Booking lands on one of
 * those (14 October 2026).
 */
export const ANTAR_JEMPUT_TABS: GatedTab[] = [
  { label: "Booking", href: ANTAR_JEMPUT_LINE.paths.root, anyOf: [{ feature: "bookings" }] },
  {
    label: "Layanan & Harga",
    href: ANTAR_JEMPUT_LINE.paths.catalog,
    anyOf: [{ feature: "services" }],
  },
  {
    label: "Pengaturan",
    href: ANTAR_JEMPUT_LINE.paths.settings,
    anyOf: [{ feature: "serviceSettings" }],
  },
];
