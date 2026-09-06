"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cat, Dog, Pencil } from "lucide-react";

import { Alert, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { BookingBelongingsCard } from "./BookingBelongingsCard";
import { bookingActorLabel, finishClock } from "../format";
import { BookingHistoryCard } from "./BookingHistoryCard";
import { BookingPetNotesCard } from "./BookingPetNotesCard";
import { AddSessionButton, SessionCrew } from "./SessionGroomers";
import {
  furTypeLabel,
  PetSummaryCard,
  sizeLabel,
  speciesLabel,
} from "@/features/pets";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { swalToast } from "@/lib/swal";
import { formatMoney, sumDecimals } from "@/utils/decimal";
import type {
  Booking,
  Customer,
  BookingItem,
  BookingSession,
  BookingWorkStatus,
  Pet,
} from "@/types/api";

import { BookingStatusActions } from "./BookingStatusActions";
import { BookingStatusBadge } from "./BookingStatusBadge";

/** What each rung is called, and what the button that reaches it says. */
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
 */
const NEXT_MOVE: Partial<
  Record<BookingWorkStatus, { to: BookingWorkStatus; label: string }>
> = {
  /*
    THE LABELS NAME THE ACT, AND THE ACT STAMPS THE CLOCK. Pressing "Mulai"
    records `startedAt`; "Selesai" records `finishedAt`. Nobody types a time on
    this screen any more — see the row body.
  */
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

/**
 * A phone number, turned into a `wa.me` link — or null when it cannot be.
 *
 * PHONE NUMBERS IN THIS APP ARE NOT NORMALISED AT THE DOOR — `customer.model.js`
 * stores whatever a shop typed: `0812…`, `+62812…`, with spaces or dashes. A
 * link built from the raw string is a link that is wrong exactly often enough
 * to teach a receptionist not to trust the button.
 *
 * SO IT IS NORMALISED HERE, narrowly: strip everything but digits, then turn a
 * leading trunk `0` into the country code `62` — the one substitution that is
 * safe to guess, because no Indonesian number that reaches a customer starts
 * with anything else. Anything left too short to be a real number returns null
 * rather than a link that opens WhatsApp to nowhere.
 */
function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, "");
  const normalised = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;

  return normalised.length >= 9 ? `https://wa.me/${normalised}` : null;
}

/** Minutes between two instants, or null while the work is unfinished. */
/**
 * ONE ROW ON THIS PAGE — a SESSION since PCR-042, or the service standing in for
 * one when nobody has been assigned yet.
 *
 * ⚠️ `_id` IS WHAT THE WORK VERBS ADDRESS. On an assigned row it is the session's
 * id; on an unassigned one it is the service's, and `assigned: false` is what
 * stops anything trying to move it — the server would refuse a service id with a
 * 404 about a session nobody mentioned.
 */
type WorkRow = {
  _id: string;
  serviceItemId: string;
  name: string;
  workStatus: BookingWorkStatus;
  groomerName: string;
  groomerOffReason: string | null;
  durationMin: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  price: string;
  assigned: boolean;
  /* THE TURN ITSELF, carried through so the row can render its crew control
     without the screen looking it up again by id. */
  session: BookingSession;
};

function elapsed(row: WorkRow): number | null {
  if (!row.startedAt) return null;
  const from = new Date(row.startedAt).getTime();
  const to = row.finishedAt ? new Date(row.finishedAt).getTime() : Date.now();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / 60_000));
}

/**
 * ONE ANIMAL'S WORK IN ONE VISIT — `/dashboard/booking/:id/hewan/:petId`.
 *
 * ─── WHY IT IS A PAGE OF ITS OWN ───────────────────────────────────────────
 *
 * "Mochi sudah selesai mandi tapi Coco belum" was a sentence this system had no
 * way to hold: status lived on the booking, so a visit with two animals had one
 * answer for both. Moving status onto the rows made the sentence storable; this
 * page is where somebody says it.
 *
 * A PAGE RATHER THAN AN EXPANDING BLOCK on the booking. The work carries times,
 * notes and a groomer per service, and putting all of that inside the booking's
 * overview would bury the one thing that overview is for — what the whole visit
 * is, and what it comes to.
 *
 * ─── THIS IS NOT THE PET PROFILE ───────────────────────────────────────────
 *
 * `/dashboard/master/pets/:id` is about the animal in general — allergies,
 * preferences, a lifetime of visits. This is about ONE visit's work, which is
 * why it lives under the booking: Coco may be on ten of them.
 *
 * ─── TITIPAN OWNER LIVES HERE ──────────────────────────────────────────────
 *
 * It was one card on the booking overview, grouped by animal, so handing Mochi's
 * collar back meant scrolling past Coco's things. Ticking it happens at the
 * table beside the animal it belongs to, which is this page. The overview keeps
 * the COUNT and links through — "can this visit close" is still a whole-visit
 * question.
 *
 * ─── WHAT THE REFERENCE HAS THAT THIS DOES NOT ─────────────────────────────
 *
 * Before/after photos, several groomers sharing one service with a percentage
 * split, and service variants with add-ons. None of them has anywhere to be
 * stored yet, and a card that looks like it works and does not is worse than a
 * card that is absent. See `Analisis-Detail-Booking-v2`.
 */
