"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";
import type { Booking } from "@/types/api";

import { BILLING_BADGES } from "../billing";
import { bookingDetailPath } from "@/features/antar-jemput/paths";
import { clockOf, dayOf } from "../day";
import type { TodayRow } from "../today";
import { BookingSessionSteps } from "./BookingSessionSteps";
import { BookingStatusActions } from "./BookingStatusActions";

/** One line of the panel's little table. */
function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right font-semibold tabular-nums text-foreground">
        {children}
      </span>
    </div>
  );
}

/**
 * What one card IS, and what can be done with it — the mockup's right-hand rail.
 *
 * ─── IT MOVES THINGS ───────────────────────────────────────────────────────
 *
 * The status control and the turns' Mulai / Selesai are here, not only on the
 * booking's own page. This is the screen somebody has open while the animal is
 * in front of them; every move still goes through the same confirm dialog and
 * the same server gates (see `BookingStatusActions`).
 *
 * ─── WHAT THE MOCKUP ASKS FOR THAT IS NOT DRAWN ────────────────────────────
 *
 * "Chat" — a booking carries no phone number, so there is nothing to build a
 * wa.me link from. "Perpanjang" and "Buka peta" belong to a hotel stay and a
 * trip, neither of which exists as a record yet. A travel fee and a zone, the
 * same. None of them is invented here.
 */
export function TodayDetailPanel({
  row,
  onChanged,
  onClose,
}: {
  row: TodayRow;
  onChanged: (booking: Booking) => void;
  onClose: () => void;
}) {
  const { booking, service } = row;
  const billing = BILLING_BADGES[row.billing];
  const legs = row.trip
    ? [
        row.trip.inHome ? "Dikerjakan di rumah" : null,
        row.trip.pickup ? "Dijemput" : null,
        row.trip.delivery ? "Diantar pulang" : null,
      ].filter((leg): leg is string => leg !== null)
    : [];

  return (
    <section
      aria-label={`Rincian ${booking.petName ?? "booking"}`}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4"
    >
      <header className="flex items-start justify-between gap-2 border-b border-border pb-3">
        <div>
          <h2 className="text-base font-bold text-foreground">
            {booking.petName ?? "—"}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            <span className="tabular-nums">
              {booking.bookingNumber ?? "Draf"}
            </span>{" "}
            · {row.line} · {booking.customerName ?? "—"}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Tutup
        </Button>
      </header>

      <div>
        <Line label="Layanan">{service.name}</Line>
        {row.addons.map((addon) => (
          <Line key={addon.itemId} label="Add-on">
            {addon.name}
          </Line>
        ))}
        <Line label="Jadwal">
          {clockOf(booking.scheduledAt)} · {dayOf(booking.scheduledAt)}
        </Line>
        <Line label="Durasi">
          {row.durationMin === null ? "Belum diisi" : `${row.durationMin} menit`}
        </Line>
        <Line label="Groomer">
          {row.groomers.length
            ? row.groomers.map((who) => who.name).join(", ")
            : "Belum ditentukan"}
        </Line>
        <Line label="Tahapan">
          {row.sessions.length
            ? `${row.sessionsDone}/${row.sessions.length} selesai`
            : "Belum ada"}
        </Line>
        <Line label="Faktur">
          {billing ? (
            <Badge
              variant="outline"
              className={cn("border-transparent", billing.className)}
            >
              {billing.label}
            </Badge>
          ) : (
            "Belum jatuh tempo"
          )}
        </Line>

        <div className="mt-2 flex justify-between gap-3 border-t border-border pt-2">
          <span className="text-sm font-bold text-foreground">Nilai</span>
          <span className="text-base font-bold tabular-nums text-foreground">
            {formatMoney(row.net)}
          </span>
        </div>
      </div>

      {legs.length > 0 && (
        <p className="rounded-xl bg-tint-info px-3 py-2 text-sm text-info">
          {legs.join(" · ")}
          {booking.tripAddress && (
            <span className="mt-1 block text-foreground">
              {booking.tripAddress}
            </span>
          )}
        </p>
      )}

      {/* Staff-facing only — the customer's note is not a warning. */}
      {booking.internalNotes && (
        <p className="flex items-start gap-2 rounded-xl bg-tint-warning px-3 py-2 text-sm text-foreground">
          <TriangleAlert className="mt-0.5 size-4 flex-none text-warning" aria-hidden />
          {booking.internalNotes}
        </p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-bold text-foreground">Status</h3>
        <BookingStatusActions
          booking={booking}
          onChanged={onChanged}
          variant="prominent"
          dense
        />
      </div>

      <BookingSessionSteps booking={booking} onChanged={onChanged} />

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button asChild variant="secondary" size="sm">
          <Link href={bookingDetailPath(booking)}>Buka detail</Link>
        </Button>
        {row.billing === "unbilled" && (
          <Can feature="posTransactions" action="create">
            <Button asChild size="sm">
              <Link href="/dashboard/pos">Tagih di kasir</Link>
            </Button>
          </Can>
        )}
      </div>
    </section>
  );
}
