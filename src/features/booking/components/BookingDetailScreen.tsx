"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Alert, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import { Can } from "@/features/permissions";
import { PetSummaryCard } from "@/features/pets";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { petService } from "@/services/pet.service";
import { formatMoney, sumDecimals } from "@/utils/decimal";
import type { Booking, Pet } from "@/types/api";

import { bookingActorLabel, finishClock } from "../format";
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
      {/*
        ─── ONE HEADING BLOCK, AND THE NUMBER IS THE TITLE ────────────────────

        The page above renders the breadcrumb and nothing else now: this used to
        sit under a `PageHeading` that said "Detail booking" over a sentence,
        which made two `<h1>`s and put the document's own identity on the fourth
        line. §16 — a document says what it is, what its number is and what can
        be done with it AT ITS HEAD.
      */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tabular-nums text-foreground">
              {/* A DRAFT HAS NO NUMBER — see the model. Saying so beats a blank. */}
              {booking.bookingNumber ?? "Booking (draf)"}
            </h1>
            <BookingStatusBadge status={booking.status} />
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
              {BILLING_LABELS[booking.billingState] ?? booking.billingState}
            </span>
          </div>
          {/*
            WHOSE, WHERE, AND WHO WROTE IT DOWN — one line, in the order somebody
            asks. The customer and the branch were already here; the audit half
            is new, and it is what turns a title into a document header: "siapa
            yang bikin booking ini" had no answer on this page at all.
          */}
          <p className="mt-1 text-sm text-muted">
            {booking.customerName ?? "—"}
            {branchName ? ` · ${branchName}` : ""}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-muted">
            Dibuat {moment(booking.createdAt)} ·{" "}
            {bookingActorLabel(booking.createdByName, booking.createdByRoleName)}
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
        {/*
          ─── FOUR FACTS ON ONE LINE, NOT FOUR ROWS OF A TWO-COLUMN LIST ───────

          These are the numbers somebody scans, not prose they read: when, how
          long, how many animals, how much. A `sm:grid-cols-2` definition list
          made four short answers occupy four rows and half the card's width
          each, so the eye travelled down and back for facts that belong in one
          glance. Four columns on a laptop, two on a phone.
        */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          <Row
            label="Waktu"
            value={
              <>
                {moment(booking.scheduledAt)}
                {/*
                  THE FINISH TIME BELONGS BESIDE THE START. The old card had a
                  field labelled "Perkiraan selesai" whose value was "121 menit"
                  — a DURATION under a label promising a CLOCK. Whoever read it
                  still had to do the arithmetic the label claimed to have done.
                */}
                {booking.totalDurationMin ? (
                  <span className="text-muted">
                    {" – "}
                    {finishClock(booking.scheduledAt, booking.totalDurationMin)}
                  </span>
                ) : null}
              </>
            }
          />
          <Row
            label="Perkiraan durasi"
            value={
              booking.totalDurationMin
                ? `${booking.totalDurationMin} menit`
                : "Belum diisi"
            }
          />
          <Row
            label="Hewan"
            value={
              booking.petCount > 0 ? (
                <>
                  {booking.petCount}
                  {/*
                    THE NAMES UNDER THE COUNT, not joined onto it with a dash.
                    "2 — Mochi, Coco" reads as one long label; the number is what
                    the column is for and the names are what it means.
                  */}
                  <span className="mt-0.5 block text-xs text-muted">
                    {booking.petName ?? "—"}
                  </span>
                </>
              ) : (
                "—"
              )
            }
          />
          <Row
            label="Total"
            value={
              <span className="tabular-nums">
                {/*
                  THE HEADER'S OWN TOTAL, and the ROWS when nothing has computed
                  one yet — a booking whose summary has not run has `null` there,
                  and summing what is on screen beats an em dash.
                */}
                {formatMoney(booking.totalAmount ?? total)}
              </span>
            }
          />
        </dl>

        {booking.notes && (
          <div className="mt-5 border-t border-border pt-4">
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
        TITIPAN OWNER LIVES ON THE ANIMAL'S PAGE NOW, not here.

        It was on this screen, grouped by animal. Handing a collar back happens
        at the table next to the animal it belongs to, and this screen is about
        what the whole visit is and what it comes to — so ticking one animal's
        things meant scrolling past two others'. The count still surfaces here:
        each block below carries "N titipan belum kembali" and links through, so
        the question "can this visit close" is still answerable from one screen.
      */}

      {/*
        ONE BLOCK PER ROW. This is where a visit stops being one thing: Mochi with
        Sinta at one price, Coco with Rio at another, and either of them billed
        without the other.
      */}
      <Card
        title="Yang dikerjakan"
        description="Satu blok per hewan. Tiap layanan punya groomer, durasi, dan status tagihannya sendiri; add-on menempel di layanannya."
      >
        <ul className="flex flex-col gap-3">
          {booking.pets.map((group) => {
            const pet = pets.find((row) => row._id === group.petId) ?? null;

            return (
              <li
                key={group.petId}
                className="rounded-lg border border-border p-3"
              >
                {/*
                  ONE BLOCK PER ANIMAL, and the services inside it — the shape
                  the API now hands over (`booking.pets`), rather than this
                  screen regrouping the flat list for itself. It used to be one
                  block per ROW, which put the animal's name, its warnings and
                  its two buttons on screen once per service, and showed an
                  add-on as a line somebody had chosen on its own.
                */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {group.petName ?? "—"}
                    </span>
                    {/*
                      THE COUNT SURVIVES THE MOVE. Ticking a collar back is done
                      on the animal's page now, but "is anything still in the
                      drawer" is a question about the WHOLE VISIT — it is the last
                      thing checked before a booking closes. So the number stays
                      here and the button below is the way to act on it.
                    */}
                    {outstandingFor(booking, group.petId) > 0 && (
                      <span className="rounded-full bg-tint-danger px-2 py-0.5 text-xs font-semibold text-danger">
                        {outstandingFor(booking, group.petId)} titipan belum
                        kembali
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatMoney(
                      sumDecimals(
                        group.services.flatMap((service) => [
                          service.price,
                          ...service.addons.map((addon) => addon.price),
                        ]),
                      ),
                    )}
                  </span>
                </div>

                {/*
                  FR-5 kriteria 5.14 — the same card the booking form shows, so
                  whoever opens this booking before a hand-off reads exactly what
                  the person who took it read. ONCE PER ANIMAL now: it is about
                  the animal, not about each thing being done to it.
                */}
                {pet && <PetSummaryCard pet={pet} className="mt-2" />}

                <ul className="mt-3 flex flex-col gap-2">
                  {group.services.map((service) => {
                    const claimed =
                      service.pulledToCartAt ?? service.pulledToInvoiceAt;

                    return (
                      <li
                        key={service.itemId}
                        className="rounded-md border border-border bg-background p-2.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="block text-sm text-foreground">
                              {service.name}
                              {/*
                                THE KIND OF WORK, from the row's own snapshot —
                                not read through the catalogue, so a renamed line
                                does not rewrite what this visit says it was.
                              */}
                              {service.serviceType && (
                                <span className="ml-2 rounded-full bg-tint-neutral px-2 py-0.5 text-xs text-muted">
                                  {service.serviceType}
                                </span>
                              )}
                            </span>
                            <span className="block text-xs text-muted">
                              {service.groomerName}
                              {service.assistantGroomers.length > 0 &&
                                ` + ${service.assistantGroomers
                                  .map((one) => one.name)
                                  .join(", ")}`}
                              {service.durationMin
                                ? ` · ${service.durationMin} menit`
                                : " · durasi belum diisi"}
                            </span>

                            {/*
                              ─── THE GROOMER WENT ON LEAVE AFTER THIS WAS
                              BOOKED ───

                              The roster screen warns when the leave is SET
                              (kriteria 4.9), but that warning fires once and is
                              gone when the page closes. Until this existed the
                              booking remembered nothing: on Thursday morning it
                              still read "Sinta", and the only person who knew was
                              whoever had ticked the box days before.

                              `role="alert"` — it is not decoration. Somebody
                              opening this booking has to be told before they read
                              the name and assume it is settled.

                              IT SAYS WHAT TO DO. A warning whose only content is
                              "this is wrong" leaves the reader to invent the
                              remedy; there are exactly two here.
                            */}
                            {service.groomerOffReason && (
                              <span
                                role="alert"
                                className="mt-1 block rounded border border-danger/40 bg-danger/5 px-2 py-1 text-xs font-semibold text-danger"
                              >
                                {service.groomerName}{" "}
                                {service.groomerOffReason.toLowerCase()} — ganti
                                groomer atau hubungi pelanggan.
                              </span>
                            )}
                          </div>

                          <div className="text-right">
                            <span className="block text-sm tabular-nums text-foreground">
                              {formatMoney(service.price)}
                            </span>
                            {/*
                              PER ROW, because that is where the marker lives
                              since K3 — and it is what makes a half-billed visit
                              legible instead of merely possible. An add-on is its
                              own row and carries its own, which is why it is
                              stated again below rather than assumed.
                            */}
                            <span className="block text-xs text-muted">
                              {claimed
                                ? service.pulledToInvoiceAt
                                  ? "Sudah difakturkan"
                                  : "Sudah di kasir"
                                : "Belum ditagih"}
                            </span>
                          </div>
                        </div>

                        {/*
                          THE ADD-ONS, UNDER THE SERVICE THEY WERE ADDED TO.
                          They are still their own stored rows — that is how each
                          bills and prints on its own line — but nobody chose
                          "Parfum" by itself, so nothing here shows it as though
                          they had.
                        */}
                        {service.addons.length > 0 && (
                          <ul className="mt-2 flex flex-col gap-1 border-l-2 border-border pl-2.5">
                            {service.addons.map((addon) => (
                              <li
                                key={addon.itemId}
                                className="flex justify-between gap-2 text-xs"
                              >
                                <span className="text-muted">
                                  + {addon.name}
                                  {addon.durationMin
                                    ? ` · ${addon.durationMin} mnt`
                                    : ""}
                                </span>
                                <span className="tabular-nums text-muted">
                                  {formatMoney(addon.price)}
                                  {(addon.pulledToCartAt ??
                                    addon.pulledToInvoiceAt) && " · ditagih"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                      </li>
                    );
                  })}
                </ul>

                {/*
                  THE TWO NOTES ARE NOT HERE. They are read and written on the
                  animal's own work page, where the card that holds them can also
                  EDIT them — this screen is the overview: what the whole visit
                  is, and what it comes to. The button below is the way to them.
                */}

                <div className="mt-3 flex flex-wrap gap-2">
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
                      href={`/dashboard/booking/${booking._id}/hewan/${group.petId}`}
                    >
                      Pekerjaan {group.petName ?? "hewan ini"}
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

/**
 * How many of this animal's things are HANDED OVER AND NOT YET GIVEN BACK.
 *
 * Something written down when the booking was taken and never actually handed
 * over is not outstanding — that is why these are two dates and not one flag,
 * and counting it would hold a visit open over something nobody brought.
 */
function outstandingFor(booking: Booking, petId: string): number {
  return (booking.belongings ?? []).filter(
    (belonging) =>
      belonging.petId === petId &&
      belonging.checkedInAt &&
      !belonging.checkedOutAt,
  ).length;
}

/**
 * One fact in the Kunjungan strip: a small caps label over its answer.
 *
 * THE LABEL IS UPPERCASE AND THE ANSWER IS NOT. Four of these sit side by side,
 * and without the case difference the row reads as eight equal lines rather than
 * four labelled facts. `text-xs` is 13px — the floor, not below it (§1.6).
 */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}
