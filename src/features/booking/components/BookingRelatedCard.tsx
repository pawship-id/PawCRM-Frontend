"use client";

import { useState } from "react";
import Link from "next/link";
import { Link2, Plus, Unlink } from "lucide-react";

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
import { antarJemputForBookingPath } from "@/features/antar-jemput/paths";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
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
  | { kind: "billed"; member: BookingRelated };

/**
 * "Booking terkait" — BO's notes 1 and 3 (21 September 2026), in the rail of a
 * booking's page, where "Satu kunjungan" was.
 *
 * TWO WAYS TO BE RELATED, both listed and each said:
 *
 *   - SATU KUNJUNGAN — the same `groupId`: saved together, linked from the
 *     antar-jemput form, or with "Tautkan booking" here. These can be let go
 *     ("Lepas"), which moves THAT booking out into a visit of its own.
 *   - SATU FAKTUR / SATU KERANJANG — billed together without anybody linking
 *     them. BO: a ride pulled onto the grooming's invoice belongs with it. Read
 *     off the bill, so there is nothing here to undo — the bill is the fact.
 *
 * AND TWO WAYS TO ADD ONE: "+ Antar-jemput" opens the ride form started from
 * this booking (customer, animal, day and the link filled in), and "Tautkan
 * booking" moves this one into another visit of the same customer.
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
    ...(booking.related ?? []).map((member) => ({ kind: "billed" as const, member })),
  ];
  const cancelled = booking.status === "cancelled";

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
            Belum terkait dengan booking lain. Tambahkan antar-jemput, atau
            tautkan ke booking pelanggan ini yang lain.
          </p>
        ) : (
          <ul className="flex flex-col">
            {rows.map(({ kind, member }) => (
              <li
                key={member._id}
                className="flex items-start gap-2 border-t border-border py-2.5 first:border-t-0 first:pt-0 last:pb-0"
              >
                <Link
                  href={`/dashboard/booking/${member._id}`}
                  className="group flex min-w-0 flex-1 flex-col gap-1 rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground group-hover:underline">
                      {member.tripLeg
                        ? `${LEG_WORDS[member.tripLeg]} · ${member.petName ?? "Hewan terhapus"}`
                        : (member.petName ?? "Hewan terhapus")}
                    </span>
                    <BookingStatusBadge status={member.status} />
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    {member.serviceName} · {member.bookingNumber ?? "Draf"} ·{" "}
                    {clock(member.scheduledAt)}
                  </span>
                  <span
                    className={cn(
                      "w-fit rounded-full px-2 py-0.5 text-xs font-medium",
                      kind === "visit" ? "bg-tint-neutral text-muted" : "bg-tint-info text-info",
                    )}
                  >
                    {kind === "visit"
                      ? "Satu kunjungan"
                      : member.via === "invoice"
                        ? `Satu faktur${member.documentNumber ? ` · ${member.documentNumber}` : ""}`
                        : `Satu keranjang${member.documentNumber ? ` · ${member.documentNumber}` : ""}`}
                  </span>
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

        {!cancelled && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Can feature="bookings" action="create">
              <Button asChild variant="secondary" size="sm">
                <Link href={antarJemputForBookingPath(booking._id)}>
                  <Plus className="size-4" aria-hidden />
                  Antar-jemput
                </Link>
              </Button>
            </Can>
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
