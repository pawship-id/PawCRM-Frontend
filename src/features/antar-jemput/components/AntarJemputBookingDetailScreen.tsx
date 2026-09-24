"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Pencil } from "lucide-react";

import { Alert, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  BILLING_BADGES,
  BookingSessionSteps,
  BookingStatusActions,
  BookingStatusBadge,
  billingOf,
  hasCompletedWork,
} from "@/features/booking";
import { BookingHistoryCard } from "@/features/booking/components/BookingHistoryCard";
import { BookingPriceBreakdown } from "@/features/booking/components/BookingPriceBreakdown";
import { BookingRelatedCard } from "@/features/booking/components/BookingRelatedCard";
import { Can } from "@/features/permissions";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import type { Booking } from "@/types/api";

import { antarJemputEditPath } from "../paths";
import { LEG_LABEL, rideOf } from "../ride";

/**
 * ONE RIDE, WHOLE — `/dashboard/layanan/antar-jemput/:bookingId`
 * (23 September 2026, on request, from `buloo-antar-jemput-v5.html`).
 *
 * ─── WHY A RIDE LEFT `/dashboard/booking/:id` ───────────────────────────────
 *
 * That page is built round ONE ANIMAL having one grooming: the pet profile and
 * its allergies, the belongings the owner handed over, the turns of one dog. A
 * van has none of those. It has two ends, a direction, a driver, and the
 * bookings it serves — and the mockup's five cards are exactly those facts.
 * Two different documents were sharing one page, and the shared page had to
 * answer "is this a ride?" in a dozen places to stay honest.
 *
 * ─── WHAT IS REUSED RATHER THAN REBUILT ─────────────────────────────────────
 *
 * The status control, the tahapan, Booking terkait and Riwayat are the SAME
 * components the booking page renders. They are about a booking, not about an
 * animal, and a second copy would be a second place for the rules to drift.
 * What is written here is only what the mockup has and the booking page does
 * not: the route, and the fare beside it.
 *
 * ⚠️ NO "BUKA LAGI" ON A TAHAPAN, though the mockup draws one — the shop took
 * it off the work page (see `BookingSessionSteps`), and this page follows the
 * shop rather than the drawing.
 *
 * ⚠️ NO "TARIK KE KASIR" BUTTON, though the mockup draws one. Pulling a booking
 * is the TILL's act, from the basket — a second entrance would raise a draft
 * from a page that cannot see the cart it lands in.
 */
