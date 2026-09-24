"use client";

import { useState } from "react";
import Link from "next/link";
import { Link2, Unlink } from "lucide-react";

import { Alert, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { bookingDetailPath } from "@/features/antar-jemput/paths";
import { bookingService } from "@/services/booking.service";
import type {
  Booking,
  BookingGroupMember,
  BookingRelated,
  TripLeg,
} from "@/types/api";

import { useVisitBookings, visitLabel } from "../hooks/useVisitBookings";
import { BookingStatusBadge } from "./BookingStatusBadge";

const LEG_WORDS: Record<TripLeg, string> = { pickup: "Jemput", delivery: "Antar" };

/** "09.00" on the shop's clock. */
function clock(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${String(at.getHours()).padStart(2, "0")}.${String(at.getMinutes()).padStart(2, "0")}`;
}

type Row =
  | { kind: "visit"; member: BookingGroupMember }
  | { kind: "ride"; member: BookingGroupMember }
  | { kind: "billed"; member: BookingRelated };

/**
 * "Booking terkait" — BO's notes 1 and 3 (21 September 2026), in the rail of a
 * booking's page, where "Satu kunjungan" was.
 *
 * TWO WAYS TO BE RELATED, both listed and each said:
 *
 *   - SATU KUNJUNGAN — the same `groupId`: saved together or linked with
 *     "Tautkan booking" here. These can be let go ("Lepas"), which moves THAT
 *     booking out into a visit of its own.
 *   - SATU ANTAR-JEMPUT — on a ride, the bookings it serves (23 September
 *     2026). One van may serve bookings from several visits, so this is its own
 *     list and not the group's. Let go of it in the ride's own form, not here.
 *
 *     ⚠️ THESE ROWS CARRY NEITHER A CHIP NOR A STATUS (24 September 2026, on
 *     request). The chip said "Satu antar-jemput" on every row of a card that
 *     only a van's page draws — one word repeated down the list, which is what
 *     the Transaksi table's Status column was removed for. And the badge was a
 *     status belonging to ANOTHER booking, next to a van whose own status is in
 *     the heading two cards above: two rungs on one screen, neither saying
 *     which document it is about. The ordinary page's rows keep both.
 *   - SATU FAKTUR / SATU KERANJANG — billed together without anybody linking
 *     them. BO: a ride pulled onto the grooming's invoice belongs with it. Read
 *     off the bill, so there is nothing here to undo — the bill is the fact.
 *
 * ONE WAY TO ADD ONE: "Tautkan booking" moves this booking into another visit
 * of the same customer — AND NOT ON A RIDE (24 September 2026, on request).
 * What a van is linked to is the bookings it SERVES, and those are ticked in
 * its own form ("Ubah perjalanan" › Tautkan ke booking) since earlier today.
 * A second door that quietly meant something else — moving the van into another
 * visit, `groupId` rather than `linkedBookingIds` — is the kind of pair nobody
 * should have to tell apart from two buttons with one name.
 *
 * ─── "+ ANTAR-JEMPUT" WAS HERE AND IS GONE (24 September 2026, on request) ──
 *
 * It opened the ride form started from this booking. The shop asked for it back
 * on 21 September and asked for it off today, on one rule: once a booking is
 * CREATED, nothing is added to it from here. A van is booked with the grooming
 * (the Antar-jemput section on Booking baru) or on its own from the module.
 *
 * ⚠️ THAT MAKES `antarJemputForBookingPath` UNREACHABLE FROM THE UI. The route
 * and the form's `?bookingId=` handling are deliberately kept — they are the
 * whole feature, not a button — so putting the entrance back is one line here
 * rather than a rebuild. Do not delete them as dead code.
 */
export function BookingRelatedCard({
  booking,
  onChanged,
}: {
  booking: Booking;
  /** The booking as the server now has it — its `group[]` and `related[]` moved. */
  onChanged: (booking: Booking) => void;
}) {
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const rows: Row[] = [
    ...(booking.group ?? []).map((member) => ({ kind: "visit" as const, member })),
    ...(booking.linked ?? []).map((member) => ({ kind: "ride" as const, member })),
    ...(booking.related ?? []).map((member) => ({ kind: "billed" as const, member })),
  ];
  const cancelled = booking.status === "cancelled";
  /* A van's links are its own form's — see the note above. */
  const ride = Boolean(booking.tripLeg);

  async function release(member: BookingGroupMember) {
    if (busy) return;
    setBusy(member._id);

    try {
      await bookingService.setGroup(member._id, null);
      onChanged(await bookingService.getById(booking._id));
      try {
        swalToast(`${member.bookingNumber ?? "Booking"} dilepas dari kunjungan ini.`);
      } catch {
        /* The card already shows it gone. */
      }
    } catch (error) {
      swalToast(
        error instanceof ApiError ? error.fullMessage : "Tautan tidak bisa dilepas. Coba lagi.",
        "error",
        6000,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="Booking terkait"
      action={
        rows.length > 0 ? (
          <span className="text-sm tabular-nums text-muted">{rows.length} booking</span>
        ) : null
      }
    >
      <div className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            {ride
              ? "Perjalanan ini belum melayani booking mana pun. Tautkan lewat Ubah perjalanan."
              : "Belum terkait dengan booking lain. Tautkan ke booking pelanggan ini yang lain."}
          </p>
        ) : (
          <ul className="flex flex-col">
            {rows.map(({ kind, member }) => (
              <li
                key={member._id}
                className="flex items-start gap-2 border-t border-border py-2.5 first:border-t-0 first:pt-0 last:pb-0"
              >
                <Link
                  href={bookingDetailPath(member)}
                  className="group flex min-w-0 flex-1 flex-col gap-1 rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground group-hover:underline">
                      {member.tripLeg
                        ? `${LEG_WORDS[member.tripLeg]} · ${member.petName ?? "Hewan terhapus"}`
                        : (member.petName ?? "Hewan terhapus")}
                    </span>
                    {kind !== "ride" && <BookingStatusBadge status={member.status} />}
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    {member.serviceName} · {member.bookingNumber ?? "Draf"} ·{" "}
                    {clock(member.scheduledAt)}
                  </span>
                  {kind !== "ride" && (
                    <span
                      className={cn(
                        "w-fit rounded-full px-2 py-0.5 text-xs font-medium",
                        kind === "visit"
                          ? "bg-tint-neutral text-muted"
                          : "bg-tint-info text-info",
                      )}
                    >
                      {kind === "visit"
                        ? "Satu kunjungan"
                        : member.via === "invoice"
                          ? `Satu faktur${member.documentNumber ? ` · ${member.documentNumber}` : ""}`
                          : `Satu keranjang${member.documentNumber ? ` · ${member.documentNumber}` : ""}`}
                    </span>
                  )}
                </Link>
                {kind === "visit" && (
                  <Can feature="bookings" action="update">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Lepas ${member.bookingNumber ?? "booking"} dari kunjungan ini`}
                      disabled={busy !== null}
                      onClick={() => void release(member)}
                    >
                      {busy === member._id ? <Spinner size={14} /> : <Unlink className="size-4" aria-hidden />}
                      Lepas
                    </Button>
                  </Can>
                )}
              </li>
            ))}
          </ul>
        )}

        {!cancelled && !ride && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Can feature="bookings" action="update">
              <Button type="button" variant="ghost" size="sm" onClick={() => setLinking(true)}>
                <Link2 className="size-4" aria-hidden />
                Tautkan booking
              </Button>
            </Can>
          </div>
        )}
      </div>

      {linking && (
        <LinkBookingDialog
          booking={booking}
          onClose={() => setLinking(false)}
          onLinked={(next) => {
            setLinking(false);
            onChanged(next);
          }}
        />
      )}
    </Card>
  );
}

