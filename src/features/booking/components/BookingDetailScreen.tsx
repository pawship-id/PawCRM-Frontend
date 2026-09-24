"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cat, Dog, MessageCircle, Pencil, Printer } from "lucide-react";

import { Alert, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { PetSummaryCard } from "@/features/pets";
import { usePetOptions } from "@/hooks/usePetOptions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import {
  afterOwnDiscounts,
  bookingShareOf,
  ownDiscountOfLine,
} from "@/features/sales/bookingDiscount";
import { formatMoney, isPositive, sumDecimals } from "@/utils/decimal";
import { GROOMER_LEVEL_LABELS } from "@/types/api";
import type {
  Booking,
  BookingAddon,
  BookingMainService,
  BookingSession,
  BookingStatus,
  BookingWorkStatus,
  Customer,
  Pet,
  VariantChoiceSnapshot,
} from "@/types/api";

import {
  antarJemputDetailPath,
  antarJemputEditPath,
} from "@/features/antar-jemput/paths";

import { bookingActorLabel, finishClock } from "../format";
import { canStartWork, hasCompletedWork, ladderFor } from "../statusFlow";
import { BookingBelongingsCard } from "./BookingBelongingsCard";
import { BookingHistoryCard } from "./BookingHistoryCard";
import { BookingNotesCard } from "./BookingNotesCard";
import { BookingRelatedCard } from "./BookingRelatedCard";
import { BookingStatusActions } from "./BookingStatusActions";
import {
  BookingStatusBadge,
  bookingStatusLabel,
} from "./BookingStatusBadge";
import {
  AddSessionButton,
  RemoveSessionButton,
  SessionCrew,
  sharesOf,
} from "./SessionGroomers";
import { SessionAlbum } from "./SessionAlbum";
import { crewWord } from "./BookingSessionSteps";
import { SessionRecord } from "./SessionRecord";

const BILLING_LABELS: Record<Booking["billingState"], string> = {
  unbilled: "Belum ditagih",
  billed: "Sudah ditagih",
};

/** What each rung of a turn is called. */
const WORK_LABELS: Record<BookingWorkStatus, string> = {
  pending: "Belum mulai",
  in_progress: "Sedang dikerjakan",
  done: "Selesai",
};

const WORK_TONE: Record<BookingWorkStatus, string> = {
  pending: "bg-tint-neutral text-muted",
  in_progress: "bg-warning/15 text-warning",
  done: "bg-success/15 text-success",
};

/**
 * The move offered next, and nothing else.
 *
 * A FREE JUMP TO ANY RUNG IS WHAT THE REFERENCE OFFERS AND IT IS NOT COPIED. The
 * ladder exists so the trail can be read afterwards; a button that skips to
 * "done" from "not started" records a start that never happened.
 *
 * THE LABELS NAME THE ACT, AND THE ACT STAMPS THE CLOCK. Pressing "Mulai"
 * records `startedAt`; "Selesai" records `finishedAt`.
 */
const NEXT_MOVE: Partial<
  Record<BookingWorkStatus, { to: BookingWorkStatus; label: string }>
> = {
  pending: { to: "in_progress", label: "Mulai" },
  in_progress: { to: "done", label: "Selesai" },
};

/** "09.05" from an instant, in the shop's own clock — never through UTC. */
function clock(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${String(at.getHours()).padStart(2, "0")}.${String(at.getMinutes()).padStart(2, "0")}`;
}

/** "Minggu, 6 September 2026" — the day without the clock. */
function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * A phone number, turned into a `wa.me` link — or null when it cannot be.
 *
 * PHONE NUMBERS IN THIS APP ARE NOT NORMALISED AT THE DOOR — `customer.model.js`
 * stores whatever a shop typed. So it is normalised here, narrowly: strip
 * everything but digits, then turn a leading trunk `0` into `62`. Anything too
 * short to be a real number returns null rather than a link to nowhere.
 */
function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, "");
  const normalised = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;

  return normalised.length >= 9 ? `https://wa.me/${normalised}` : null;
}

/** Minutes a turn has taken so far, or null before it starts. */
function elapsed(session: BookingSession): number | null {
  if (!session.startedAt) return null;
  const from = new Date(session.startedAt).getTime();
  const to = session.finishedAt
    ? new Date(session.finishedAt).getTime()
    : Date.now();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / 60_000));
}

/**
 * ONE BOOKING, WHOLE — `/dashboard/booking/:id`.
 *
 * ─── ONE PAGE, BECAUSE ONE BOOKING IS ONE ANIMAL ──────────────────────────
 *
 * There used to be two: an overview of a visit that could hold several animals,
 * and a work sheet per animal under `/hewan/:petId`. A booking is one animal and
 * one main service now, so the overview and the work sheet describe the same
 * thing — and the old address redirects here.
 *
 * WHAT IT ANSWERS, top to bottom: which booking this is and where it stands
 * (number, status, billing, the next move); the appointment itself (when,
 * where, the trip, what is being charged); the animal and whose it is; what was
 * handed over; the work, turn by turn; the album. The rail carries what is read
 * while something else is being done — the notes, the other bookings of the
 * same visit, and the trail.
 *
 * ─── THIS IS NOT THE PET PROFILE ───────────────────────────────────────────
 *
 * `/dashboard/master/pets/:id` is about the animal in general — allergies,
 * preferences, a lifetime of visits. This is about ONE booking's work.
 */
