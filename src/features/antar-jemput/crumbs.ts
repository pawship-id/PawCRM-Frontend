import type { Crumb } from "@/components";

/**
 * The trail every Antar-Jemput page hangs its heading from.
 *
 * Declared once so the screens cannot drift into two spellings of one ancestor
 * — the same reason `features/booking/crumbs.ts` exists.
 */
export const ANTAR_JEMPUT_CRUMBS: Crumb[] = [
  { label: "Layanan" },
  { label: "Antar-Jemput", href: "/dashboard/layanan/antar-jemput" },
];