export function BookingPetWorkScreen({
  bookingId,
  petId,
}: {
  bookingId: string;
  petId: string;
}) {
  const [booking, setBooking] = useState<Booking | null>(null);
  /*
    WHO MAY BE BOOKED ON THE DAY THIS VISIT IS FOR — the same read the booking
    form makes, and for the same reason: somebody who is off on Thursday must not
    be offered for a Thursday session. Best effort and silent, since reading
    staff takes a permission a groomer at the table may not hold; without it the
    crew editor simply does not appear.
  */
  const [groomers, setGroomers] = useState<
    { value: string; label: string; disabled?: boolean }[]
  >([]);
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /*
    WHAT IS TYPED IN THE TIME FIELDS, before it is committed on blur.
    Keyed `rowId|field`. Without this the inputs were controlled by the server's
    value with a no-op `onChange` — which cannot be typed into at all, and the
    blur then committed an empty string. The test caught it; a person would have
    found it in the first minute.
  */
  const [draftTimes, setDraftTimes] = useState<Record<string, string>>({});
  /*
    WHICH SESSIONS ARE OPEN. Unset means "follow the work": the one being done
    now opens itself, the rest stay shut. That is the reference's rule, and it is
    right — a closed row already answers who, where, and how many minutes.
  */
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    bookingService
      .getById(bookingId)
      .then(async (found) => {
        if (!active) return;
        setBooking(found);
        setError(null);

        /*
          THE ANIMAL IS FETCHED SEPARATELY AND ALLOWED TO FAIL. The rows carry
          the name already; the profile adds allergies and handling notes, and a
          page that refused to show the work because a second call timed out
          would send somebody to the table with nothing.
        */
        /*
          THREE SIDE READS, ALL ALLOWED TO FAIL. The rows carry the animal's name
          and the work already; the profile adds allergies, the customer adds a
          phone number, the branch adds a place. A page that refused to show the
          work because one of them timed out would send somebody to the table
          with nothing.
        */
        const [petResult, customerResult, branchResult] =
          await Promise.allSettled([
            petService.getById(petId),
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
  }, [bookingId, petId, nonce]);

  async function move(row: WorkRow, to: BookingWorkStatus) {
    if (busy) return;
    setBusy(row._id);

    try {
      await bookingService.advanceItemWork(bookingId, row._id, to);
      setNonce((n) => n + 1);

      /* Chrome must never be able to fail a save — see BookingForm. */
      try {
        swalToast(`${row.name}: ${WORK_LABELS[to].toLowerCase()}.`);
      } catch {
        /* The page re-reads and shows it. */
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
      .availability(date)
      .then((rows) => {
        if (!active) return;
        setGroomers(
          rows.map((row) => ({
            value: row._id,
            label: row.offReason
              ? `${row.fullName} — ${row.offReason}`
              : row.fullName,
            disabled: Boolean(row.offReason),
          })),
        );
      })
      .catch(() => {
        if (active) setGroomers([]);
      });

    return () => {
      active = false;
    };
  }, [booking?.scheduledAt]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat pekerjaan…
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

  const group = booking.pets.find((entry) => entry.petId === petId);
  const services = group?.services ?? [];

  /*
    ─── THE ROWS ON THIS PAGE ARE SESSIONS, AND THAT IS NEW ────────────────────

    This card has been called "Sesi Grooming" since it was built, but until
    PCR-042 it rendered SERVICES — there was nothing finer to render, and the
    work verbs addressed a service. Sessions exist now: a Full Grooming worked by
    Sinta and then Rio is two turns, two clocks and two people to pay.

    ⚠️ `_id` IS THE SESSION'S. `advanceItemWork` addresses a
    session, and sending a service id gets a 404 naming a session the caller
    never mentioned — which is exactly what this screen did until this was fixed.

    A SERVICE WITH NO SESSIONS STILL APPEARS, disabled. Work nobody has been told
    to do is the thing a groomer opening this page most needs to see; dropping it
    would leave a bath invisible on the one screen that is open at the table.
  */
  /*
    ─── ONE GROUP PER SERVICE, AND THE TURNS INSIDE IT ─────────────────────────

    A visit's work is "Full Grooming, and Hotel" — two things being done, each
    with its own turns. This used to be ONE FLAT LIST that mixed a service's
    sessions with a stand-in row for services that had none, so a dog booked for
    two services showed four unrelated rows and nothing said which belonged to
    which.

    A SERVICE WITH NO TURNS IS STILL A GROUP, and that is the point of grouping
    rather than filtering: work nobody has been told to do is what a groomer
    opening this page most needs to see, and its card is where the turn gets
    added.
  */
  const groups = services.map((service) => ({
    service,
    rows: service.sessions.map((session): WorkRow => ({
      _id: session.sessionId,
      serviceItemId: service.itemId,
      /* THE TURN'S OWN NAME. The service names the card above it, so repeating
         it here would put "Full Grooming" twice on one block. */
      name:
        session.sessionName && session.sessionName !== service.name
          ? session.sessionName
          : "Sesi",
      workStatus: session.status,
      /*
        THE WHOLE CREW ON ONE LINE — "Sinta + Rio". A turn may be worked by
        several people, and naming one of them would put the wrong person on the
        board for the other's work.
      */
      groomerName:
        session.groomers.length > 0
          ? session.groomers.map((who) => who.name).join(" + ")
          : "Belum ditentukan",
      /* THE FIRST PERSON WHO IS OFF, if any — the row has one line for it. Each
         person's own warning is on the crew control inside the row. */
      groomerOffReason:
        session.groomers.find((who) => who.offReason)?.offReason ?? null,
      /*
        THE SERVICE'S DURATION, because a turn has none of its own. Splitting a
        90-minute bath into three turns does not make each of them 90 minutes —
        but nothing records what it does make them, and dividing would be
        inventing a number nobody chose.
      */
      durationMin: service.durationMin,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      price: service.price,
      /* A TURN WITH NOBODY ON IT CANNOT BE STARTED — the server refuses it, and
         the row says so instead of offering a button that 400s. */
      assigned: session.groomers.length > 0,
      session,
    })),
  }));

  /* Every turn across every service — what the totals and the progress track
     count, and what the completion warning reads. */
  const rows = groups.flatMap((group) => group.rows);

  const petName = group?.petName ?? pet?.name ?? "Hewan ini";

  /*
    ⚠️ THE ANIMAL, NOT ONLY ITS SERVICES. The guard used to ask whether there were
    any rows; it has to ask whether this animal is on the visit at all, because
    everything below now reads `group.status` — the ladder lives there since
    PCR-042, and an absent animal would take the page down rather than show this.
  */
  if (!group || services.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="warning">
          Hewan ini tidak punya layanan di booking{" "}
          {booking.bookingNumber ?? "ini"}.
        </Alert>
        <Button variant="secondary" asChild className="self-start">
          <Link href={`/dashboard/booking/${bookingId}`}>
            Kembali ke booking
          </Link>
        </Button>
      </div>
    );
  }

  /*
    ⚠️ MONEY AND ESTIMATE COME OFF THE SERVICES, NOT OFF `rows`. A service split
    into three turns appears three times in `rows`, and summing those would
    charge the customer three baths and promise them four and a half hours. The
    ACTUAL time is the opposite: it is what each person really spent, so it sums
    over the turns.
  */
  const total = sumDecimals(
    services.flatMap((service) => [
      service.price,
      ...service.addons.map((addon) => addon.price),
    ]),
  );
  /*
    ⚠️ ADD-ONS ARE IN THE ESTIMATE, and dropping them was a real regression when
    this sum moved off the flat rows. "+30 menit detangling" lengthens the visit
    exactly as the catalogue says it does — an estimate without it promises the
    owner an earlier finish than the shop can manage, which is the one direction
    this number must never be wrong in.
  */
  const estimate = services.reduce(
    (sum, service) =>
      sum +
      (service.durationMin ?? 0) +
      service.addons.reduce(
        (extra, addon) => extra + (addon.durationMin ?? 0),
        0,
      ),
    0,
  );
  const actual = rows.reduce((sum, row) => sum + (elapsed(row) ?? 0), 0);

  /*
    ─── THE HEADER CARD — the reference's `.phead` ──────────────────────────

    Title, one big status, print/WhatsApp, and a bar underneath carrying
    "status sejak", a progress track, and the booking-level action. The
    reference puts the BOOKING's number in the title; here the animal's name
    leads, because that is what this page is about — the booking number is
    directly beneath it, where it identifies the visit without competing
    with it.
  */
  const doneRows = rows.filter((row) => row.workStatus === "done").length;
  const runningRows = rows.filter(
    (row) => row.workStatus === "in_progress",
  ).length;
  const lastEvent = booking.statusHistory?.[booking.statusHistory.length - 1];

  /*
    THE WHOLE BOOKING'S UNFINISHED WORK, not just this animal's — the same set
    the server refuses to complete over. Shown before the button is pressed
    rather than discovered as a 409 afterwards, the way the reference's own
    `issues()` warns before "Selesaikan pekerjaan" is even clicked.
  */
  const blocking = (booking.pets ?? [])
    .filter((entry) => entry.status !== "cancelled")
    .flatMap((entry) =>
      entry.services.flatMap((service) =>
        service.sessions
          .filter(
            (session) =>
              session.groomers.length > 0 && session.status !== "done",
          )
          .map((session) => ({ name: service.name })),
      ),
    );

  const whatsapp = waLink(customer?.phone);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-[200px] flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-extrabold text-foreground">
                {petName}
              </h1>
              {/* THIS ANIMAL'S, and this page is about one — PCR-042. The header
                  never had a single answer to give. */}
              <BookingStatusBadge status={group.status} />
            </div>
            {/*
              ─── WHO MADE THIS, AND WHEN — the reference's own subtitle ────────

              "Dibuat 3 Sep 2026 11.52 · Fitria (ops) · BK-260903-003". This is an
              AUDIT LINE, not the appointment's own date — that already has its
              place in the Detail Appointment card below, and repeating it here
              answered a question nobody was asking twice while leaving "who did
              this" unanswered.

              THE BOOKING NUMBER IS A LINK, replacing the arrow button that used
              to sit beside the title. Neither the reference's own back button nor
              this app's other identifier-links are decorative; an id that goes
              nowhere is worse than no id.
            */}
            {/*
              `tabular-nums`, NOT `font-mono` — ui-rules §5: there are two
              typefaces in this product and mono is not one of them. Inter's
              tabular figures do the digit-alignment job it was reached for.

              THE NAME AND ROLE GO THROUGH `bookingActorLabel`, the same
              formatter the trail below uses. Written out by hand here, this line
              said "Fitria (Staff)" while the trail said "Fitria (staff)" — two
              renderings of one fact, a few centimetres apart.
            */}
            <p className="mt-1 text-xs tabular-nums text-muted">
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
              )}{" "}
              ·{" "}
              <Link
                href={`/dashboard/booking/${bookingId}`}
                className="underline-offset-2 hover:underline"
              >
                {booking.bookingNumber ?? "Booking (draf)"}
              </Link>
            </p>
          </div>

          {/*
            CETAK: the printable card built for the groomer at the wet table
            (kriteria 5.12) — a real destination, not a stub. WHATSAPP: only
            rendered as a link when a number could actually be normalised; a
            button that opens WhatsApp to nowhere is worse than no button.
          */}
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/dashboard/master/pets/${petId}/print`}>
                🖨 Cetak
              </Link>
            </Button>
            {whatsapp && (
              <Button variant="ghost" size="sm" asChild>
                <a href={whatsapp} target="_blank" rel="noreferrer">
                  💬 WhatsApp
                </a>
              </Button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3">
          <div className="min-w-[180px] flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
              Status sejak
            </p>
            <p className="text-xs text-foreground">
              {lastEvent
                ? `${new Date(lastEvent.at).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })} · ${lastEvent.byName ?? "sistem"}`
                : "—"}
            </p>

            {/*
              ONE SEGMENT PER SESSION, not the reference's six fixed rungs. With
              status on the rows, a six-dot booking track would summarise several
              different things into one line — see the analysis. This track is
              about THIS animal, and it has exactly as many segments as it has
              work.
            */}
            <div
              className="mt-1.5 flex items-center gap-1"
              role="img"
              aria-label={`${doneRows} dari ${rows.length} sesi selesai`}
            >
              {rows.map((row) => (
                <span
                  key={row._id}
                  className={`h-1 flex-1 rounded-full ${
                    row.workStatus === "done"
                      ? "bg-success"
                      : row.workStatus === "in_progress"
                        ? "bg-warning"
                        : "bg-border"
                  }`}
                />
              ))}
            </div>
          </div>

          {blocking.length > 0 && group.status !== "completed" && (
            /*
              THE SAME SENTENCE THE SERVER WOULD ANSWER WITH IF THE BUTTON BELOW
              WERE PRESSED ANYWAY — said first, in red, the reference's own
              pattern. It is a courtesy, never the gate: the guard lives in
              `BookingService#changeStatus`, and pressing through still gets a
              409 rather than a completed booking with a bath nobody finished.
            */
            <p className="max-w-xs text-xs font-semibold text-danger">
              &ldquo;{blocking[0].name}&rdquo; belum selesai
              {blocking.length > 1 ? ` · +${blocking.length - 1} lagi` : ""}
            </p>
          )}

          <p className="text-xs text-muted">
            {doneRows} dari {rows.length} selesai
            {runningRows > 0 ? ` · ${runningRows} sedang dikerjakan` : ""}
          </p>

          {/*
            THE ONE BOOKING-LEVEL ACTION ON THIS SCREEN, and it is the SAME
            component the day sheet and the booking overview use — same dialog,
            same confirm step, same audit trail, same server guard. A second,
            hand-built status control here would be a second place for "what
            can this booking become next" to have its own opinion.

            UNGATED HERE, matching every other call site: the component gates
            its OWN forward/cancel items internally and leaves "Riwayat status"
            visible regardless, so wrapping the whole thing in another `Can`
            would hide the trail from somebody who can only read.
          */}
          {/* ONE ANIMAL, ONE CONTROL — the page is already about this dog. */}
          <BookingStatusActions
            booking={booking}
            pet={group}
            onChanged={() => setNonce((n) => n + 1)}
            variant="prominent"
          />
        </div>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {/*
        TWO COLUMNS, the reference's `.grid`: the work on the left, and a rail on
        the right for the things somebody reads rather than does — the trail, and
        where the commission figures are NOT.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {/* ─── Detail Appointment ─────────────────────────────────────── */}
          <Card
            title="Detail Appointment"
            /*
              THE WAY TO CORRECT WHAT IS BEING CHARGED, on the card that states
              it. Somebody who reads a wrong price here has the fix in the same
              glance rather than having to remember the booking has an edit
              screen — and `Can` keeps it off the page for whoever may read the
              work but not reprice it.
            */
            action={
              <Can feature="bookings" action="update">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/dashboard/booking/${bookingId}/edit`}>
                    <Pencil className="size-4" aria-hidden />
                    Edit layanan &amp; harga
                  </Link>
                </Button>
              </Can>
            }
          >
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field
                label="Tanggal"
                value={new Date(booking.scheduledAt).toLocaleDateString(
                  "id-ID",
                  { day: "numeric", month: "long", year: "numeric" },
                )}
              />
              {/*
                A RANGE, NOT A START. "09.00" answers when to be there; "09.00 –
                12.00" answers when the animal goes home, which is the question
                the owner actually asks at the counter. The end is the start plus
                what this visit is ESTIMATED to take — the actual finish is on
                each session, and a card that mixed the two would promise a time
                that moves while somebody reads it.
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
              {/*
                WHERE THE WORK HAPPENS AND WHICH SHOP — one line, because they
                are one answer: "Di rumah pelanggan" without the branch says
                nothing about who is driving.
              */}
              <Field
                label="Tipe"
                value={[
                  booking.location === "in_home"
                    ? "Di rumah pelanggan"
                    : "Di toko",
                  branchName,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              {/*
                SPELLED OUT RATHER THAN TICKED. "Tidak ada" is a real answer a
                driver needs; an empty field reads as nobody having decided.
              */}
              <Field
                label="Antar-jemput"
                value={
                  booking.pickupRequested && booking.deliveryRequested
                    ? "Jemput & antar pulang"
                    : booking.pickupRequested
                      ? "Jemput saja"
                      : booking.deliveryRequested
                        ? "Antar pulang saja"
                        : "Tidak ada"
                }
              />
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

            {/*
              WHAT IS BEING CHARGED, AND WHAT IS ADDED TO IT.

              Read from the grouped view the API builds (`booking.pets`), so an
              add-on hangs off the service it was added to instead of sitting
              beside it as though somebody had chosen "Parfum" on its own. It is
              still its own stored row — that is how it bills and prints — and
              the indent is what says it is not a service in its own right.
            */}
            <div className="mt-4 border-t border-border pt-3">
              {services.map((service) => (
                <div key={service.itemId} className="py-2">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground">
                      {service.name}
                    </span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatMoney(service.price)}
                    </span>
                  </div>
                  {/*
                    THE FACTS THE PRICE WAS QUOTED FROM, under the name it was
                    quoted for: a variant service costs what THIS animal's size
                    and coat say it costs, and a line that showed only the total
                    leaves somebody unable to check it.
                  */}
                  <p className="text-xs text-muted">
                    {[
                      sizeLabel(pet?.size),
                      furTypeLabel(pet?.furType),
                      service.durationMin
                        ? `${service.durationMin} mnt`
                        : "durasi belum diisi",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  {service.addons.length > 0 && (
                    <ul className="mt-2 border-l-2 border-border pl-3">
                      {service.addons.map((addon) => (
                        <li
                          key={addon.itemId}
                          className="flex justify-between gap-3 py-1 text-sm"
                        >
                          <span className="text-muted">
                            + {addon.name}
                            {addon.durationMin
                              ? ` · +${addon.durationMin} mnt`
                              : ""}
                          </span>
                          <span className="font-semibold tabular-nums text-foreground">
                            {formatMoney(addon.price)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              <div className="mt-1 flex justify-between gap-3 border-t-2 border-foreground pt-2 text-sm">
                <span className="font-extrabold">Total akhir</span>
                <span className="text-lg font-extrabold tabular-nums">
                  {formatMoney(total)}
                </span>
              </div>
            </div>
          </Card>

          {/* ─── Hewan & Pelanggan ──────────────────────────────────────── */}
          <Card title="Hewan &amp; Pelanggan">
            {pet ? (
              <>
                {/*
                  ─── THE ANIMAL, AT ARM'S LENGTH ────────────────────────────
                  A groomer reads this while holding a dog: the name, then the
                  three facts that decide how it is handled, then the warnings.

                  AN ICON, NOT AN EMOJI. ui-rules §1.8 keeps emoji out of the
                  product UI entirely — the reference draws a cat's face here and
                  this draws the same shape from the icon set everything else
                  uses.
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
                          pet.breed,
                          pet.weightKg ? `${pet.weightKg} kg` : null,
                          pet.species ? speciesLabel(pet.species) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>

                      {/*
                      SIZE AND COAT AS CHIPS, because they are the two facts a
                      variant price is quoted from — the same pair the booking
                      form refuses to guess at. Absent rather than shown as a
                      dash when nobody has recorded them: an empty chip is a
                      thing to decode.
                    */}
                      {(sizeLabel(pet.size) || furTypeLabel(pet.furType)) && (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {[sizeLabel(pet.size), furTypeLabel(pet.furType)]
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
                    ─── THE WAY OUT TO THE ANIMAL ITSELF, ON THE NAME'S LINE ────

                    TWO DIFFERENT PAGES, and the wording keeps them apart: this
                    screen is THIS VISIT, the profile is the animal's whole life
                    — allergies, every grooming it has ever had. Confusing them
                    sends somebody looking for today's work in a list of last
                    year's.

                    BESIDE THE NAME, NOT UNDER THE CARD. It sat at the bottom,
                    below the customer and the phone, which put a link about the
                    ANIMAL after two facts about the OWNER — three blocks of
                    reading between the name and the way to it. On the name's own
                    line it is where the eye already is.

                    `items-start`, SO IT ALIGNS WITH THE NAME rather than
                    floating against a block that grows: the chips underneath
                    make this column two or three lines tall, and a centred
                    button would drift down as they appear.

                    `secondary`, NOT `ghost` — the house's quiet button, white
                    with a 1.5px navy border. A ghost button has no edge, so
                    against a card's own background it read as a link somebody
                    had left loose.
                  */}
                  <Button
                    variant="secondary"
                    size="sm"
                    asChild
                    className="shrink-0"
                  >
                    <Link href={`/dashboard/master/pets/${petId}`}>
                      Profil {petName}
                    </Link>
                  </Button>
                </div>

                {/*
                  THE HANDLING NOTES AND THE ALLERGIES, in the card the whole app
                  already uses for them — the reference draws its own chips, and
                  a second way of saying "severe allergy" is a second way to get
                  it wrong.
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
              {/*
                THE NUMBER IS THE POINT of this block: it is who to ring when the
                groomer is on leave, or when the dog turns out to need something
                the owner did not ask for.
              */}
              <Field
                label="WhatsApp"
                value={
                  <span className="tabular-nums">{customer?.phone ?? "—"}</span>
                }
              />
            </dl>
          </Card>

          {/*
            WHAT CAME IN WITH THIS ANIMAL — moved here from the booking overview.

            It was one card there, grouped by animal, which meant handing Mochi's
            collar back involved scrolling past Coco's things and Bruno's. This
            page is already about one animal and is the page open at the table
            when the owner comes to collect, so the list belongs beside the work
            rather than beside the total. The overview keeps the COUNT and links
            through, because "can this visit close" is still a whole-visit
            question.

            ABOVE THE SESSIONS, not under them. What the owner handed over is
            checked at the two moments that bracket the work — arrival and
            collection — so it is read before the sessions and again after, while
            the sessions in between are worked through once. Sessions are also
            the longest card on the page; anything under them is found by
            scrolling past everything, which is what the overview already did
            wrong.

            LEFT COLUMN, NOT THE RAIL: the rail is for what is read (the trail,
            the commission pointer); ticking a box is a thing done, and the three
            columns want the width.
          */}
          <BookingBelongingsCard
            booking={booking}
            petId={petId}
            petName={petName}
            onChanged={setBooking}
          />

          {/* ─── Sesi Grooming ──────────────────────────────────────────── */}
          <Card
            title="Sesi Grooming"
            description={`aktual ${actual} / est ${estimate} mnt`}
          >
            {/*
              ─── ONE CARD PER SERVICE, TURNS INSIDE IT ────────────────────────────
            
              "Full Grooming" and "Hotel" are two things being done, each with its own
              turns. This was one flat list that mixed them, so a dog booked for two
              services showed four unrelated rows with nothing saying which belonged to
              which — and the add-on hanging off a service had no visible parent at all.
            
              A SERVICE WITH NO TURNS STILL GETS ITS CARD. Work nobody has been told to
              do is what a groomer opening this page most needs to see, and the card is
              where the turn gets added.
            */}
            <ul className="flex flex-col gap-4">
              {groups.map(({ service, rows: sessionRows }) => (
                <li
                  key={service.itemId}
                  className="rounded-xl border border-border p-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-foreground">
                        {service.name}
                      </span>
                      {/* THE KIND OF WORK, from the service's own snapshot — not read
                          through the catalogue, so a renamed line does not rewrite what
                          this visit says it was. */}
                      {service.serviceType && (
                        <span className="rounded-full bg-tint-neutral px-2 py-0.5 text-xs text-muted">
                          {service.serviceType}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted">
                      {service.durationMin
                        ? `est ${service.durationMin} mnt`
                        : "durasi belum diisi"}
                    </span>
                  </div>

                  {/* THE ADD-ONS, UNDER THE SERVICE THEY WERE ADDED TO. Nobody chooses
                      "Parfum" by itself, and showing it beside a bath made it look as
                      though somebody had. */}
                  {service.addons.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5 border-l-2 border-border pl-2.5">
                      {service.addons.map((addon) => (
                        <li key={addon.itemId} className="text-xs text-muted">
                          + {addon.name}
                          {addon.durationMin
                            ? ` · ${addon.durationMin} mnt`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  )}

                  {sessionRows.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">
                      Belum ada sesi — tambahkan satu untuk menugaskan groomer.
                    </p>
                  ) : (
                    <ul className="mt-3 flex flex-col gap-2">
                      {sessionRows.map((row) => {
                        const status = row.workStatus ?? "pending";
                        /*
                            ⚠️ NOTHING TO PRESS ON A TURN WITH NOBODY ON IT. The
                            server refuses to start work with no groomer — "who
                            did this" is what the duration and the pay are both
                            read against — so the button is absent rather than a
                            400 somebody has to read.
                          */
                        const next = row.assigned ? NEXT_MOVE[status] : null;
                        const minutes = elapsed(row);
                        const over =
                          minutes !== null &&
                          row.durationMin !== null &&
                          row.durationMin !== undefined &&
                          minutes > row.durationMin;
                        const open =
                          openRows[row._id] ?? status === "in_progress";

                        return (
                          <li
                            key={row._id}
                            className={`overflow-hidden rounded-xl border ${
                              status === "in_progress"
                                ? "border-warning"
                                : status === "done"
                                  ? "border-success/40"
                                  : "border-border"
                            }`}
                          >
                            {/*
                                ─── THE CLOSED ROW ALREADY ANSWERS THE COMMON QUESTIONS ──
                                Who is on it, where it stands, and how many minutes — the
                                reference's own reasoning, and the reason folding is worth
                                having at all. Opening is for the things you change.
                              */}
                            <button
                              type="button"
                              onClick={() =>
                                setOpenRows((prev) => ({
                                  ...prev,
                                  [row._id]: !open,
                                }))
                              }
                              aria-expanded={open}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
                                status === "in_progress"
                                  ? "bg-warning/10"
                                  : status === "done"
                                    ? "bg-success/5"
                                    : "bg-surface"
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                                {row.name}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${WORK_TONE[status]}`}
                              >
                                {WORK_LABELS[status]}
                              </span>
                              <span className="hidden whitespace-nowrap text-xs text-muted sm:inline">
                                {row.groomerName}
                              </span>
                              <span className="whitespace-nowrap font-mono text-xs text-foreground">
                                {minutes === null ? "—" : `${minutes}'`}
                                {over && (
                                  <span className="text-danger">
                                    {" "}
                                    +{minutes! - row.durationMin!}
                                  </span>
                                )}
                              </span>
                              <span className="text-xs text-muted">
                                {open ? "▲" : "▼"}
                              </span>
                            </button>

                            {open && (
                              <div className="border-t border-border p-3">
                                {row.groomerOffReason && (
                                  <p
                                    role="alert"
                                    className="mb-3 rounded border border-danger/40 bg-danger/5 px-2 py-1 text-xs font-semibold text-danger"
                                  >
                                    {row.groomerName}{" "}
                                    {row.groomerOffReason.toLowerCase()} — ganti
                                    groomer atau hubungi pelanggan.
                                  </p>
                                )}

                                {/*
                                    WHO IS ON THIS SERVICE — the booking form set one
                                    default per animal; this is where the day disagrees
                                    with it. Above the clock fields, because who is doing
                                    it is decided before how long it took.

                                    ⚠️ ONCE PER SERVICE, NOT PER TURN. The card edits the
                                    whole crew — every turn of this service, and the button
                                    that adds another — so opening a second turn of the same
                                    bath must not show a second copy of the same control
                                    with the same rows in it.
                                  */}
                                {/*
                                    WHO IS ON THIS TURN — inside the turn's own row, under
                                    the name it acts on.

                                    IT USED TO BE RENDERED ONCE PER SERVICE, with a
                                    `findIndex` trick to pick the first row, because the
                                    control drew every session of the service at once. That
                                    put a second list of the same turns beside the one the
                                    rows already draw — two lists of one thing, and two
                                    places for it to disagree.
                                  */}
                                <div className="mb-3">
                                  <SessionCrew
                                    bookingId={bookingId}
                                    session={row.session}
                                    groomers={groomers}
                                    onChanged={setBooking}
                                  />
                                </div>

                                {/*
                                  ─── THE CLOCK IS READ, NOT TYPED ────────────

                                  There were two text fields here — "Jam mulai"
                                  and "Jam selesai" — and they asked somebody to
                                  write down a time they had just lived through.
                                  The buttons below record it: starting a turn
                                  stamps `startedAt`, finishing it stamps
                                  `finishedAt`, both server-side, both to the
                                  second the button was pressed.

                                  ⚠️ CORRECTING A STAMP IS NO LONGER REACHABLE
                                  FROM THIS SCREEN. `PATCH .../times` still
                                  exists and is still audited — a groomer with
                                  wet hands presses the button late, and that
                                  correction decides the duration a commission
                                  matrix is read against. It needs an edit
                                  affordance of its own; until it has one, a
                                  wrong stamp can only be fixed through the API.
                                */}
                                <dl className="flex flex-wrap gap-x-6 gap-y-2">
                                  <div>
                                    <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">
                                      Mulai
                                    </dt>
                                    <dd className="font-mono text-sm text-foreground">
                                      {clock(row.startedAt) || "—"}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">
                                      Selesai
                                    </dt>
                                    <dd className="font-mono text-sm text-foreground">
                                      {clock(row.finishedAt) || "—"}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">
                                      Aktual
                                    </dt>
                                    <dd className="font-mono text-sm font-semibold text-foreground">
                                      {minutes === null
                                        ? "—"
                                        : `${minutes} mnt`}
                                      {over && (
                                        <span className="ml-1 text-danger">
                                          +{minutes! - row.durationMin!}
                                        </span>
                                      )}
                                    </dd>
                                  </div>
                                  {/*
                                    ⚠️ NO "ESTIMASI" HERE, and its absence is
                                    the honest reading.

                                    The estimate is the SERVICE's — 60 minutes
                                    for a bath — and a bath split into three
                                    turns does not take 60 minutes EACH. Printing
                                    it on every row read as a target for each
                                    one, and the over-run beside it as three
                                    separate failures to hit a number nobody set.

                                    IT IS SHOWN ONCE, ON THE SERVICE'S CARD
                                    HEADER, where it belongs: one estimate for
                                    the thing that was estimated.
                                  */}
                                </dl>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Can
                                    feature="bookings"
                                    action={["advanceStatus", "update"]}
                                  >
                                    {next && (
                                      <Button
                                        size="sm"
                                        disabled={busy === row._id}
                                        onClick={() => void move(row, next.to)}
                                      >
                                        {busy === row._id
                                          ? "Menyimpan…"
                                          : next.label}
                                      </Button>
                                    )}
                                    {status === "done" && row.assigned && (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={busy === row._id}
                                        onClick={() =>
                                          void move(row, "in_progress")
                                        }
                                      >
                                        Buka lagi
                                      </Button>
                                    )}
                                    {!row.assigned && (
                                      <p className="text-xs text-muted">
                                        Tentukan groomernya dulu — sesi tanpa
                                        groomer tidak bisa dimulai.
                                      </p>
                                    )}
                                  </Can>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="mt-3">
                    {/* NO `groomers` — adding a turn asks for its NAME only;
                        who works it is set in the turn's own row. */}
                    <AddSessionButton
                      bookingId={bookingId}
                      service={service}
                      onChanged={setBooking}
                    />
                  </div>
                </li>
              ))}
            </ul>

            {/*
              ⚠️ NO "Profil" LINK HERE ANY MORE. This card is one visit's work —
              turns, clocks, who is on them — and a way out to the animal's whole
              life sat at the bottom of it saying nothing about grooming. It
              moved to "Hewan & Pelanggan", the block that is already about the
              animal, where it reads as the obvious next step rather than as a
              stray link under a list of sessions.
            */}
          </Card>
        </div>

        {/* ─── The rail ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-20">
          {/*
            THE ANIMAL'S TWO NOTES, EDITABLE, AT THE HEAD OF THE RAIL.

            THEY USED TO BE READ-ONLY AND ONCE PER SESSION, which printed the
            same sentence under every service — they are facts about the ANIMAL,
            and a card with two services showed each note twice. Once per animal
            is what they are.

            EDITABLE HERE because the form can only capture what was known when
            the appointment was taken. The coat turns out worse than it looked,
            the dog panics at the dryer, the owner says something at drop-off —
            all of it happens on this page, and the alternative was sending
            somebody to the edit form, which reprices the visit on save.

            IN THE RAIL, not the left column: it is read while something else is
            being done — during the work, and again at hand-over — so it stays in
            view beside the sessions rather than scrolling away above them.
          */}
          <BookingPetNotesCard
            booking={booking}
            petId={petId}
            onChanged={setBooking}
          />

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

/** One label-over-value pair, the reference's `.kv` cell. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
