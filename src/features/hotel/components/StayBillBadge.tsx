"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HotelStayBooking } from "@/types/api";
import { formatMoneyShort, toMinor } from "@/utils/decimal";

/**
 * Where a stay's bill stands — what is still to be billed at the till
 * (21 November 2026). Billing happens at the Kasir; this only says how much of
 * the stay has gone onto an invoice so far.
 */
export function stayBillState(booking: HotelStayBooking): {
  label: string;
  className: string;
} {
  if (booking.status === "cancelled")
    return { label: "—", className: "bg-transparent text-muted" };
  const billed = toMinor(booking.stay.billedAmount ?? "0") ?? 0n;
  const unbilled = toMinor(booking.stayFacts.unbilledAmount) ?? 0n;
  if (booking.stayFacts.inCart)
    return {
      label: "Tagihan terbuka di kasir",
      className: "bg-tint-info text-info",
    };
  if (unbilled <= 0n && billed > 0n)
    return {
      label: "Sudah ditagih",
      className: "bg-tint-success text-success",
    };
  if (billed > 0n) {
    return {
      label: `Sisa ${formatMoneyShort(booking.stayFacts.unbilledAmount)} belum ditagih`,
      className: "bg-tint-warning text-warning",
    };
  }
  return { label: "Belum ditagih", className: "bg-tint-neutral text-muted" };
}

export function StayBillBadge({ booking }: { booking: HotelStayBooking }) {
  const state = stayBillState(booking);
  if (state.label === "—") return <span className="text-sm text-muted">—</span>;
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", state.className)}
    >
      {state.label}
    </Badge>
  );
}
