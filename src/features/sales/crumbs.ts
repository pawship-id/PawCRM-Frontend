import type { Crumb } from "@/components";

/**
 * The trail every Sales & Invoice page hangs its heading from.
 *
 * Declared once so eight screens cannot drift into eight spellings of the same
 * ancestor — the same reason `features/purchasing/crumbs.ts` exists.
 *
 * THE MODULE'S LANDING PAGE IS THE INVOICE LIST, not a hub, so the trail is two
 * deep rather than three: `Dashboard / Faktur Penjualan`. Mirroring Purchasing's
 * `Purchasing / Faktur Pembelian` exactly would need a hub page at
 * `/dashboard/sales` for the middle crumb to link to, and a crumb pointing at
 * the page you are already on is worse than one fewer crumb.
 *
 * THE PAGE IS NAMED FOR THE DOCUMENT, NOT FOR ITS BALANCE. It held only
 * receivables while the till was the only writer, but every invoice PCR-030
 * raises is born unpaid and settles later — so "Piutang" would be a title that
 * stops being true for its own Lunas tab. Piutang is a LENS on this page (the
 * pill row) and a FIGURE on it (Total piutang berjalan), never its name.
 */
export const SALES_CRUMBS: Crumb[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Faktur Penjualan", href: "/dashboard/sales" },
];

/** The list itself — current page, so the last crumb carries no href. */
export const INVOICES_CRUMBS: Crumb[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Faktur Penjualan" },
];
