"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card } from "@/components";
import { BookingStatusBadge } from "@/features/booking";
import { cn } from "@/lib/utils";
import type {
  Booking,
  BookingGroupMember,
  BookingStatus,
  TripLeg,
} from "@/types/api";

import { antarJemputDetailPath } from "../paths";
import { LEG_LABEL } from "../ride";

/**
 * "ANTAR JEMPUT INI DUA PERJALANAN" — 24 September 2026, on request.
 *
 * ─── THE PROBLEM IT ANSWERS ─────────────────────────────────────────────────
 *
 * Saving "Antar Jemput" writes TWO bookings, a Jemput and an Antar, each with
 * its own number, its own pair of addresses and its own page. Open one of them
 * and everything on the page speaks of one direction, so the page reads as a
 * one-way trip: a driver checking the Antar has no way of knowing the animal is
 * also being fetched in the morning, and somebody cancelling "the trip" cancels
 * half of it.
 *
 * The other half was findable — it sat in Booking terkait as "Satu kunjungan",
 * a row among the bookings the van serves and the ones it is billed with. That
 * is a list of RELATIONS; this is the SAME SERVICE, sold once, and it belongs
 * at the top of the page rather than filed under a heading three cards down.
 *
 * ─── WHAT MAKES TWO RIDES ONE ANTAR JEMPUT ──────────────────────────────────
 *
 * `groupId` — the visit. Both legs are saved into it (the delivery joins the
 * pickup's), and it is the only thing that says they were one decision.
 *
 * ⚠️ NOT `linkedBookingIds`, which is what a van SERVES — a grooming, a stay —
 * and never another van. The two are different questions and this card asks
 * only the first: the group's OTHER RIDES, however many, in the order they are
 * driven.
 *
 * ⚠️ A ONE-WAY TRIP GETS NO CARD. A van booked as Jemput alone has nothing to
 * say here, and a card reading "1 perjalanan" would be a heading over a fact
 * the page already carries in its Arah field.
 */
export function RoundTripCard({
  booking,
  /** Its `group[]`, already on the booking — no second read. */
  legs,
}: {
  booking: Booking;
  legs: BookingGroupMember[];
}) {
  /* Every ride of this visit, this one included, as the van drives them. */
  const rides: Leg[] = [...legs, booking]
    .filter((one) => Boolean(one.tripLeg))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  if (rides.length < 2) return null;

  return (
    <Card
      title="Satu Antar Jemput"
      action={
        <span className="text-sm tabular-nums text-muted">
          {rides.length} perjalanan
        </span>
      }
    >
      <p className="text-sm text-muted">
        Layanan ini dipesan sebagai Antar Jemput, jadi perjalanannya dua — hewan
        dijemput lalu diantar pulang. Masing-masing punya nomor, jadwal dan
        halamannya sendiri.
      </p>

      <ol className="mt-3 flex flex-col">
        {rides.map((leg) => {
          const here = leg._id === booking._id;

          return (
            <li
              key={leg._id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-2.5 first:border-t-0 first:pt-0 last:pb-0"
            >
              <span
                className={cn(
                  "w-fit rounded-full px-2 py-0.5 text-xs font-medium",
                  leg.tripLeg === "pickup"
                    ? "bg-tint-info text-info"
                    : "bg-tint-brand text-primary",
                )}
              >
                {LEG_LABEL[leg.tripLeg!]}
              </span>

              <span className="min-w-0 flex-1 text-sm tabular-nums text-foreground">
                {leg.bookingNumber ?? "Draf"}
                <span className="text-muted"> · {clock(leg.scheduledAt)}</span>
              </span>

              <BookingStatusBadge status={leg.status} tripLeg={leg.tripLeg} />

              {/* THE PAGE DOES NOT LINK TO ITSELF — it says which row it is. */}
              {here ? (
                <span className="text-xs font-semibold text-muted">Halaman ini</span>
              ) : (
                <Link
                  href={antarJemputDetailPath(leg._id)}
                  className="flex items-center gap-1 rounded-md text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Buka
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** As much of a booking as one row needs — a member of the group, or this one. */
type Leg = {
  _id: string;
  bookingNumber: string | null;
  tripLeg?: TripLeg | null;
  status: BookingStatus;
  scheduledAt: string;
};

/** "Sen 23 Sep 09.00" — the day and the clock the van leaves. */
function clock(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";

  const day = at.toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return `${day} ${String(at.getHours()).padStart(2, "0")}.${String(at.getMinutes()).padStart(2, "0")}`;
}
