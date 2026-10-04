import type { Booking } from "@/types/api";

import { hasCompletedWork } from "./statusFlow";

/**
 * Where one booking's bill stands.
 *
 * NOT `booking.billingState`, which is only billed / unbilled: this tells an
 * invoice from a settled sale from a basket still open, and only calls FINISHED
 * work unbilled.
 *
 * `unbilled` IS NARROWER THAN THE SERVER'S `unbilled` FILTER, on purpose: the
 * question a day sheet asks is "what has been DONE and nobody has charged for",
 * while the list filter also counts an appointment for tomorrow. A dog still on
 * the table is not yet money the shop forgot.
 *
 * ─── IT LIVES IN `features/booking` BECAUSE TWO BOARDS READ IT ─────────────
 *
 * It was the Grooming board's alone (`features/grooming/board.ts`, which still
 * re-exports it so its call sites are unchanged). Hari Ini needs the same five
 * answers, and features/grooming already depends on features/booking — so the
 * shared half moves DOWN the dependency, never sideways (§14).
 */
export type BillingState = "invoiced" | "paid" | "in_cart" | "unbilled" | "not_due";

export function billingOf(
  booking: Pick<
    Booking,
    | "status"
    | "posTransactionId"
    | "pulledToCartAt"
    | "pulledToInvoiceAt"
    | "pickupRequested"
    | "deliveryRequested"
  >,
): BillingState {
  if (booking.pulledToInvoiceAt) return "invoiced";
  /*
    A CLAIM WITH NO SALE BEHIND IT IS A BASKET STILL OPEN. The till marks a
    booking `pulledToCartAt` the moment it is put in the basket, and writes the
    transaction only when somebody pays — so the two fields together tell
    "waiting at the counter" from "paid for".
  */
  if (booking.pulledToCartAt) return booking.posTransactionId ? "paid" : "in_cart";
  if (booking.status === "cancelled") return "not_due";

  return hasCompletedWork(booking) ? "unbilled" : "not_due";
}

/**
 * What each state is CALLED, and its tint — §9's one badge convention.
 *
 * `not_due` IS NULL RATHER THAN A WORD. "Belum ditagih" on a dog booked for
 * Thursday would be a reproach for work nobody has done yet; nothing owed is
 * nothing to say.
 */
export const BILLING_BADGES: Record<
  BillingState,
  { label: string; className: string } | null
> = {
  invoiced: { label: "Difakturkan", className: "bg-tint-success text-success" },
  paid: { label: "Dibayar", className: "bg-tint-success text-success" },
  in_cart: { label: "Di keranjang", className: "bg-tint-info text-info" },
  unbilled: {
    label: "Belum ditagih",
    className: "bg-tint-danger font-semibold text-danger",
  },
  not_due: null,
};
