import type { GatedTab } from "@/features/permissions";

import { GROOMING_LINE } from "./line";

/**
 * Grooming's tabs as gated targets, for the Ringkasan route's redirect — a role
 * given Booking but not Ringkasan lands on Booking (14 October 2026). The
 * header draws the same four from GroomingModuleHeader.
 */
export const GROOMING_TABS: GatedTab[] = [
  {
    label: "Ringkasan",
    href: GROOMING_LINE.paths.summary ?? GROOMING_LINE.paths.root,
    exact: true,
    anyOf: [{ feature: "serviceSummary" }],
  },
  {
    label: "Booking",
    href: GROOMING_LINE.paths.root,
    anyOf: [{ feature: "bookings" }],
  },
  {
    label: "Layanan & Harga",
    href: GROOMING_LINE.paths.catalog,
    anyOf: [{ feature: "services" }],
  },
  {
    label: "Pengaturan",
    href: GROOMING_LINE.paths.settings,
    anyOf: [{ feature: "serviceSettings" }],
  },
];
