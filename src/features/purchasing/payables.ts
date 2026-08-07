import * as demo from "@/features/inventory/data/demoStore";
import type { PurchaseInvoice } from "@/types/purchasing";
import { daysUntil } from "@/utils/date";
import { sumDecimals } from "@/utils/decimal";

/**
 * The two questions the payables data gets asked, in one place.
 *
 * "Which invoices are already late" and "which fall due in the next few days"
 * are asked by BOTH the payables table and the purchasing hub, and they are the
 * kind of predicate that drifts silently when copied: an `<= 0` where the other
 * screen wrote `< 0` moves a whole day's invoices between the two lists, and
 * nothing on either screen would look broken. Defining them once means the hub's
 * count and the table's filter cannot disagree.
 *
 * A PAID INVOICE IS NEITHER, whatever its dates say. `dueDate` keeps its value
 * after settlement, so a filter that only read the calendar would report every
 * invoice ever paid late as still outstanding.
 */

/** Past its due date and not settled. */
export function isOverdue(invoice: PurchaseInvoice): boolean {
  return invoice.status !== "paid" && daysUntil(invoice.dueDate) < 0;
}

/**
 * Falls due within the next `days`, today included, and not yet late.
 *
 * Overdue is deliberately EXCLUDED rather than folded in: the two lists are read
 * side by side on the hub, and an invoice appearing in both would be counted
 * twice by a reader adding up what they owe.
 */
export function isDueWithin(invoice: PurchaseInvoice, days: number): boolean {
  if (invoice.status === "paid") return false;
  const remaining = daysUntil(invoice.dueDate);
  return remaining >= 0 && remaining <= days;
}

/** Sorted longest-overdue first — the oldest due date leads. */
export function overdueInvoices(
  invoices: PurchaseInvoice[],
): PurchaseInvoice[] {
  return invoices
    .filter(isOverdue)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Sorted most urgent first — the earliest due date leads. */
export function dueWithinInvoices(
  invoices: PurchaseInvoice[],
  days: number,
): PurchaseInvoice[] {
  return invoices
    .filter((invoice) => isDueWithin(invoice, days))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Σ of what is still owed on the given invoices. */
export function outstandingTotal(invoices: PurchaseInvoice[]): string {
  return sumDecimals(invoices.map((invoice) => demo.outstandingOf(invoice)));
}
