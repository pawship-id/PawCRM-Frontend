"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Alert, Card, Spinner } from "@/components";
import { BookingBelongingsCard } from "./BookingBelongingsCard";
import { Button } from "@/components/ui/button";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import { Can } from "@/features/permissions";
import { PetSummaryCard } from "@/features/pets";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { petService } from "@/services/pet.service";
import { formatMoney, sumDecimals } from "@/utils/decimal";
import type { Booking, Pet } from "@/types/api";

import { BookingStatusActions } from "./BookingStatusActions";
import { BookingStatusBadge } from "./BookingStatusBadge";

const BILLING_LABELS: Record<string, string> = {
  unbilled: "Belum ditagih",
  partial: "Sebagian sudah ditagih",
  billed: "Sudah ditagih",
};

function moment(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One booking, whole — the screen the module was missing.
 *
 * WHAT IT IS FOR. The list answers "did that grooming get recorded"; the
 * calendar answers "who is where at ten". Neither answers the question somebody
 * asks with a customer on the phone: **what exactly is this booking, and where
 * does it stand.** Until this page existed the only way to see a booking's rows,
 * its history and its billing state together was to read three screens.
 *
 * ROWS, NOT A BOOKING. Since PCR-040 a visit may bring Mochi and Coco to two
 * different people, at two prices, billed separately. This page shows each row
 * as its own block — because that is the unit everything downstream works in,
 * and a page that summed them into one line would hide the thing the whole
 * module was rebuilt for.
 *
 * THE PET SUMMARY APPEARS HERE TOO — FR-5 kriteria 5.14, and the same component
 * the booking form and the profile use. One answer to "what does the shop know
 * about this animal"; a second rendering would eventually disagree with the one
 * a groomer actually reads.
 */
export function BookingDetailScreen({ id }: { id: string }) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const scope = useBranchScope();

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    bookingService
      .getById(id)
      .then((result) => {
        if (!active) return;
        setBooking(result);
        setError(null);
        return result;
      })
      .then((result) => {
        /*
          THE ANIMALS' OWN RECORDS, fetched by OWNER rather than one call per
          row. A visit with three animals would otherwise be three requests to
          draw three warning boxes — and the customer's pets are one query the
          rest of this app already makes.
        */
        if (!result?.customerId) return;

        return petService
          .list({ customerId: result.customerId, limit: 100 })
          .then((page) => {
            if (active) setPets(page.items);
          })
          .catch(() => {
            /* The rows still render; only the warning boxes go missing. */
          });
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "Booking ini tidak ditemukan."
            : "Booking tidak bisa dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, nonce]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat booking…
      </div>
    );
  }

  if (error || !booking) {
    return <Alert variant="error">{error ?? "Booking tidak ditemukan."}</Alert>;
  }

  const branchName =
    scope.branches.find((branch) => branch._id === booking.branchId)?.name ??
    null;

  const total = sumDecimals(booking.items.map((item) => item.price));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-foreground">
              {/* A DRAFT HAS NO NUMBER — see the model. Saying so beats a blank. */}
              {booking.bookingNumber ?? "Booking (draf)"}
            </h1>
            <BookingStatusBadge status={booking.status} />
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
              {BILLING_LABELS[booking.billingState] ?? booking.billingState}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {booking.customerName ?? "—"}
            {branchName ? ` · ${branchName}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
            NO "UBAH" ONCE THE BOOKING IS FROZEN. `completed` and `cancelled`
            are the two states with nowhere left to go, and the server answers
            409 to a PATCH on either — offering the button would send somebody
            to a form that cannot save.

            THE STATUS IS NOT WHAT THE BUTTON EDITS. That moves through the menu
            beside it, which is why both live here and neither is inside the
            other.
          */}
          {booking.status !== "completed" && booking.status !== "cancelled" && (
            <Can feature="bookings" action="update">
              <Button asChild variant="secondary" size="sm">
                <Link href={`/dashboard/booking/${booking._id}/edit`}>Ubah</Link>
              </Button>
            </Can>
          )}
          <BookingStatusActions booking={booking} onChanged={() => setNonce((n) => n + 1)} />
        </div>
      </div>

      <Card title="Kunjungan">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Row label="Waktu" value={moment(booking.scheduledAt)} />
          <Row
            label="Perkiraan selesai"
            value={
              booking.totalDurationMin
                ? `${booking.totalDurationMin} menit`
                : "Durasi belum diisi"
            }
          />
          <Row
            label="Hewan"
            value={
              booking.petCount > 0
                ? `${booking.petCount} — ${booking.petName ?? "—"}`
                : "—"
            }
          />
          <Row label="Total" value={formatMoney(booking.totalAmount ?? total)} />
        </dl>

        {booking.notes && (
          <div className="mt-3">
            <dt className="text-xs text-muted">Catatan kunjungan</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
              {booking.notes}
            </dd>
          </div>
        )}

        {booking.cancelReason && (
          <Alert variant="warning" className="mt-3">
            Dibatalkan: {booking.cancelReason}
          </Alert>
        )}
      </Card>

      {/*
        WHAT CAME IN WITH THE ANIMALS — above the work rather than below it.

        It is the last thing checked before a visit closes and the first thing
        asked about when something goes missing, so it sits where somebody
        looking for it will find it without scrolling past every service. The
        card renders nothing when the booking has no belongings, so a visit
        where nobody handed anything over is unchanged.
      */}
      <BookingBelongingsCard
        booking={booking}
        petNames={
          new Map(booking.pets.map((entry) => [entry.petId, entry.petName ?? ""]))
        }
        onChanged={setBooking}
      />

      {/*
        ONE BLOCK PER ROW. This is where a visit stops being one thing: Mochi with
        Sinta at one price, Coco with Rio at another, and either of them billed
        without the other.
      */}
      <Card
        title="Yang dikerjakan"
        description="Satu blok per hewan. Tiap baris punya groomer, durasi, dan status tagihannya sendiri."
      >
        <ul className="flex flex-col gap-3">
          {booking.items.map((item) => {
            const pet = pets.find((row) => row._id === item.petId) ?? null;
            const claimed = item.pulledToCartAt ?? item.pulledToInvoiceAt;

            return (
              <li
                key={item._id}
                className="rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {item.petName ?? "—"}
                    </span>
                    <span className="block text-sm text-foreground">
                      {item.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {item.groomerName}
                      {item.durationMin
                        ? ` · ${item.durationMin} menit`
                        : " · durasi belum diisi"}
                    </span>

                    {/*
                      ─── THE GROOMER WENT ON LEAVE AFTER THIS WAS BOOKED ───────

                      The roster screen warns when the leave is SET (kriteria
                      4.9), but that warning fires once and is gone when the page
                      closes. Until this existed the booking remembered nothing:
                      on Thursday morning it still read "Sinta", and the only
                      person who knew was whoever had ticked the box days before.

                      `role="alert"` — it is not decoration. Somebody opening this
                      booking has to be told before they read the name and assume
                      it is settled.

                      IT SAYS WHAT TO DO. A warning whose only content is "this is
                      wrong" leaves the reader to invent the remedy; there are
                      exactly two here, and naming them is the difference between
                      a notice and a task.
                    */}
                    {item.groomerOffReason && (
                      <span
                        role="alert"
                        className="mt-1 block rounded border border-danger/40 bg-danger/5 px-2 py-1 text-xs font-semibold text-danger"
                      >
                        {item.groomerName} {item.groomerOffReason.toLowerCase()}{" "}
                        — ganti groomer atau hubungi pelanggan.
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="block text-sm tabular-nums text-foreground">
                      {formatMoney(item.price)}
                    </span>
                    {/*
                      PER ROW, because that is where the marker lives since K3 —
                      and it is what makes a half-billed visit legible instead of
                      merely possible.
                    */}
                    <span className="block text-xs text-muted">
                      {claimed
                        ? item.pulledToInvoiceAt
                          ? "Sudah difakturkan"
                          : "Sudah di kasir"
                        : "Belum ditagih"}
                    </span>
                  </div>
                </div>

                {item.notes && (
                  <p className="mt-2 text-xs text-muted">{item.notes}</p>
                )}

                {/*
                  FR-5 kriteria 5.14 — the same card the booking form shows, so
                  whoever opens this booking before a hand-off reads exactly what
                  the person who took it read.
                */}
                {pet && <PetSummaryCard pet={pet} className="mt-2" />}

                <div className="mt-2 flex flex-wrap gap-2">
                  {/*
                    THE WAY INTO THE WORK, and the primary action on this block.

                    Status lives on the ROWS now — "Mochi sudah selesai mandi
                    tapi Coco belum" — so moving it happens on a page about ONE
                    animal, where there is no doubt whose button was pressed.
                    This page stays the overview: what the whole visit is, and
                    what it comes to.

                    TWO DIFFERENT PAGES, and the wording keeps them apart.
                    "Pekerjaan" is this visit; "profil" is the animal's whole
                    life, and confusing them would send somebody looking for
                    today's grooming in a list of last year's.
                  */}
                  <Button asChild size="sm">
                    <Link
                      href={`/dashboard/booking/${booking._id}/hewan/${item.petId}`}
                    >
                      Pekerjaan {item.petName ?? "hewan ini"}
                    </Link>
                  </Button>

                  {pet && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/dashboard/master/pets/${pet._id}`}>
                        Profil {pet.name}
                      </Link>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}