/**
 * "Tautkan booking" — pick another booking of the same customer, and THIS one
 * moves into its visit. Mounted only while open, so the customer's bookings
 * are read when somebody asks and not on every page view.
 */
function LinkBookingDialog({
  booking,
  onClose,
  onLinked,
}: {
  booking: Booking;
  onClose: () => void;
  onLinked: (booking: Booking) => void;
}) {
  const visits = useVisitBookings(booking.customerId, booking._id);
  const [picked, setPicked] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Already in this visit — nothing to link to. */
  const options = visits.bookings.filter((other) => other.groupId !== booking.groupId);
  const target = options.find((other) => other._id === picked) ?? null;

  async function link() {
    if (!target || saving) return;
    setSaving(true);
    setError(null);

    try {
      const next = await bookingService.setGroup(booking._id, target.groupId);
      onLinked(next);
      try {
        swalToast(`Ditautkan ke ${target.bookingNumber ?? "booking itu"}.`);
      } catch {
        /* The card shows it. */
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.fullMessage : "Tidak bisa ditautkan. Coba lagi.");
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tautkan booking</DialogTitle>
          <DialogDescription>
            Booking ini pindah ke kunjungan booking yang dipilih — keduanya saling
            muncul di Booking terkait. Hanya booking pelanggan yang sama.
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        {visits.loading ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Memuat booking pelanggan…
          </p>
        ) : visits.failed ? (
          <Alert variant="error">Booking pelanggan ini tidak bisa dimuat.</Alert>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted">
            Tidak ada booking lain milik pelanggan ini dalam 30 hari terakhir
            sampai 90 hari ke depan.
          </p>
        ) : (
          <ul role="radiogroup" aria-label="Booking tujuan" className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {options.map((other) => {
              const on = other._id === picked;
              return (
                <li key={other._id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPicked(other._id)}
                    className={cn(
                      "flex min-h-11 w-full items-center rounded-lg border-[1.5px] px-3 py-2 text-left text-sm transition focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                      on ? "border-primary bg-navy-100" : "border-border bg-surface hover:bg-surface-hover",
                    )}
                  >
                    <span className="tabular-nums">{visitLabel(other)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
            Batal
          </Button>
          <Button type="button" disabled={!target || saving} onClick={() => void link()}>
            {saving && <Spinner size={16} />}
            Tautkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