export function AntarJemputBookingDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /*
    A MUTATION ANSWERS WITHOUT `group[]` AND `related[]` — only `GET /:id`
    carries those — so they are kept from what is already on screen rather than
    vanishing from Booking terkait the moment a status moves.
  */
  const replaceBooking = useCallback((next: Booking) => {
    setBooking((prev) => ({
      ...next,
      group: next.group ?? prev?.group,
      linked: next.linked ?? prev?.linked,
      related: next.related ?? prev?.related,
    }));
  }, []);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    bookingService
      .getById(id)
      .then(async (found) => {
        if (!active) return;

        /*
          NOT A RIDE, SO NOT THIS PAGE. The mirror of the redirect the booking
          page makes for a ride: either URL lands on the document's own page,
          so a stale link or a typed address is never a dead end.
        */
        if (!found.tripLeg) {
          router.replace(`/dashboard/booking/${found._id}`);
          return;
        }

        setBooking(found);
        setError(null);

        /* The branch adds a place, and is allowed to fail — a page that
           refused to show the journey because of it would strand a driver. */
        try {
          const branch = await branchService.getById(found.branchId);
          if (active) setBranchName(branch.name);
        } catch {
          /* The card says "—" and the rest of the page still stands. */
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error ? cause.message : "Booking tidak bisa dibuka",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, router]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Memuat perjalanan…
      </p>
    );
  }

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!booking) return null;

  const ride = rideOf(booking);
  const service = booking.service;
  const billing = BILLING_BADGES[billingOf(booking)];
  /* Money closes where the work does — the same line the booking page draws. */
  const editable =
    booking.status !== "cancelled" && !hasCompletedWork(booking);

  return (
    <div className="flex flex-col gap-4">
      {/*
        A DOCUMENT'S TITLE IS ITS NUMBER — §16, and the same heading card the
        booking page uses, so the two read as one product.
      */}
      <Card>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-50 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tabular-nums text-foreground">
                {/* A DRAFT HAS NO NUMBER — saying so beats a blank. */}
                {booking.bookingNumber ?? "Perjalanan (draf)"}
              </h1>
              <BookingStatusBadge
                status={booking.status}
                tripLeg={booking.tripLeg}
              />
              {/*
                A WORD, NOT A COLOUR — §1.3. Null on a booking with nothing to
                say about its bill yet, and then nothing is drawn: an empty
                badge is a claim that something is missing.
              */}
              {billing && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${billing.className}`}
                >
                  {billing.label}
                </span>
              )}
            </div>

            <p className="mt-1.5 text-sm text-muted">
              {booking.customerName ?? "Pelanggan"}
              {ride.names.length > 0 && ` · ${ride.names.join(", ")}`}
              {` · Cabang ${branchName ?? "—"}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <BookingStatusActions
              booking={booking}
              onChanged={replaceBooking}
              variant="prominent"
            />
            {editable && (
              <Can feature="bookings" action="update">
                <Button asChild variant="secondary" size="lg">
                  <Link href={antarJemputEditPath(booking._id)}>
                    <Pencil className="size-4" aria-hidden />
                    Ubah perjalanan
                  </Link>
                </Button>
              </Can>
            )}
          </div>
        </div>
      </Card>

      {booking.status === "cancelled" && booking.cancelReason && (
        <Alert variant="warning">Dibatalkan: {booking.cancelReason}</Alert>
      )}

      {/* ─── Rute ──────────────────────────────────────────────────────── */}
      <Card title="Rute">
        {/*
          BOTH ENDS, IN THE ORDER THE VAN DRIVES THEM. A ride has two pinned
          addresses since 23 September 2026 — the fare is measured BETWEEN them —
          so showing one and implying the branch would hide the half that moved.
        */}
        <ol className="flex flex-col gap-2">
          <RouteEnd label="Asal" address={ride.from} tone="origin" />
          <RouteEnd label="Tujuan" address={ride.to} tone="destination" />
        </ol>

        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Arah"
            value={booking.tripLeg ? LEG_LABEL[booking.tripLeg] : "—"}
          />
          {/* The zone the fare was quoted in, snapshotted with the price. */}
          <Field label="Zona" value={service?.zone?.name ?? "—"} />
          <Field
            label="Jadwal"
            value={
              <span className="tabular-nums">
                {new Date(booking.scheduledAt).toLocaleString("id-ID", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            }
          />
          <Field label="Driver" value={booking.groomerName} />
        </dl>

        {/*
          ANIMALS, PLURAL AND NAMED. A van carries several and promotes none of
          them (23 September 2026), so this is the only place the page can say
          who is actually on board.
        */}
        <dl className="mt-3 border-t border-border pt-3">
          <Field
            label={`Hewan diangkut (${ride.animals})`}
            value={ride.names.length > 0 ? ride.names.join(", ") : "—"}
          />
        </dl>
      </Card>

      {/* ─── Tahapan ───────────────────────────────────────────────────── */}
      <Card title="Tahapan">
        <BookingSessionSteps booking={booking} onChanged={replaceBooking} />
      </Card>

      {/* ─── Rincian & harga ───────────────────────────────────────────── */}
      {/*
        ⚠️ NO "UBAH HARGA" HERE (24 September 2026, on request). It pointed at
        the same form "Ubah perjalanan" opens, so the page offered two doors to
        one room — and the one on this card implied the price could be corrected
        apart from the journey, which it cannot: the fare is quoted from the
        zone between the two ends.
      */}
      <Card title="Rincian &amp; harga">
        {/*
          THE BOOKING PAGE'S OWN BLOCK (24 September 2026, on request: "buat
          seperti digambar"). What this card used to draw was a plainer thing —
          a name, a figure, a green number — and it did not know about "Diskon
          booking" at all, so a visit discounted across its bookings added up to
          a different total here than on the grooming it was riding for.

          THE MINUTES AND THE MULTIPLIER ARE THIS PAGE'S TO SAY: a van has no
          animal whose size and coat could fill that line.
        */}
        <BookingPriceBreakdown
          booking={booking}
          /* ⚠️ `tail`, NOT `facts` — the minutes sit at the right-hand end of
             the zone line, beside the distance the fare was measured over. */
          tail={
            [
              service?.durationMin ? `${service.durationMin} mnt` : null,
              /* A `per_pet` fare is the catalogue's price once per booking the
                 ride serves — said here so the figure is not a surprise. */
              service?.billingUnit === "per_pet" &&
              (booking.linkedBookingIds?.length ?? 0) > 1
                ? `per booking × ${booking.linkedBookingIds?.length}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || null
          }
        />
      </Card>

      {/* Booking terkait — the bookings this van serves, and its visit. */}
      <BookingRelatedCard booking={booking} onChanged={replaceBooking} />

      <BookingHistoryCard booking={booking} />
    </div>
  );
}

/**
 * ONE END OF THE JOURNEY.
 *
 * The dot carries no meaning on its own — the label beside it does (§1.3) — so
 * a reader who cannot tell the two tints apart still reads "Asal" and "Tujuan".
 */
function RouteEnd({
  label,
  address,
  tone,
}: {
  label: string;
  address: string | null;
  tone: "origin" | "destination";
}) {
  return (
    <li className="flex items-start gap-2.5">
      <MapPin
        className={`mt-0.5 size-4 shrink-0 ${
          tone === "origin" ? "text-warning" : "text-primary"
        }`}
        aria-hidden
      />
      <span className="min-w-0 text-sm">
        <span className="font-bold text-foreground">{label}</span>
        {" — "}
        {/* An address nobody typed is a doorbell the driver rings to ask. */}
        <span className={address ? "text-foreground" : "text-muted"}>
          {address ?? "Belum diisi"}
        </span>
      </span>
    </li>
  );
}

/** A labelled fact, as the booking page draws one. */
function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground">
        {value ?? "—"}
      </dd>
    </div>
  );
}
