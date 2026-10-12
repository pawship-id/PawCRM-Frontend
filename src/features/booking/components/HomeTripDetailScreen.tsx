"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, House, MapPin } from "lucide-react";

import { Alert, Card, SelectField, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { homeTripService } from "@/services/homeTrip.service";
import type {
  HomeTrip,
  HomeTripFee,
  HomeTripStatus,
  InvoiceDiscountMode,
  TripPoint,
} from "@/types/api";
import { formatMoney, trimDecimal } from "@/utils/decimal";

import { HOME_TRIP_LABELS, HOME_TRIP_RUNGS, nextTripRung } from "../homeTrip";
import { useTripPerformers } from "../hooks/useHomeTrip";
import { BookingStatusBadge } from "./BookingStatusBadge";

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
function mapsHref(point: TripPoint | null): string | null {
  if (point?.lat == null || point?.lng == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.lat},${point.lng}`)}`;
}

/** How the shop counts the fee, in the words of its setting. */
const FEE_UNIT_LABEL: Record<string, string> = {
  per_visit: "Dihitung per kunjungan",
  per_pet: "Dihitung per hewan",
};

/** `YYYY-MM-DD` of the trip's day — what the performer roster is read for. */
function dayOf(iso: string | null): string | null {
  if (!iso) return null;
  const day = new Date(iso);
  if (Number.isNaN(day.getTime())) return null;
  return [
    day.getFullYear(),
    String(day.getMonth() + 1).padStart(2, "0"),
    String(day.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * ONE TRIP, WHOLE — `/dashboard/booking/perjalanan/:tripId` (11 October 2026,
 * on request).
 *
 * ─── WHY THE TRIP LEFT THE BOOKING PAGE ─────────────────────────────────────
 *
 * A trip is one document that MANY bookings point at: per visit, every animal
 * of the house shares it. Drawn inside each booking's page it was the same
 * timeline and the same buttons, repeated once per animal, with none of them
 * saying which other animals rode along. Here it is drawn once, with the
 * bookings it serves listed and linked; the booking page keeps a summary and a
 * link back.
 *
 * THE VISIT FEE IS THE TRIP'S OWN (11 October 2026, on request) — a snapshot
 * taken when the trip was arranged, billed once as a line of its own with
 * whichever booking of the trip is billed first. This page says what it costs
 * and whether a basket or an invoice already holds it.
 *
 * ONE RUNG AT A TIME, and the server is the judge: the button offers the next
 * rung and a refusal (a skipped rung, "Pulang" while an animal is unfinished)
 * is shown as the server worded it.
 */
export function HomeTripDetailScreen({ id }: { id: string }) {
  const { can } = usePermissions();
  const [trip, setTrip] = useState<HomeTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTrip(await homeTripService.get(id));
      setLoadError(null);
    } catch (cause) {
      setLoadError(
        cause instanceof Error ? cause.message : "Perjalanan tidak bisa dibuka",
      );
    }
  }, [id]);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    homeTripService
      .get(id)
      .then((found) => {
        if (!active) return;
        setTrip(found);
        setLoadError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setLoadError(
          cause instanceof Error ? cause.message : "Perjalanan tidak bisa dibuka",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const status: HomeTripStatus | null = trip?.status ?? null;
  const canMove = can("bookings", "advanceStatus") || can("bookings", "update");
  const canAssign = can("bookings", "update");
  const choosing = canAssign && status === "scheduled";
  const people = useTripPerformers(dayOf(trip?.scheduledAt ?? null), choosing);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Memuat perjalanan…
      </p>
    );
  }

  if (loadError) return <Alert variant="error">{loadError}</Alert>;
  if (!trip || !status) return null;

  const next = nextTripRung(status);
  const href = mapsHref(trip.destination);
  const where = [
    trip.zoneName,
    trip.distanceKm === null ? null : `${String(trip.distanceKm).replace(".", ",")} km`,
  ]
    .filter(Boolean)
    .join(" · ");

  const performerName =
    trip.performerName ??
    people.find((one) => one.value === trip.performerUserId)?.label ??
    null;
  const performerWord = trip.performerUserId
    ? (performerName ?? "Staf yang ditunjuk")
    : "Ikut groomer booking";

  const trail = new Map<HomeTripStatus, { at: string; byName: string | null }>();
  for (const row of trip.history) {
    trail.set(row.status, { at: row.at, byName: row.byName });
  }

  const reachedIndex = HOME_TRIP_RUNGS.indexOf(
    status as (typeof HOME_TRIP_RUNGS)[number],
  );

  async function move(to: HomeTripStatus) {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      /* The door also moves the bookings — re-read so their badges follow. */
      await homeTripService.changeStatus(id, to);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Tidak bisa mengubah status perjalanan. Coba lagi.",
      );
      /* A 409 usually means somebody moved it first — read where it stands. */
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveDiscount(discount: { mode: InvoiceDiscountMode; value: string } | null) {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      setTrip(await homeTripService.setFeeDiscount(id, discount));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Tidak bisa menyimpan diskon biaya kunjungan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function assign(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      setTrip(
        await homeTripService.setPerformer(id, value === FOLLOW_BOOKING ? null : value),
      );
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
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-extrabold text-foreground">
            Perjalanan ke {trip.customerName ?? "rumah pelanggan"}
          </h1>
          <Badge
            variant="outline"
            className={
              status === "cancelled"
                ? "border-transparent bg-tint-danger text-danger"
                : "border-transparent bg-tint-info text-info"
            }
          >
            <House className="size-4" aria-hidden />
            {HOME_TRIP_LABELS[status]}
          </Badge>
        </div>
        {trip.scheduledAt && (
          <p className="mt-1 text-sm tabular-nums text-muted">
            Dijadwalkan {stamp(trip.scheduledAt)}
          </p>
        )}
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Tujuan">
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold text-foreground">
                {trip.destination?.address ?? "Alamat belum dicatat"}
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

          {trip.origin?.address && (
            <p className="mt-3 border-t border-border pt-3 text-sm">
              <span className="text-muted">Berangkat dari: </span>
              <span className="text-foreground">{trip.origin.address}</span>
            </p>
          )}

          <div className="mt-3 border-t border-border pt-3">
            {choosing ? (
              <SelectField
                label="Yang menjalankan"
                value={trip.performerUserId ?? FOLLOW_BOOKING}
                onChange={(value) => void assign(value)}
                disabled={busy}
                options={[{ value: FOLLOW_BOOKING, label: "Ikut groomer booking" }, ...people]}
              />
            ) : (
              <p className="text-sm">
                <span className="text-muted">Yang menjalankan: </span>
                <span className="font-semibold text-foreground">{performerWord}</span>
              </p>
            )}
          </div>
        </Card>

        <Card title="Status perjalanan">
          <ol className="flex flex-col" aria-label="Perjalanan">
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
                        current
                          ? "font-bold text-foreground"
                          : reached
                            ? "font-semibold text-foreground"
                            : "text-muted"
                      }`}
                    >
                      {HOME_TRIP_LABELS[rung]}
                      <span className="sr-only">{reached ? " — sudah" : " — belum"}</span>
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
                <Button disabled={busy || !canMove} onClick={() => void move(next)}>
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
        </Card>
      </div>

      <Card title="Biaya kunjungan">
        {!trip.fee ? (
          <p className="text-sm text-muted">Tidak ada biaya kunjungan untuk perjalanan ini.</p>
        ) : (
          <div data-trip-fees>
            <div className="flex flex-wrap items-start justify-between gap-x-3 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{trip.fee.name}</span>
                <span className="block text-xs tabular-nums text-muted">
                  {[
                    trip.fee.distanceKm === null
                      ? null
                      : `${String(Math.round(trip.fee.distanceKm * 10) / 10).replace(".", ",")} km${
                          trip.fee.distanceSource === "road" ? " jarak jalan" : " garis lurus"
                        }`,
                    trip.fee.unit ? FEE_UNIT_LABEL[trip.fee.unit] : null,
                    "harga terkunci saat perjalanan dibuat",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="text-lg font-extrabold tabular-nums text-foreground">
                {formatMoney(trip.fee.amount)}
              </span>
            </div>
            {/*
              THE FEE'S OWN DISCOUNT (12 October 2026, on request) — set here
              while unbilled, as a booking's "Diskon item" is set on the
              booking; the till or the invoice starts the trip's line with it.
            */}
            <TripFeeDiscount
              key={`${trip.fee.discount?.mode ?? ""}:${trip.fee.discount?.value ?? ""}`}
              fee={trip.fee}
              editable={canAssign && trip.billing.state === "unbilled" && status !== "cancelled"}
              busy={busy}
              onSave={(discount) => void saveDiscount(discount)}
            />
            <div className="mt-3 border-t border-border pt-3">
              {trip.billing.state === "billed" ? (
                <Badge variant="outline" className="border-transparent bg-tint-success text-success">
                  {trip.billing.via === "invoice" ? "Sudah ditagih di faktur" : "Sudah ditagih di kasir"}
                  {trip.billing.bookingNumber ? ` · bersama ${trip.billing.bookingNumber}` : ""}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-transparent bg-tint-warning text-warning">
                  Belum ditagih · ikut booking pertama yang ditagih
                </Badge>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card title="Booking dalam perjalanan ini">
        {trip.bookings.length === 0 ? (
          <p className="text-sm text-muted">Belum ada booking di perjalanan ini.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {trip.bookings.map((one) => (
              <li key={one._id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/booking/${one._id}`}
                    className="text-sm font-semibold tabular-nums text-primary underline-offset-2 hover:underline"
                  >
                    {one.bookingNumber ?? "Booking (draf)"}
                  </Link>
                  <p className="text-sm text-muted">
                    {[one.petName, one.serviceName].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <BookingStatusBadge status={one.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/**
 * The fee's discount row: the controls while it may change, the figure once
 * billed (the line on the bill is then what is paid). Keyed on the stored
 * discount by the caller, so a save resets the fields to what was stored.
 */
function TripFeeDiscount({
  fee,
  editable,
  busy,
  onSave,
}: {
  fee: HomeTripFee;
  editable: boolean;
  busy: boolean;
  onSave: (discount: { mode: InvoiceDiscountMode; value: string } | null) => void;
}) {
  const stored = fee.discount ?? null;
  const [mode, setMode] = useState<InvoiceDiscountMode>(stored?.mode ?? "percent");
  const [value, setValue] = useState(stored ? trimDecimal(stored.value) : "");
  const dirty =
    mode !== (stored?.mode ?? "percent") || value !== (stored ? trimDecimal(stored.value) : "");

  return (
    <div className="mt-3 border-t border-border pt-3 text-sm">
      {editable ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(value.trim() ? { mode, value: value.trim() } : null);
          }}
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">Diskon</span>
            <div className="flex gap-1">
              <select
                aria-label="Jenis diskon biaya kunjungan"
                className="h-9 w-16 shrink-0 rounded-md border border-border bg-surface px-2 text-sm focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                value={mode}
                onChange={(event) => setMode(event.target.value as InvoiceDiscountMode)}
                disabled={busy}
              >
                <option value="percent">%</option>
                <option value="amount">Rp</option>
              </select>
              <Input
                aria-label="Diskon biaya kunjungan"
                className="w-32"
                value={value}
                inputMode="decimal"
                placeholder="0"
                onChange={(event) => setValue(event.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <Button type="submit" variant="secondary" disabled={busy || !dirty}>
            {busy ? "Menyimpan…" : "Simpan diskon"}
          </Button>
          {stored && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onSave(null)}
            >
              Hapus diskon
            </Button>
          )}
        </form>
      ) : (
        <p>
          <span className="text-muted">Diskon: </span>
          <span className="text-foreground">
            {stored
              ? stored.mode === "percent"
                ? `${trimDecimal(stored.value)}%`
                : formatMoney(stored.value)
              : "—"}
          </span>
        </p>
      )}

      {stored && (
        <div className="mt-2 flex flex-col gap-0.5 tabular-nums">
          <p className="flex justify-between">
            <span className="text-muted">Potongan</span>
            <span className="text-success">−{formatMoney(stored.resolvedAmount)}</span>
          </p>
          <p className="flex justify-between font-semibold">
            <span className="text-foreground">Yang ditagih</span>
            <span className="text-foreground">{formatMoney(fee.netAmount ?? fee.amount)}</span>
          </p>
        </div>
      )}
      {editable && (
        <p className="mt-1.5 text-xs text-muted">
          Ikut ke baris trip di kasir atau faktur. Kalau diubah di sana, diskon di sini ikut
          berubah.
        </p>
      )}
    </div>
  );
}
