import type { ServiceLine } from "@/features/grooming/line";

import {
  HOTEL_BOOKINGS_PATH,
  HOTEL_CATALOG_PATH,
  HOTEL_NEW_BOOKING_PATH,
  HOTEL_PATH,
  HOTEL_SETTINGS_PATH,
} from "./paths";

/**
 * Layanan › Hotel, as the shared line screens read it — see `ServiceLine`
 * (21 November 2026). BO: "kalau mirip grooming, pakai flow yang sama" — the
 * same Layanan & Harga table and service page, minus a length (a night has
 * none) and plus a default clock time per tahapan.
 *
 * Its Ringkasan answers to `hotel:read`, not `serviceSummary`.
 */
export const HOTEL_LINE: ServiceLine = {
  serviceKind: "hotel",
  title: "Hotel",
  noun: "hotel",
  fallbackName: "Hotel",
  summaryFeature: "hotel",
  paths: {
    summary: HOTEL_PATH,
    root: HOTEL_BOOKINGS_PATH,
    catalog: HOTEL_CATALOG_PATH,
    settings: HOTEL_SETTINGS_PATH,
    newBooking: HOTEL_NEW_BOOKING_PATH,
  },
};
