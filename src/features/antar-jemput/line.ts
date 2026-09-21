import { pickLineByName, type ServiceLine } from "@/features/grooming/line";

import {
  ANTAR_JEMPUT_CATALOG_PATH,
  ANTAR_JEMPUT_FORM_ORIGIN,
  ANTAR_JEMPUT_NEW_PATH,
  ANTAR_JEMPUT_PATH,
  ANTAR_JEMPUT_SETTINGS_PATH,
} from "./paths";

/**
 * Layanan › Antar-Jemput, as the shared line screens read it — see
 * `ServiceLine`. A tenant names its lines freely, so "Antar Jemput",
 * "Antar-Jemput" and "Pickup & Delivery" are all this one.
 */
export const ANTAR_JEMPUT_LINE: ServiceLine = {
  formOrigin: ANTAR_JEMPUT_FORM_ORIGIN,
  title: "Antar-Jemput",
  noun: "antar-jemput",
  fallbackName: "Antar-Jemput",
  pick: (lines) =>
    pickLineByName(
      lines,
      ["antar jemput", "antar & jemput", "pickup & delivery", "pickup delivery"],
      ["antar", "jemput", "pickup"],
    ),
  paths: {
    root: ANTAR_JEMPUT_PATH,
    catalog: ANTAR_JEMPUT_CATALOG_PATH,
    settings: ANTAR_JEMPUT_SETTINGS_PATH,
    newBooking: ANTAR_JEMPUT_NEW_PATH,
  },
};
