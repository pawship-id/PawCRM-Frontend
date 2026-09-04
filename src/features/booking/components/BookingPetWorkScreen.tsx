"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cat, Dog } from "lucide-react";

import { Alert, Card, Spinner, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { SessionGroomers } from "./SessionGroomers";
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
  pending: { to: "in_progress", label: "Mulai kerjakan" },
  in_progress: { to: "done", label: "Tandai selesai" },
};

/** "09.05" from an instant, in the shop's own clock — never through UTC. */
function clock(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${String(at.getHours()).padStart(2, "0")}.${String(at.getMinutes()).padStart(2, "0")}`;
}

/**
 * An edited "09.05" back onto the row's own day.
 *
 * ANCHORED TO THE DATE ALREADY ON THE ROW, or to the booking's day when there is
 * none. A bare time has no date, and taking today's would move a correction made
 * on Thursday onto Thursday when the work happened on Wednesday.
 */
function toInstant(value: string, anchor: string): string | null {
  const parts = value.trim().match(/^(\d{1,2})[.:]?(\d{2})$/);
  if (!parts) return null;

  const hours = Number(parts[1]);
  const minutes = Number(parts[2]);
  if (hours > 23 || minutes > 59) return null;

  const at = new Date(anchor);
  if (Number.isNaN(at.getTime())) return null;

  at.setHours(hours, minutes, 0, 0);
  return at.toISOString();
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
function elapsed(row: BookingItem): number | null {
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
 * ─── WHAT THE REFERENCE HAS THAT THIS DOES NOT ─────────────────────────────
 *
 * Titipan owner, before/after photos, several groomers sharing one service with
 * a percentage split, and service variants with add-ons. None of them has
 * anywhere to be stored yet, and a card that looks like it works and does not is
 * worse than a card that is absent. See `Analisis-Detail-Booking-v2`.
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

  async function move(row: BookingItem, to: BookingWorkStatus) {
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

  async function correct(
    row: BookingItem,
    field: "startedAt" | "finishedAt",
    value: string,
  ) {
    const anchor = row.startedAt ?? booking?.scheduledAt;
    if (!anchor) return;

    /* Clearing a time is a correction too — a start pressed by mistake. */
    const next = value.trim() === "" ? null : toInstant(value, anchor);

    if (value.trim() !== "" && next === null) {
      setError("Format jam: 09.05");
      return;
    }

    setBusy(row._id);
    setError(null);

    try {
      await bookingService.correctItemTimes(bookingId, row._id, {
        [field]: next,
      });

      /*
        THE DRAFT STEPS ASIDE once the server has it, so the field goes back to
        showing what was actually stored. Leaving it would let a rejected or
        rounded value sit on screen looking saved.
      */
      setDraftTimes((prev) => {
        const next_ = { ...prev };
        delete next_[`${row._id}|${field}`];
        return next_;
      });
      setNonce((n) => n + 1);

      try {
        swalToast("Koreksi jam tercatat di riwayat.");
      } catch {
        /* The page re-reads and shows it. */
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Jam tidak bisa dikoreksi. Coba lagi.",
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

  const rows = booking.items.filter((item) => item.petId === petId);
  const petName = rows[0]?.petName ?? pet?.name ?? "Hewan ini";

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="warning">
          Hewan ini tidak punya layanan di booking {booking.bookingNumber ?? "ini"}.
        </Alert>
        <Button variant="secondary" asChild className="self-start">
          <Link href={`/dashboard/booking/${bookingId}`}>Kembali ke booking</Link>
        </Button>
      </div>
    );
  }

  const total = sumDecimals(rows.map((row) => row.price));
  const estimate = rows.reduce((sum, row) => sum + (row.durationMin ?? 0), 0);
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
  const blocking = booking.items.filter(
    (item) => item.groomerUserId && item.workStatus !== "done",
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
              <BookingStatusBadge status={booking.status} />
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
            <p className="mt-1 font-mono text-xs text-muted">
              Dibuat{" "}
              {new Date(booking.createdAt).toLocaleString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · {booking.createdByName ?? "sistem"}
              {booking.createdByRoleName
                ? ` (${booking.createdByRoleName})`
                : ""}{" "}
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

          {blocking.length > 0 && booking.status !== "completed" && (
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
          <BookingStatusActions
            booking={booking}
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
          <Card title="Detail Appointment">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field
                label="Tanggal"
                value={new Date(booking.scheduledAt).toLocaleDateString(
                  "id-ID",
                  { day: "numeric", month: "long", year: "numeric" },
                )}
              />
              <Field
                label="Waktu"
                value={new Date(booking.scheduledAt).toLocaleTimeString(
                  "id-ID",
                  { hour: "2-digit", minute: "2-digit" },
                )}
              />
              <Field label="Cabang" value={branchName ?? "—"} />
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

            <div className="mt-3 border-t border-border pt-2">
              {rows.map((row) => (
                <div
                  key={row._id}
                  className="flex justify-between gap-3 border-b border-border py-2 text-sm last:border-b-0"
                >
                  <span>
                    {row.name}
                    <span className="block text-xs text-muted">
                      {row.durationMin
                        ? `${row.durationMin} mnt`
                        : "durasi belum diisi"}
                    </span>
                  </span>
                  <span className="font-bold tabular-nums">
                    {formatMoney(row.price)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t-2 border-foreground pt-2 text-sm">
                <span className="font-extrabold">Total untuk {petName}</span>
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
                <div className="flex items-start gap-3">
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

          {/* ─── Sesi Grooming ──────────────────────────────────────────── */}
          <Card title="Sesi Grooming" description={`aktual ${actual} / est ${estimate} mnt`}>
            <ul className="flex flex-col gap-2">
              {rows.map((row) => {
                const status = row.workStatus ?? "pending";
                const next = NEXT_MOVE[status];
                const minutes = elapsed(row);
                const over =
                  minutes !== null &&
                  row.durationMin !== null &&
                  row.durationMin !== undefined &&
                  minutes > row.durationMin;
                const open = openRows[row._id] ?? status === "in_progress";

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
                        setOpenRows((prev) => ({ ...prev, [row._id]: !open }))
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
                      <span className="text-xs text-muted">{open ? "▲" : "▼"}</span>
                    </button>

                    {open && (
                      <div className="border-t border-border p-3">
                        {row.groomerOffReason && (
                          <p
                            role="alert"
                            className="mb-3 rounded border border-danger/40 bg-danger/5 px-2 py-1 text-xs font-semibold text-danger"
                          >
                            {row.groomerName}{" "}
                            {row.groomerOffReason.toLowerCase()} — ganti groomer
                            atau hubungi pelanggan.
                          </p>
                        )}

                        {/*
                          WHO IS ON THIS SESSION — the booking form set one
                          default per animal; this is where the day disagrees
                          with it. Above the clock fields, because who is doing
                          it is decided before how long it took.
                        */}
                        <div className="mb-3">
                          <SessionGroomers
                            bookingId={bookingId}
                            row={row}
                            groomers={groomers}
                            onChanged={setBooking}
                          />
                        </div>

                        <Can feature="bookings" action="update">
                          <div className="flex flex-wrap items-end gap-3">
                            <TextField
                              label="Jam mulai"
                              name={`start-${row._id}`}
                              value={
                                draftTimes[`${row._id}|startedAt`] ??
                                clock(row.startedAt)
                              }
                              placeholder="09.05"
                              disabled={busy === row._id}
                              onChange={(event) =>
                                setDraftTimes((prev) => ({
                                  ...prev,
                                  [`${row._id}|startedAt`]: event.target.value,
                                }))
                              }
                              onBlur={(event) =>
                                void correct(row, "startedAt", event.target.value)
                              }
                            />
                            <TextField
                              label="Jam selesai"
                              name={`finish-${row._id}`}
                              value={
                                draftTimes[`${row._id}|finishedAt`] ??
                                clock(row.finishedAt)
                              }
                              placeholder="10.35"
                              disabled={busy === row._id}
                              onChange={(event) =>
                                setDraftTimes((prev) => ({
                                  ...prev,
                                  [`${row._id}|finishedAt`]: event.target.value,
                                }))
                              }
                              onBlur={(event) =>
                                void correct(row, "finishedAt", event.target.value)
                              }
                            />
                            <div className="pb-2">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                                Aktual
                              </p>
                              <p className="font-mono text-sm font-semibold text-foreground">
                                {minutes === null ? "—" : `${minutes} mnt`}
                                {over && (
                                  <span className="ml-1 text-danger">
                                    +{minutes! - row.durationMin!}
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="pb-2">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                                Estimasi
                              </p>
                              <p className="font-mono text-sm text-muted">
                                {row.durationMin ?? "—"} mnt
                              </p>
                            </div>
                          </div>
                        </Can>

                        {row.notes && (
                          <p className="mt-3 rounded bg-tint-neutral px-2 py-1 text-xs text-muted">
                            {row.notes}
                          </p>
                        )}

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
                                {busy === row._id ? "Menyimpan…" : next.label}
                              </Button>
                            )}
                            {status === "done" && (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={busy === row._id}
                                onClick={() => void move(row, "in_progress")}
                              >
                                Buka lagi
                              </Button>
                            )}
                          </Can>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-3">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/dashboard/master/pets/${petId}`}>
                  Profil {petName}
                </Link>
              </Button>
            </div>
          </Card>
        </div>

        {/* ─── The rail ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-20">
          <Card title="Riwayat" description={`${booking.statusHistory?.length ?? 0} aktivitas`}>
            {(booking.statusHistory ?? []).length === 0 ? (
              <p className="text-sm text-muted">Belum ada aktivitas.</p>
            ) : (
              <ol className="flex flex-col">
                {[...(booking.statusHistory ?? [])].reverse().map((event) => (
                  <li
                    key={`${event.status}-${event.at}`}
                    className="border-l-2 border-border pb-3 pl-4 last:pb-0"
                  >
                    <p className="text-xs font-bold text-foreground">
                      Status → {event.status}
                    </p>
                    <p className="font-mono text-[10px] text-muted">
                      {new Date(event.at).toLocaleString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {event.byName ?? "sistem"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>

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
function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
