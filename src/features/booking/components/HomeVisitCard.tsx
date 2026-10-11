"use client";

import { useState } from "react";
import { Check, MapPin } from "lucide-react";

import { Alert, Card, SelectField } from "@/components";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { homeTripService } from "@/services/homeTrip.service";
import type { Booking, HomeTripStatus } from "@/types/api";

import { HOME_TRIP_LABELS, HOME_TRIP_RUNGS, nextTripRung } from "../homeTrip";
import { useHomeTrip, useTripPerformers } from "../hooks/useHomeTrip";

/** The select's own spelling of "no performer named" — Radix forbids `""`. */
const FOLLOW_BOOKING = "ikut-booking";

/** "12 Okt · 09.05" — the day too, since a visit's rungs may straddle midnight. */
function stamp(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const day = at.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  const clock = `${String(at.getHours()).padStart(2, "0")}.${String(at.getMinutes()).padStart(2, "0")}`;
  return `${day} · ${clock}`;
}

/** "Buka di peta" target — only when the address carries a pin. */
function mapsHref(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

/**
 * THE GROOMER'S JOURNEY TO THE HOUSE (10 October 2026) — only for a booking
 * whose `location` is `in_home`, and not drawn at all otherwise.
 *
 * Titled "Kunjungan ke rumah" because the card above it already owns
 * "Kunjungan" (the appointment). The fee is not here: it is a priced line and
 * lives in the price breakdown.
 *
 * ONE RUNG AT A TIME, and the server is the judge: the button offers the next
 * rung and a refusal (a skipped rung, "Pulang" while an animal is unfinished)
 * is shown as the server worded it.
 */
export function HomeVisitCard({
  booking,
  onChanged,
}: {
  booking: Booking;
  /** Re-read the booking — "Sampai di rumah" also moves the booking itself. */
  onChanged: () => Promise<void> | void;
}) {
  const { can } = usePermissions();
  const summary = booking.homeTrip ?? null;
  const { trip, setTrip, refresh } = useHomeTrip(summary?._id, summary?.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status: HomeTripStatus | null = trip?.status ?? summary?.status ?? null;
  const canMove = can("bookings", "advanceStatus") || can("bookings", "update");
  const canAssign = can("bookings", "update");
  const choosing = canAssign && status === "scheduled" && summary !== null;

  const day = new Date(booking.scheduledAt);
  const date = Number.isNaN(day.getTime())
    ? null
    : [
        day.getFullYear(),
        String(day.getMonth() + 1).padStart(2, "0"),
        String(day.getDate()).padStart(2, "0"),
      ].join("-");
  const people = useTripPerformers(date, choosing);

  const address = booking.visitAddress;
  const href = address ? mapsHref(address.lat, address.lng) : null;
  const zoneName = trip?.zoneName ?? summary?.zoneName ?? null;
  const distanceKm = trip?.distanceKm ?? summary?.distanceKm ?? null;
  const where = [
    zoneName,
    distanceKm === null ? null : `${String(distanceKm).replace(".", ",")} km`,
  ]
    .filter(Boolean)
    .join(" · ");

  const performerId = trip?.performerUserId ?? summary?.performerUserId ?? null;
  const performerName =
    trip?.performerName ??
    people.find((one) => one.value === performerId)?.label ??
    null;
  const performerWord = performerId
    ? (performerName ?? "Staf yang ditunjuk")
    : booking.groomerName
      ? `Ikut groomer booking (${booking.groomerName})`
      : "Ikut groomer booking";

  const next = status ? nextTripRung(status) : null;

  /* What was written down, by rung — the full trip's rows carry the name. */
  const trail = new Map<HomeTripStatus, { at: string; byName: string | null }>();
  for (const row of summary?.history ?? []) {
    trail.set(row.status, { at: row.at, byName: row.byName });
  }
  for (const row of trip?.history ?? []) {
    trail.set(row.status, { at: row.at, byName: row.byName });
  }

  const reachedIndex = status
    ? HOME_TRIP_RUNGS.indexOf(status as (typeof HOME_TRIP_RUNGS)[number])
    : -1;

  async function move(to: HomeTripStatus) {
    if (!summary || busy) return;
    setBusy(true);
    setError(null);

    try {
      setTrip(await homeTripService.changeStatus(summary._id, to));
      await onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Tidak bisa mengubah status perjalanan. Coba lagi.",
      );
      /* A 409 usually means somebody moved it first — read where it stands. */
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function assign(value: string) {
    if (!summary || busy) return;
    setBusy(true);
    setError(null);

    try {
      setTrip(
        await homeTripService.setPerformer(
          summary._id,
          value === FOLLOW_BOOKING ? null : value,
        ),
      );
      await onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Tidak bisa mengganti yang menjalankan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

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
          {where && <p className="mt-0.5 text-xs text-muted">{where}</p>}
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {!summary || !status ? (
        /* A booking made before trips existed — nothing to walk. */
        <p className="mt-3 text-sm text-muted">
          Booking ini belum punya catatan perjalanan.
        </p>
      ) : (
        <>
          <div className="mt-3 border-t border-border pt-3">
            {choosing ? (
              <SelectField
                label="Yang menjalankan"
                value={performerId ?? FOLLOW_BOOKING}
                onChange={(value) => void assign(value)}
                disabled={busy}
                options={[
                  {
                    value: FOLLOW_BOOKING,
                    label: booking.groomerName
                      ? `Ikut groomer booking (${booking.groomerName})`
                      : "Ikut groomer booking",
                  },
                  ...people,
                ]}
              />
            ) : (
              <p className="text-sm">
                <span className="text-muted">Yang menjalankan: </span>
                <span className="font-semibold text-foreground">
                  {performerWord}
                </span>
              </p>
            )}
          </div>

          <ol className="mt-4 flex flex-col" aria-label="Perjalanan">
            {HOME_TRIP_RUNGS.map((rung, index) => {
              const written = trail.get(rung);
              const reached =
                status === "cancelled" ? Boolean(written) : index <= reachedIndex;
              const current = index === reachedIndex;

              return (
                <li
                  key={rung}
                  data-reached={reached ? "true" : "false"}
                  className="flex items-start gap-3 py-1.5"
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                      reached
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface text-muted"
                    }`}
                  >
                    {reached ? <Check className="size-3" /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm ${
                        current ? "font-bold text-foreground" : reached ? "font-semibold text-foreground" : "text-muted"
                      }`}
                    >
                      {HOME_TRIP_LABELS[rung]}
                      <span className="sr-only">
                        {reached ? " — sudah" : " — belum"}
                      </span>
                    </p>
                    {reached && written && (
                      <p className="text-xs tabular-nums text-muted">
                        {stamp(written.at)}
                        {written.byName ? ` · ${written.byName}` : ""}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {status === "cancelled" && (
            <p className="mt-2 text-sm font-semibold text-danger">
              Perjalanan dibatalkan
              {trail.get("cancelled") ? ` · ${stamp(trail.get("cancelled")!.at)}` : ""}
            </p>
          )}

          <div className="mt-3">
            {next ? (
              <>
                <Button
                  disabled={busy || !canMove}
                  onClick={() => void move(next)}
                >
                  {busy ? "Menyimpan…" : HOME_TRIP_LABELS[next]}
                </Button>
                {!canMove && (
                  <p className="mt-1.5 text-xs text-muted">
                    Anda tidak punya izin mengubah status perjalanan.
                  </p>
                )}
              </>
            ) : (
              status === "arrived_store" && (
                <p className="text-sm text-muted">Perjalanan selesai.</p>
              )
            )}
          </div>
        </>
      )}
    </Card>
  );
}
