import { House, MapPin, Navigation } from "lucide-react";

import { Button } from "@/components";
import { HOME_TRIP_LABELS } from "@/features/booking/homeTrip";
import type { GroomerBooking } from "@/types/groomer";
import { Pill } from "./Pill";

/**
 * WHERE THE GROOMER GOES (10 October 2026) — the badge, the address and the
 * trip's current rung, for a home booking only. Draws nothing for a salon one.
 *
 * No money here: the visit fee is a priced line and never reaches this payload.
 */
export function HomeVisitInfo({ booking }: { booking: GroomerBooking }) {
  if (booking.location !== "in_home") return null;

  const address = booking.visitAddress;
  const pinned = address?.lat != null && address?.lng != null;
  const status = booking.homeTrip?.status ?? null;

  return (
    <div className="mt-3 rounded-lg border border-border px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone="info" icon={<House className="size-3" aria-hidden="true" />}>
          Di rumah pelanggan
        </Pill>
        {status && (
          <Pill tone={status === "cancelled" ? "danger" : "neutral"}>
            {HOME_TRIP_LABELS[status]}
          </Pill>
        )}
      </div>

      <p className="mt-1.5 flex items-start gap-1.5 text-sm">
        <MapPin className="mt-0.5 size-4 flex-none text-muted" aria-hidden="true" />
        <span className="min-w-0">{address?.address ?? "Alamat belum dicatat"}</span>
      </p>

      {pinned && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address!.lat},${address!.lng}`)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
        >
          Buka di peta
        </a>
      )}
    </div>
  );
}

/**
 * THE ONE BUTTON THE TRIP OFFERS — its word is the server's `nextLabel`, and
 * nothing is drawn when the booking has no trip (a salon booking, or one made
 * before trips existed) or the server offers none.
 */
export function HomeTripButton({
  booking,
  busy,
  onMove,
}: {
  booking: GroomerBooking;
  busy: boolean;
  onMove: (tripId: string, to: NonNullable<GroomerBooking["homeTrip"]>["status"]) => void;
}) {
  const trip = booking.location === "in_home" ? booking.homeTrip : null;

  if (!trip) return null;

  if (!trip.nextLabel || !trip.nextStatus) {
    return trip.status === "arrived_store" ? (
      <p className="mt-3 text-center text-sm text-muted">Perjalanan selesai</p>
    ) : null;
  }

  return (
    <Button
      fullWidth
      className="mt-3 min-h-11"
      loading={busy}
      onClick={() =>
        onMove(trip._id, trip.nextStatus as NonNullable<GroomerBooking["homeTrip"]>["status"])
      }
    >
      <Navigation className="size-4" aria-hidden="true" />
      {trip.nextLabel}
    </Button>
  );
}