export function BookingDetailScreen({ id }: { id: string }) {
  /* A ride is sent to its own page as soon as this one has read it — below. */
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  /*
    WHAT EVERY WRITER ON THIS PAGE HANDS BACK. A mutation answers with the
    booking but not its `group[]` and `related[]` — only `GET /bookings/:id`
    carries those — so they are kept from the booking already on screen rather
    than vanishing from "Booking terkait" the moment a status moves.
  */
  const replaceBooking = useCallback((next: Booking) => {
    setBooking((prev) => ({
      ...next,
      group: next.group ?? prev?.group,
      related: next.related ?? prev?.related,
    }));
  }, []);
  /*
    WHO MAY BE BOOKED ON THE DAY THIS BOOKING IS FOR — the same read the booking
    form makes: somebody who is off on Thursday must not be offered for a
    Thursday session. Best effort and silent; without it the crew editor simply
    does not offer anybody.
  */
  const [groomers, setGroomers] = useState<
    { value: string; label: string; disabled?: boolean }[]
  >([]);
  const [pet, setPet] = useState<Pet | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /*
    WHICH SESSIONS ARE OPEN. Unset means "follow the work": the one being done
    now opens itself, the rest stay shut — a closed row already answers who,
    where, and how many minutes.
  */
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  /* The tenant's words for the animal — species, breed, size, coat. */
  const { label: petOptionLabel } = usePetOptions();

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    bookingService
      .getById(id)
      .then(async (found) => {
        if (!active) return;

        /*
          A RIDE HAS ITS OWN PAGE (23 September 2026) —
          `/dashboard/layanan/antar-jemput/:id`. This page is built round one
          animal and its grooming; a van has two ends, a direction and a driver.

          REDIRECTED RATHER THAN RE-POINTED EVERYWHERE. Half the links that
          reach a booking — a commission row, an invoice line — hold nothing but
          an id, so they cannot know which of the two pages to aim at. Answering
          it HERE, where the booking has actually been read, keeps every one of
          them correct without being found and edited.
        */
        if (found.tripLeg) {
          router.replace(antarJemputDetailPath(found._id));
          return;
        }

        setBooking(found);
        setError(null);

        /*
          THREE SIDE READS, ALL ALLOWED TO FAIL. The booking carries the animal's
          name and the work already; the profile adds allergies, the customer
          adds a phone number, the branch adds a place. A page that refused to
          show the work because one of them timed out would send somebody to the
          table with nothing.
        */
        /* A RIDE HAS NO ANIMAL OF ITS OWN (23 September 2026) — its animals
           are `passengers`, already named on the booking. Asking for `null`
           would be a request for a pet nobody named. */
        const [petResult, customerResult, branchResult] =
          await Promise.allSettled([
            found.petId ? petService.getById(found.petId) : Promise.resolve(null),
            customerService.getById(found.customerId),
            branchService.getById(found.branchId),
          ]);

        if (!active) return;

        if (petResult.status === "fulfilled") setPet(petResult.value);
        if (customerResult.status === "fulfilled") {
          setCustomer(customerResult.value);
        }
        if (branchResult.status === "fulfilled") {
          setBranchName(branchResult.value.name);
        }
      })
      .catch((err) => {
        if (!active) return;
        setBooking(null);
        setError(
          err instanceof ApiError && err.status === 404
            ? "Booking ini tidak ada, atau bukan milik toko Anda."
            : "Booking tidak bisa dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    /*
      ⚠️ NO REFETCH NONCE. Every writer on this page hands its answer back —
      `setBooking` — so this effect runs on MOUNT and when the route changes, and
      nothing else. Re-adding a nonce would bring back the four-request
      full-page flash it was removed for.
    */
  }, [id, router]);

  useEffect(() => {
    if (!booking?.scheduledAt) return;

    let active = true;
    const day = new Date(booking.scheduledAt);
    const date = [
      day.getFullYear(),
      String(day.getMonth() + 1).padStart(2, "0"),
      String(day.getDate()).padStart(2, "0"),
    ].join("-");

    bookingService
      /* A ride's crew is its driver (21 September 2026). */
      .availability(date, booking.tripLeg ? "driver" : "groomer")
      .then((rows) => {
        if (!active) return;
        setGroomers(
          rows.map((row) => {
            /* "Sinta · Senior" — the same label the crew row shows. */
            const name = row.groomerLevel
              ? `${row.fullName} · ${GROOMER_LEVEL_LABELS[row.groomerLevel]}`
              : row.fullName;

            return {
              value: row._id,
              label: row.offReason ? `${name} — ${row.offReason}` : name,
              disabled: Boolean(row.offReason),
            };
          }),
        );
      })
      .catch(() => {
        if (active) setGroomers([]);
      });

    return () => {
      active = false;
    };
  }, [booking?.scheduledAt, booking?.tripLeg]);

  async function move(session: BookingSession, name: string, to: BookingWorkStatus) {
    if (busy) return;
    setBusy(session.sessionId);

    try {
      /*
        ⚠️ THE ANSWER IS PUT STRAIGHT INTO STATE, NOT USED AS A DOORBELL. `PATCH
        .../work` answers with the same document `GET /bookings/:id` would, and
        the three neighbouring records cannot have changed because a bath
        started.
      */
      replaceBooking(
        await bookingService.advanceSessionWork(id, session.sessionId, to),
      );

      /* Chrome must never be able to fail a save — see BookingForm. */
      try {
        swalToast(`${name}: ${WORK_LABELS[to].toLowerCase()}.`);
      } catch {
        /* The page already shows it. */
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Tidak bisa mengubah status pekerjaan. Coba lagi.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat booking…
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="error">{error}</Alert>
        <Button variant="secondary" asChild className="self-start">
          <Link href="/dashboard/booking">Kembali ke daftar booking</Link>
        </Button>
      </div>
    );
  }

  if (!booking) return null;

  const service = booking.service;
  const addons = service?.addons ?? [];
  const sessions = service?.sessions ?? [];
  const petName = booking.petName ?? pet?.name ?? "Hewan ini";

  /*
    ⚠️ MAY WORK BEGIN AT ALL — asked once, for the whole page. A turn cannot be
    started while the booking is still Draft or Requested; the server refuses it,
    and a board full of "Mulai" buttons that all answer 409 is worse than a board
    with none.
  */
  const startable = canStartWork(booking);

  /*
    THE OTHER END OF THE LADDER — at or past `completed`, where the work is over
    and its commission is computed. Anything touching money closes here: the
    edit form, adding a turn.
  */
  const finished = hasCompletedWork(booking);

  /*
    THE RUNGS THIS BOOKING WALKS, AND HOW FAR IT HAS COME. `ladderFor` already
    drops a trip leg nobody booked; `draft` is dropped here because it is where a
    booking sits before it is an appointment, not a step. `reached` is -1 for a
    status off the track — `draft` itself, and `cancelled`.
  */
  const track: BookingStatus[] = ladderFor(booking).filter(
    (rung) => rung !== "draft",
  );
  const reached = track.indexOf(booking.status);

  /*
    MONEY AND ESTIMATE COME OFF THE SERVICE, NOT OFF THE TURNS. A service split
    into three turns is still one bath. The server's own summary is preferred;
    the sum on screen is the fallback for a booking whose summary has not run.
  */
  const total =
    booking.netAmount ??
    booking.totalAmount ??
    sumDecimals([
      ...(service ? [service.price] : []),
      ...addons.map((addon) => addon.price),
    ]);
  /*
    ⚠️ ADD-ONS ARE IN THE ESTIMATE. "+30 menit detangling" lengthens the visit
    exactly as the catalogue says it does — an estimate without it promises the
    owner an earlier finish than the shop can manage.
  */
  const estimate =
    booking.totalDurationMin ??
    (service?.durationMin ?? 0) +
      addons.reduce((sum, addon) => sum + (addon.durationMin ?? 0), 0);
  /* The ACTUAL time is what each person really spent, so it sums the turns. */
  const actual = sessions.reduce(
    (sum, session) => sum + (elapsed(session) ?? 0),
    0,
  );
  const doneRows = sessions.filter((session) => session.status === "done").length;

  const trail = booking.statusHistory ?? [];
  const lastEvent = trail[trail.length - 1];

  /*
    THE UNFINISHED TURNS the server refuses to complete over — shown before the
    button is pressed rather than discovered as a 409 afterwards. A turn with
    nobody on it counts too: sessions arrive seeded from the catalogue, and
    those are exactly the ones that block the move.
  */
  const blocking =
    booking.status !== "cancelled" &&
    booking.status !== "completed" &&
    sessions.some((session) => session.status !== "done");

  /*
    NO "UBAH" ONCE THE MONEY IS SETTLED. The server refuses a PATCH once the work
    is completed, and a cancelled booking has nowhere left to go — offering the
    button would send somebody to a form that cannot save.
  */
  const editable = !finished && booking.status !== "cancelled";

  const whatsapp = waLink(customer?.phone);
  /* A ride is corrected in its own form — the direction, the address, the van. */
  const editHref = booking.tripLeg
    ? antarJemputEditPath(booking._id)
    : `/dashboard/booking/${booking._id}/edit`;
  const trips = booking.trips ?? [];
  const passengerNames = (booking.passengers ?? [])
    .map((one) => one.name)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col gap-4">
      {/*
        ─── ONE HEADING BLOCK, AND THE NUMBER IS THE TITLE ──────────────────────

        A DOCUMENT'S TITLE IS ITS NUMBER. The page above renders the breadcrumb
        and nothing else; §16 — a document says what it is, what its number is
        and what can be done with it AT ITS HEAD. The animal and the service are
        directly under it, because on a day sheet that is how a booking is named.
      */}
      <Card>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-50 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tabular-nums text-foreground">
                {/* A DRAFT HAS NO NUMBER — see the model. Saying so beats a blank. */}
                {booking.bookingNumber ?? "Booking (draf)"}
              </h1>
              <BookingStatusBadge status={booking.status} tripLeg={booking.tripLeg} />
              {/* A WORD, NOT A COLOUR (§1.3) — and a claim, so it says who holds it. */}
              <span className="rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-muted">
                {booking.pulledToCartAt && !booking.pulledToInvoiceAt
                  ? booking.posTransactionId
                    ? "Sudah dibayar"
                    : "Ada di keranjang"
                  : (BILLING_LABELS[booking.billingState] ??
                    booking.billingState)}
              </span>
            </div>

            {/*
              ONLY THE AUDIT LINE UNDER THE TITLE, as the mockup has it. The
              animal, the service and the owner's number are not lost: the
              Kunjungan and Hewan & Pelanggan cards below carry all three.

              WHO MADE THIS, AND WHEN — not the appointment's own date, which is
              in Kunjungan. The name and role go through `bookingActorLabel`, the
              formatter the trail uses, so the two never render one fact two ways.
              `tabular-nums`, not the mockup's monospace: §5 allows two typefaces.
            */}
            <p className="mt-1.5 text-sm tabular-nums text-muted">
              Dibuat{" "}
              {new Date(booking.createdAt).toLocaleString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              ·{" "}
              {bookingActorLabel(
                booking.createdByName,
                booking.createdByRoleName,
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <Can feature="bookings" action="update">
                <Button asChild variant="secondary" size="sm">
                  <Link href={editHref}>
                    <Pencil className="size-4" aria-hidden />
                    Ubah
                  </Link>
                </Button>
              </Can>
            )}
            {/*
              CETAK: the printable card built for the groomer at the wet table
              (kriteria 5.12). WHATSAPP: only a link when a number could actually
              be normalised; a button that opens WhatsApp to nowhere is worse than
              no button.
            */}
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/dashboard/master/pets/${booking.petId}/print`}>
                <Printer className="size-4" aria-hidden />
                Cetak
              </Link>
            </Button>
            {whatsapp && (
              <Button variant="ghost" size="sm" asChild>
                <a href={whatsapp} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" aria-hidden />
                  WhatsApp
                </a>
              </Button>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-4">
          <div className="min-w-45 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              Status sejak
            </p>
            <p className="text-xs tabular-nums text-foreground">
              {/* The name WITH the role, through the same formatter as the
                  "Dibuat" line and the trail — "Jess (super admin)". */}
              {lastEvent
                ? `${new Date(lastEvent.at).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })} · ${bookingActorLabel(lastEvent.byName, lastEvent.byRoleName)}`
                : "—"}
            </p>

            {/*
              ─── ONE SEGMENT PER RUNG, NOT PER SESSION ────────────────────────

              It tracks THE BOOKING'S PATH: Requested → … → Return to Pawrents,
              filled as far as this dog has come — including the trip legs, which
              `ladderFor` puts there only when a van was actually booked.

              ⚠️ NAVY, NOT ORANGE, for a rung that has been passed — ui-rules §4.
              "How far along" is not a call to action.
            */}
            <div
              className="mt-1.5 flex items-center gap-1"
              role="img"
              aria-label={
                reached < 0
                  ? `Status ${booking.status} — di luar alur kunjungan`
                  : `${reached + 1} dari ${track.length} tahap: ${bookingStatusLabel(booking.status, booking)}`
              }
            >
              {track.map((rung, index) => (
                <span
                  key={rung}
                  /* A van's last two rungs read On the Way and Arrived. */
                  title={bookingStatusLabel(rung, booking)}
                  className={`h-1 flex-1 rounded-full ${
                    index <= reached ? "bg-primary" : "bg-border"
                  }`}
                />
              ))}
            </div>
          </div>

          {blocking && (
            /*
              THE FACT THE SERVER WOULD ANSWER WITH IF "Mark completed" WERE
              PRESSED ANYWAY — said first. A courtesy, never the gate. §13: danger
              text must stay semibold and paired with a word.
            */
            <p className="text-sm font-semibold text-danger">
              Layanan belum selesai
            </p>
          )}

          <p className="text-xs tabular-nums text-muted">
            {doneRows} dari {sessions.length} sesi selesai
          </p>

          {/*
            THE STATUS CONTROL — the SAME component the day sheet uses: same
            dialog, same confirm step, same server guard. UNGATED HERE: it gates
            its own items internally.
          */}
          <BookingStatusActions
            booking={booking}
            onChanged={replaceBooking}
            variant="prominent"
          />
        </div>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {booking.cancelReason && (
        <Alert variant="warning">Dibatalkan: {booking.cancelReason}</Alert>
      )}

      {/*
        TWO COLUMNS: the work on the left, and a rail on the right for the things
        somebody reads rather than does.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {/* ─── Kunjungan ──────────────────────────────────────────────── */}
          <Card
            title="Kunjungan"
            /*
              THE WAY TO CORRECT WHAT IS BEING CHARGED, on the card that states
              it — and `Can` keeps it off the page for whoever may read the work
              but not reprice it.
            */
            action={
              editable ? (
                <Can feature="bookings" action="update">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={editHref}>
                      <Pencil className="size-4" aria-hidden />
                      Edit layanan &amp; harga
                    </Link>
                  </Button>
                </Can>
              ) : null
            }
          >
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Tanggal" value={dayOf(booking.scheduledAt)} />
              {/*
                A RANGE, NOT A START. "09.00 – 12.00" answers when the animal goes
                home, which is the question the owner actually asks at the
                counter. The end is the start plus what this booking is ESTIMATED
                to take.
              */}
              <Field
                label="Waktu"
                value={
                  <span className="tabular-nums">
                    {clock(booking.scheduledAt)}
                    {estimate > 0 &&
                      ` – ${finishClock(booking.scheduledAt, estimate)}`}
                  </span>
                }
              />
              <Field label="Cabang" value={branchName ?? "—"} />
              {booking.tripLeg ? (
                /*
                  A RIDE (21 September 2026): its direction and who else is in
                  the van, where a booking of anything else has its place and
                  its trip. The two ends are under the grid.
                */
                <>
                  <Field
                    label="Arah"
                    value={booking.tripLeg === "pickup" ? "Jemput" : "Antar"}
                  />
                  <Field
                    label="Hewan ikut"
                    value={passengerNames || "Tidak ada"}
                  />
                </>
              ) : (
                <>
                  <Field
                    label="Lokasi"
                    value={
                      booking.location === "in_home"
                        ? "Di rumah pelanggan"
                        : "Di toko"
                    }
                  />
                  {/*
                    SPELLED OUT RATHER THAN TICKED. "Tidak ada" is a real answer
                    a driver needs; an empty field reads as nobody having
                    decided. A RIDE BOOKED FOR THIS VISIT answers it too, by its
                    number (21 September 2026).
                  */}
                  <Field
                    label="Antar-jemput"
                    value={
                      trips.length > 0
                        ? trips
                            .map(
                              (trip) =>
                                `${trip.tripLeg === "pickup" ? "Jemput" : "Antar"} ${trip.bookingNumber ?? "(draf)"}`,
                            )
                            .join(" · ")
                        : booking.pickupRequested && booking.deliveryRequested
                          ? "Jemput & antar pulang"
                          : booking.pickupRequested
                            ? "Jemput saja"
                            : booking.deliveryRequested
                              ? "Antar pulang saja"
                              : "Tidak ada"
                    }
                  />
                </>
              )}
              <Field
                label="Durasi aktual"
                value={
                  <span className="tabular-nums">
                    {actual} mnt{" "}
                    <span className="font-normal text-muted">
                      / est {estimate}
                    </span>
                  </span>
                }
              />
            </dl>

            {booking.tripLeg ? (
              /*
                BOTH ENDS ARE STORED (23 September 2026), so neither is guessed
                from the direction any more — a van may start at another branch.
              */
              <dl className="mt-3 grid gap-1 text-sm">
                {(
                  [
                    ["Asal", booking.tripOrigin],
                    ["Tujuan", booking.tripDestination],
                  ] as const
                ).map(([label, point]) => (
                  <div key={label} className="flex gap-3">
                    <dt className="w-16 flex-none text-muted">{label}</dt>
                    <dd className="min-w-0 text-foreground">
                      {point?.address ??
                        booking.tripAddress ??
                        customer?.address ??
                        "Alamat belum dicatat"}
                      {point?.lat != null && point?.lng != null && (
                        <span className="block text-xs tabular-nums text-muted">
                          {point.lat}, {point.lng}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              (booking.pickupRequested || booking.deliveryRequested) && (
                <p className="mt-3 text-sm text-muted">
                  Alamat jemput/antar:{" "}
                  <span className="text-foreground">
                    {booking.tripAddress ?? "alamat pelanggan yang tersimpan"}
                  </span>
                </p>
              )
            )}

            {/*
              WHAT IS BEING CHARGED, AND WHAT IS ADDED TO IT. An add-on hangs off
              the service it was added to instead of sitting beside it as though
              somebody had chosen "Parfum" on its own.
            */}
            {service && (
              <div className="mt-4 border-t border-border pt-3">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-medium text-foreground">
                    {service.name}
                    {/* THE KIND OF WORK, from the booking's own snapshot. */}
                    {service.serviceType && (
                      <span className="ml-2 rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-normal text-muted">
                        {service.serviceType}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatMoney(service.price)}
                  </span>
                </div>
                {/*
                  THE FACTS THE PRICE WAS QUOTED FROM: a variant service costs
                  what THIS animal's size and coat say it costs.
                */}
                <p className="text-xs text-muted">
                  {[
                    petOptionLabel("size", booking.petSize ?? pet?.size),
                    petOptionLabel("furType", pet?.furType),
                    service.durationMin
                      ? `${service.durationMin} mnt`
                      : "durasi belum diisi",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {/*
                  WHAT IT WAS PRICED ON BEYOND THE ANIMAL (17 September 2026) —
                  the staff's choices and the zone, as the booking stored them.
                */}
                {pricedOn(service) && (
                  <p className="text-xs text-muted tabular-nums">{pricedOn(service)}</p>
                )}
                {/* THE SERVICE'S OWN DISCOUNT, on its row. */}
                {ownDiscountOfLine(service) && (
                  <div className="flex justify-between gap-3 pl-3 text-sm">
                    <span className="text-success">Diskon item</span>
                    <span className="font-semibold tabular-nums text-success">
                      − {formatMoney(ownDiscountOfLine(service)!)}
                    </span>
                  </div>
                )}

                {addons.length > 0 && (
                  <ul className="mt-2 border-l-2 border-border pl-3">
                    {addons.map((addon) => (
                      <li
                        key={addon.itemId}
                        className="flex flex-wrap justify-between gap-x-3 py-1 text-sm"
                      >
                        <span className="text-muted">
                          + {addon.name}
                          {addon.durationMin
                            ? ` · +${addon.durationMin} mnt`
                            : ""}
                          {/* Only an add-on's OWN choices — an inherited one repeats the service's. */}
                          {ownChoicesOf(addon, service) && (
                            <span className="block text-xs">{ownChoicesOf(addon, service)}</span>
                          )}
                        </span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatMoney(addon.price)}
                        </span>
                        {ownDiscountOfLine(addon) && (
                          <span className="flex w-full justify-between gap-3 pl-3">
                            <span className="text-success">Diskon item</span>
                            <span className="font-semibold tabular-nums text-success">
                              − {formatMoney(ownDiscountOfLine(addon)!)}
                            </span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {/*
                  THE BOOKING'S SHARE OF "DISKON SELURUH BOOKING", ONCE, under a
                  subtotal of the lines after their own discounts — the same split
                  the till and the invoice show (16 September 2026).
                */}
                {isPositive(bookingShareOf(booking)) && (
                  <div className="mt-2 border-t border-border pt-2">
                    <div className="flex justify-between gap-3 py-1 text-sm">
                      <span className="text-muted">Subtotal</span>
                      <span className="tabular-nums text-muted">
                        {formatMoney(afterOwnDiscounts(booking))}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3 py-1 text-sm">
                      <span className="text-success">Diskon booking</span>
                      <span className="font-semibold tabular-nums text-success">
                        − {formatMoney(bookingShareOf(booking))}
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-2 flex justify-between gap-3 border-t-2 border-foreground pt-2 text-sm">
                  <span className="font-extrabold">Total</span>
                  <span className="text-lg font-extrabold tabular-nums">
                    {formatMoney(total)}
                  </span>
                </div>
              </div>
            )}

            {booking.notes && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  Catatan kunjungan
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                  {booking.notes}
                </p>
              </div>
            )}
          </Card>

          {/* ─── Hewan & Pelanggan ──────────────────────────────────────── */}
          <Card title="Hewan &amp; Pelanggan">
            {pet ? (
              <>
                {/*
                  THE ANIMAL, AT ARM'S LENGTH. A groomer reads this while holding a
                  dog: the name, then the facts that decide how it is handled, then
                  the warnings. AN ICON, NOT AN EMOJI (§1.8), keyed on the seeded
                  `cat` code with the dog for everything else — the WORD beside the
                  name is what says which animal it is.
                */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary/20 text-secondary-foreground">
                      {pet.species === "cat" ? (
                        <Cat className="size-6" aria-hidden />
                      ) : (
                        <Dog className="size-6" aria-hidden />
                      )}
                    </span>

                    <div className="min-w-0">
                      <p className="text-base font-extrabold text-foreground">
                        {pet.name}
                      </p>
                      <p className="text-xs text-muted">
                        {[
                          petOptionLabel("breed", pet.breed),
                          pet.weightKg ? `${pet.weightKg} kg` : null,
                          petOptionLabel("species", pet.species),
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>

                      {/*
                        SIZE AND COAT AS CHIPS, because they are the two facts a
                        variant price is quoted from. Absent rather than a dash
                        when nobody has recorded them.
                      */}
                      {(pet.size || pet.furType) && (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {[
                            petOptionLabel("size", pet.size),
                            petOptionLabel("furType", pet.furType),
                          ]
                            .filter((label): label is string => Boolean(label))
                            .map((label) => (
                              <li
                                key={label}
                                className="rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-foreground"
                              >
                                {label}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/*
                    THE WAY OUT TO THE ANIMAL ITSELF, ON THE NAME'S LINE. TWO
                    DIFFERENT PAGES, and the wording keeps them apart: this page is
                    one booking, the profile is the animal's whole life.
                  */}
                  <Button
                    variant="secondary"
                    size="sm"
                    asChild
                    className="shrink-0"
                  >
                    <Link href={`/dashboard/master/pets/${booking.petId}`}>
                      Profil {petName}
                    </Link>
                  </Button>
                </div>

                {/*
                  THE HANDLING NOTES AND THE ALLERGIES, in the card the whole app
                  already uses for them — FR-5 kriteria 5.14. A second way of
                  saying "severe allergy" is a second way to get it wrong.
                */}
                <PetSummaryCard pet={pet} className="mt-3" />
              </>
            ) : (
              <p className="text-sm text-muted">
                Profil hewan tidak bisa dimuat — pekerjaannya tetap bisa
                dikerjakan.
              </p>
            )}

            <dl className="mt-3 grid gap-x-6 gap-y-3 border-t border-border pt-3 sm:grid-cols-2">
              <Field label="Pelanggan" value={booking.customerName ?? "—"} />
              <Field
                label="WhatsApp"
                value={
                  <span className="tabular-nums">{customer?.phone ?? "—"}</span>
                }
              />
            </dl>
          </Card>

          {/*
            WHAT CAME IN WITH THIS ANIMAL. ABOVE THE SESSIONS, not under them:
            what the owner handed over is checked at the two moments that bracket
            the work — arrival and collection — and the sessions are the longest
            card on the page.
          */}
          <BookingBelongingsCard booking={booking} onChanged={replaceBooking} />

          {/* ─── Sesi ───────────────────────────────────────────────────── */}
          <Card
            title="Sesi pengerjaan"
            description={`aktual ${actual} / est ${estimate} mnt`}
          >
            {/*
              ONE ROW PER TURN. A Full Grooming worked by Sinta and then Rio is two
              turns, two clocks and two people to pay. A service with no turns
              still says so: work nobody has been told to do is what a groomer
              opening this page most needs to see.
            */}
            {sessions.length === 0 ? (
              <p className="text-sm text-muted">
                {`Belum ada sesi — tambahkan satu untuk menugaskan ${crewWord(booking)}.`}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sessions.map((session) => {
                  const status = session.status ?? "pending";
                  /* THE TURN'S OWN NAME. The service names the card, so
                     repeating it would put "Full Grooming" twice on one block. */
                  const name =
                    session.sessionName &&
                    session.sessionName !== service?.name
                      ? session.sessionName
                      : "Sesi";
                  const crew =
                    session.groomers.length > 0
                      ? session.groomers.map((who) => who.name).join(" + ")
                      : "Belum ditentukan";
                  /* THE HEADER NAMES EACH PERSON WITH THEIR PART of the turn —
                     "Sinta 33% · Dedi 33% · Rina 34%". The leave warning below
                     keeps the plain names. */
                  const shares = sharesOf(session);
                  const crewLabel =
                    session.groomers.length > 0
                      ? session.groomers
                          .map((who) => `${who.name} ${shares[who._id]}%`)
                          .join(" · ")
                      : "Belum ditentukan";
                  const offReason =
                    session.groomers.find((who) => who.offReason)?.offReason ??
                    null;
                  /* A TURN WITH NOBODY ON IT CANNOT BE STARTED — the server
                     refuses it, and the row says so instead of offering a
                     button that 400s. */
                  const assigned = session.groomers.length > 0;
                  const next = assigned ? NEXT_MOVE[status] : null;
                  const minutes = elapsed(session);
                  /* THE SERVICE'S DURATION, because a turn has none of its own. */
                  const planned = service?.durationMin ?? null;
                  const over =
                    minutes !== null && planned !== null && minutes > planned;
                  const open =
                    openRows[session.sessionId] ?? status === "in_progress";

                  return (
                    <li
                      key={session.sessionId}
                      className={`overflow-hidden rounded-xl border ${
                        status === "in_progress"
                          ? "border-warning"
                          : status === "done"
                            ? "border-success/40"
                            : "border-border"
                      }`}
                    >
                      {/*
                        THE CLOSED ROW ALREADY ANSWERS THE COMMON QUESTIONS — who
                        is on it, where it stands, and how many minutes. Opening is
                        for the things you change.
                      */}
                      <button
                        type="button"
                        onClick={() =>
                          setOpenRows((prev) => ({
                            ...prev,
                            [session.sessionId]: !open,
                          }))
                        }
                        aria-expanded={open}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                          status === "in_progress"
                            ? "bg-warning/10"
                            : status === "done"
                              ? "bg-success/5"
                              : "bg-surface"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                          {name}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${WORK_TONE[status]}`}
                        >
                          {WORK_LABELS[status]}
                        </span>
                        <span className="hidden whitespace-nowrap text-xs tabular-nums text-muted sm:inline">
                          {crewLabel}
                        </span>
                        <span className="whitespace-nowrap text-xs tabular-nums text-foreground">
                          {minutes === null ? "—" : `${minutes}'`}
                          {over && (
                            <span className="font-semibold text-danger">
                              {" "}
                              +{minutes - planned}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted" aria-hidden>
                          {open ? "▲" : "▼"}
                        </span>
                      </button>

                      {open && (
                        <div className="border-t border-border p-3">
                          {offReason && (
                            /*
                              THE GROOMER WENT ON LEAVE AFTER THIS WAS BOOKED.
                              `role="alert"` — somebody opening this booking has to
                              be told before they read the name and assume it is
                              settled. IT SAYS WHAT TO DO.
                            */
                            <p
                              role="alert"
                              className="mb-3 rounded-md bg-tint-danger px-2 py-1 text-sm font-semibold text-danger"
                            >
                              {crew} {offReason.toLowerCase()} — ganti{" "}
                              {crewWord(booking)} atau hubungi pelanggan.
                            </p>
                          )}

                          {/* WHO IS ON THIS TURN — inside the turn's own row,
                              under the name it acts on. */}
                          <div className="mb-3">
                            <SessionCrew
                              crewWord={crewWord(booking)}
                              bookingId={booking._id}
                              session={session}
                              groomers={groomers}
                              onChanged={replaceBooking}
                            />
                          </div>

                          {/*
                            THE CLOCK IS READ, NOT TYPED. Starting a turn stamps
                            `startedAt`, finishing it stamps `finishedAt`, both
                            server-side. Correcting a stamp is `PATCH .../times`,
                            audited, and not reachable from this screen yet.
                          */}
                          <dl className="flex flex-wrap gap-x-6 gap-y-2">
                            <Field
                              label="Mulai"
                              value={
                                <span className="tabular-nums">
                                  {clock(session.startedAt) || "—"}
                                </span>
                              }
                            />
                            <Field
                              label="Selesai"
                              value={
                                <span className="tabular-nums">
                                  {clock(session.finishedAt) || "—"}
                                </span>
                              }
                            />
                            <Field
                              label="Aktual"
                              value={
                                <span className="tabular-nums">
                                  {minutes === null ? "—" : `${minutes} mnt`}
                                  {over && (
                                    <span className="ml-1 text-danger">
                                      +{minutes - planned}
                                    </span>
                                  )}
                                </span>
                              }
                            />
                          </dl>

                          {/* What HAPPENED, above what happens NEXT. */}
                          <div className="mt-3">
                            <SessionRecord
                              bookingId={booking._id}
                              session={session}
                              onChanged={replaceBooking}
                            />
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Can
                              feature="bookings"
                              action={["advanceStatus", "update"]}
                            >
                              {next && (
                                <Button
                                  size="sm"
                                  disabled={
                                    busy === session.sessionId || !startable
                                  }
                                  onClick={() =>
                                    void move(session, name, next.to)
                                  }
                                >
                                  {busy === session.sessionId
                                    ? "Menyimpan…"
                                    : next.label}
                                </Button>
                              )}
                              {/*
                                ⚠️ NO "Buka lagi". A finished turn stays finished
                                from this screen — the shop's decision. The server
                                still allows `done → in_progress` for a correction
                                through the API; what was removed is the
                                affordance, not the move.

                                ⚠️ TWO REASONS A TURN CANNOT MOVE, AND THE RUNG IS
                                SAID FIRST: the server refuses on the rung either
                                way, so fixing the crew first would change nothing.
                              */}
                              {!startable ? (
                                <p className="text-xs text-muted">
                                  Sesi baru bisa dikerjakan kalau status
                                  bookingnya sudah In Progress.
                                </p>
                              ) : (
                                !assigned && (
                                  <p className="text-xs text-muted">
                                    {`Tentukan ${crewWord(booking)}nya dulu — sesi tanpa ${crewWord(booking)} tidak bisa dimulai.`}
                                  </p>
                                )
                              )}
                            </Can>

                            {/* LAST, AND PUSHED RIGHT — pressed almost never and
                                it cannot be undone. */}
                            <RemoveSessionButton
                              bookingId={booking._id}
                              session={session}
                              onChanged={replaceBooking}
                            />
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/*
              ⚠️ NOT ONCE THE WORK IS OVER. A new turn on a finished service
              REOPENS it — which drags the booking back off `completed` after its
              commission has been computed. The server refuses it (409); this is
              the screen not offering what would be refused.
            */}
            {!finished && service && (
              <div className="mt-3">
                <AddSessionButton
                  bookingId={booking._id}
                  service={service}
                  onChanged={replaceBooking}
                />
              </div>
            )}
          </Card>

          {/* ─── Album ──────────────────────────────────────────────────────
              What the dog came in like and what it left like — `booking.media`,
              a different array from a turn's own photos. */}
          <SessionAlbum booking={booking} onChanged={replaceBooking} />
        </div>

        {/* ─── The rail ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-20">
          {/*
            THE TWO NOTES, EDITABLE, AT THE HEAD OF THE RAIL. The form can only
            capture what was known when the appointment was taken; what is learned
            at the table is written here, where it stays in view beside the work.
          */}
          <BookingNotesCard booking={booking} onChanged={replaceBooking} />

          {/*
            ─── BOOKING TERKAIT (21 September 2026) ──────────────────────────
            "Satu kunjungan" grown into BO's "Relevant bookings": the visit's
            other bookings, the ones billed with this one, and "Tautkan booking"
            to relate another. Nothing is ADDED from here since 24 September
            2026 — see the card.
          */}
          <BookingRelatedCard booking={booking} onChanged={replaceBooking} />

          <BookingHistoryCard booking={booking} />

          {/*
            THE REFERENCE'S OWN NOTE, and it is right: this page is open at the
            counter all day. Commission figures are payroll, and payroll has its
            own grant.
          */}
          <Card>
            <p className="text-xs text-muted">
              Angka komisi ada di{" "}
              <Link
                href="/dashboard/reports/commissions"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Laporan › Komisi
              </Link>{" "}
              — izinnya terpisah dari halaman ini.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * One label-over-value pair. The label is 13 px — the floor, not below it
 * (§1.6) — and uppercase, so a row of these reads as labelled facts rather than
 * as twice as many equal lines.
 */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

/** "Lokasi: Di Rumah" — a line's staff choices, as it stored them. */
function choicesWords(choices: readonly VariantChoiceSnapshot[] | undefined): string | null {
  const words = (choices ?? []).map((choice) => `${choice.name}: ${choice.label}`);
  return words.length > 0 ? words.join(" · ") : null;
}

/** "Lokasi: Di Rumah · Zona A · 2 km" — what the main service was priced on beyond the pet. */
function pricedOn(service: Pick<BookingMainService, "variantChoices" | "zone">): string | null {
  const zone = service.zone
    ? `${service.zone.name}${
        service.zone.distanceKm === null ? "" : ` · ${String(service.zone.distanceKm).replace(".", ",")} km`
      }`
    : null;
  const words = [choicesWords(service.variantChoices), zone].filter(Boolean);
  return words.length > 0 ? words.join(" · ") : null;
}

/** An add-on's choices, only where they are not the main service's. */
function ownChoicesOf(
  addon: Pick<BookingAddon, "variantChoices">,
  service: Pick<BookingMainService, "variantChoices">,
): string | null {
  const inherited = new Set(
    (service.variantChoices ?? []).map((choice) => `${choice.optionId}|${choice.code}`),
  );
  return choicesWords(
    (addon.variantChoices ?? []).filter(
      (choice) => !inherited.has(`${choice.optionId}|${choice.code}`),
    ),
  );
}
