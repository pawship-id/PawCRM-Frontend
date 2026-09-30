import type { ServiceLine } from "@/features/grooming/line";

import {
  ANTAR_JEMPUT_CATALOG_PATH,
  ANTAR_JEMPUT_NEW_PATH,
  ANTAR_JEMPUT_PATH,
  ANTAR_JEMPUT_SETTINGS_PATH,
} from "./paths";

/**
 * Layanan › Antar-Jemput, as the shared line screens read it — see `ServiceLine`.
 *
 * IT NAMES A `serviceKind`, NOT A LINI BISNIS (30 September 2026). The screens
 * matched the tenant's freely-named line ("Antar Jemput", "Pickup & Delivery"…)
 * until then, which left a shop that keeps one line for everything with no
 * antar-jemput catalogue at all.
 */
export const ANTAR_JEMPUT_LINE: ServiceLine = {
  serviceKind: "pickup-delivery",
  title: "Antar-Jemput",
  noun: "antar-jemput",
  fallbackName: "Antar-Jemput",
  paths: {
    root: ANTAR_JEMPUT_PATH,
    catalog: ANTAR_JEMPUT_CATALOG_PATH,
    settings: ANTAR_JEMPUT_SETTINGS_PATH,
    newBooking: ANTAR_JEMPUT_NEW_PATH,
  },
};
