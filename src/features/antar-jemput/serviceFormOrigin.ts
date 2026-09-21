import { GROOMING_CATALOG_PATH } from "@/features/grooming/paths";

import { ANTAR_JEMPUT_CATALOG_PATH, ANTAR_JEMPUT_FORM_ORIGIN } from "./paths";

/**
 * The service form's `?dari=`, turned into the list it returns to. A CLOSED
 * MAP, never the raw value: a query string must not be able to send somebody
 * anywhere a link can be typed.
 */
export function serviceListPathFor(dari: string | string[] | undefined): string {
  return dari === ANTAR_JEMPUT_FORM_ORIGIN ? ANTAR_JEMPUT_CATALOG_PATH : GROOMING_CATALOG_PATH;
}
