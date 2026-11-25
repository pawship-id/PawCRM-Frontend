"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { hotelStayService } from "@/services/hotel.service";
import type { HotelStayBooking } from "@/types/api";
import { formatMoney } from "@/utils/decimal";

import { hotelBookingPath } from "../paths";
import { STAY_STATUS, roomText, shortDate } from "../stay";

/**
 * A pet's stays in the hotel, newest first — on its profile's Riwayat tab
 * (21 November 2026, PLAN-Hotel-V1.md §4.5). Renders nothing for an animal that
 * has never stayed, so a shop without the hotel sees no empty card.
 */
export function PetHotelHistory({ petId }: { petId: string }) {
  const [stays, setStays] = useState<HotelStayBooking[] | null>(null);

  useEffect(() => {
    let active = true;
    hotelStayService
      .list({ petId })
      .then((result) => {
        if (active) setStays(result.items);
      })
      .catch(() => {
        if (active) setStays([]);
      });
    return () => {
      active = false;
    };
  }, [petId]);

  if (stays === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner size={16} /> Memuat riwayat hotel…
      </div>
    );
  }
  if (stays.length === 0) return null;

  const sorted = [...stays].sort((a, b) =>
    a.stay.checkInDate < b.stay.checkInDate ? 1 : -1,
  );

  return (
    <Card title="Riwayat hotel" description={`${stays.length} kali menginap`}>
      <ul className="divide-y divide-border">
        {sorted.map((booking) => {
          const status = STAY_STATUS[booking.status] ?? STAY_STATUS.confirmed;
          return (
            <li key={booking._id}>
              <Link
                href={hotelBookingPath(booking._id)}
                className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-2 text-sm transition hover:bg-surface-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span>
                  <span className="font-medium tabular-nums">
                    {shortDate(booking.stay.checkInDate)} –{" "}
                    {shortDate(booking.stayFacts.end)}
                  </span>
                  <span className="ml-1 text-muted">
                    · {booking.stayFacts.nights} malam ·{" "}
                    {roomText(booking.stay)}
                  </span>
                  <span className="block text-xs text-muted tabular-nums">
                    {booking.bookingNumber ?? "—"}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">
                    {formatMoney(booking.netAmount)}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn("border-transparent", status.className)}
                  >
                    {status.label}
                  </Badge>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
