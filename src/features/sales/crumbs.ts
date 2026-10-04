import type { Crumb } from "@/components";

/**
 * The trail every Sales & Invoice page hangs its heading from.
 *
 * Declared once so eight screens cannot drift into eight spellings of the same
 * ancestor — the same reason `features/purchasing/crumbs.ts` exists.
 *
 * TWO DEEP RATHER THAN THREE: `Dashboard / Faktur Penjualan`. The module does
 * have a landing page now — Ringkasan took `/dashboard/sales` on 29 September
 * 2026, and the invoices moved to `/dashboard/sales/invoice` — but a middle
 * crumb reading "Penjualan" would lead to a summary of a period, which is not
 * the ancestor of one bill. The trail names the list a document belongs to, and
 * the tab row above it is how somebody reaches the rest of the module.
 *
 * THE PAGE IS NAMED FOR THE DOCUMENT, NOT FOR ITS BALANCE. It held only
 * receivables while the till was the only writer, but every invoice PCR-030
 * raises is born unpaid and settles later — so "Piutang" would be a title that
 * stops being true for its own Lunas tab. Piutang is a LENS on this page (the
 * pill row) and a FIGURE on it (Total piutang berjalan), never its name.
 */
export const SALES_CRUMBS: Crumb[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Faktur Penjualan", href: "/dashboard/sales/invoice" },
];

/** The list itself — current page, so the last crumb carries no href. */
export const INVOICES_CRUMBS: Crumb[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Faktur Penjualan" },
];
