"use client";

import Link from "next/link";
import { ArrowRight, House, MapPin } from "lucide-react";

import { Card } from "@/components";
import { Badge } from "@/components/ui/badge";
import type { Booking } from "@/types/api";

import { HOME_TRIP_LABELS } from "../homeTrip";
import { homeTripPath } from "../paths";

/** "Buka di peta" target — only when the address carries a pin. */
function mapsHref(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

/**
 * THE VISIT ADDRESS AND WHERE THE TRIP STANDS (10 October 2026) — only for a
 * booking whose `location` is `in_home`, and not drawn at all otherwise.
 *
 * A SUMMARY AND A LINK since 11 October 2026: the timeline, the buttons and
 * the performer moved to the trip's own page (`HomeTripDetailScreen`), because
 * one trip serves several bookings and was being drawn once per animal.
 *
 * Titled "Kunjungan ke rumah" because the card above it already owns
 * "Kunjungan" (the appointment). NO ZONE AND NO FEE here: both belong to the
 * journey, and the trip's page shows them (11 October 2026, on request).
 */
export function HomeVisitCard({ booking }: { booking: Booking }) {
  const trip = booking.homeTrip ?? null;
  const address = booking.visitAddress;
  const href = address ? mapsHref(address.lat, address.lng) : null;

  return (
    <Card title="Kunjungan ke rumah">
      <div className="flex items-start gap-2 text-sm">
        <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">
            {address?.address ?? "Alamat belum dicatat"}
          </p>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
            >
              Buka di peta
            </a>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
        {trip ? (
          <>
            <Badge
              variant="outline"
              className={
                trip.status === "cancelled"
                  ? "border-transparent bg-tint-danger text-danger"
                  : "border-transparent bg-tint-info text-info"
              }
            >
              <House className="size-4" aria-hidden />
              {HOME_TRIP_LABELS[trip.status]}
            </Badge>
            <Link
              href={homeTripPath(trip._id)}
              className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-2 hover:underline"
            >
              Lihat perjalanan
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </>
        ) : (
          /* A booking made before trips existed — nothing to open. */
          <p className="text-sm text-muted">Booking ini belum punya catatan perjalanan.</p>
        )}
      </div>
    </Card>
  );
}
