"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { Alert, SelectField, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { userService } from "@/services/user.service";
import { swalToast } from "@/lib/swal";
import {
  GROOMER_LEVEL_LABELS,
  GROOMER_LEVELS,
  type AffectedBooking,
  type GroomerLevel,
  type User,
} from "@/types/api";

/** "No level yet" as a real option value — Radix refuses `""` on an item. */
const NO_LEVEL = "tanpa-level";

/**
 * JAVASCRIPT'S DAY NUMBERING — 0 is Sunday, 3 is Wednesday.
 *
 * It is what `Date#getDay` returns and what the server compares against.
 * Inventing a friendlier numbering here would be a translation layer with
 * exactly one job: to be got wrong once, quietly, on somebody's day off.
 */
const WEEKDAYS = [
  { value: 1, label: "Senin" },
  { value: 2, label: "Selasa" },
  { value: 3, label: "Rabu" },
  { value: 4, label: "Kamis" },
  { value: 5, label: "Jumat" },
  { value: 6, label: "Sabtu" },
  { value: 0, label: "Minggu" },
];

/** Longest leave this form will expand in one go — a fortnight and a bit. */
const MAX_RANGE_DAYS = 60;

/**
 * Every calendar day from `from` to `to`, inclusive.
 *
 * BUILT WITH `setDate`, WHICH ROLLS MONTHS AND YEARS FOR US. Adding 86_400_000
 * milliseconds looks equivalent and is not: it breaks across a daylight-saving
 * boundary, and although Indonesia has none, this component has no business
 * knowing that — the shop that opens in a zone that does would find one day
 * missing from somebody's leave and no way to explain it.
 *
 * PARSED FROM PARTS, NOT `new Date(iso)`. A bare "2026-09-14" is read as UTC
 * midnight, which is the previous day everywhere east of London — so a range
 * starting on the 14th would start on the 13th in Jakarta.
 *
 * CAPPED. `to` before `from` yields nothing, and a typo of "2026" for "2126" is
 * a hundred years of dates rather than an error somebody can see.
 */
function expandRange(from: string, to: string): string[] {
  if (!from) return [];
  if (!to || to === from) return [from];

  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const cursor = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);

  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end < cursor) return [];

  const dates: string[] = [];

  while (cursor <= end && dates.length < MAX_RANGE_DAYS) {
    dates.push(
      [
        cursor.getFullYear(),
        String(cursor.getMonth() + 1).padStart(2, "0"),
        String(cursor.getDate()).padStart(2, "0"),
      ].join("-"),
    );
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

/**
 * The roster — FR-4, on the screen at last.
 *
 * IT STORED A COMMISSION RATE TOO, UNTIL 13 SEPTEMBER 2026. The shop decided
 * commission is one rule for everybody, set in Layanan › Grooming › Pengaturan,
 * and the server stopped reading `users.commissionRate`. A per-person rate left
 * here would be a control that saves and changes nothing, so it is gone rather
 * than greyed — and one line says where it went.
 *
 * A CARD, NOT A TAB. This form is four Cards already — details, password,
 * status, danger — and a fifth reads the same. Adding tabs for one section would
 * be a second navigation idea inside one screen.
 *
 * ─── THE ONE THING THIS SCREEN MUST NOT DO QUIETLY ──────────────────────────
 *
 * Marking somebody off for next Wednesday when they already have four animals
 * booked is a DECISION, not a typo (kriteria 4.9). So adding a leave date asks
 * the server what it would strand and shows it BEFORE the save — the save is
 * still allowed, but not by accident.
 */
export function RosterSection({
  user,
  onUpdated,
}: {
  user: User;
  onUpdated: (user: User) => void;
}) {
  /*
    WHAT THIS PERSON DOES IN THE SHOP — not what they may do in this system.
    It decides who appears in the booking form's groomer dropdown, who gets a
    column on the calendar, and who the booking list can be filtered by. Before
    it existed all three read "every active user", so a shop with ten staff and
    two groomers picked from ten names.
  */
  const [isGroomer, setIsGroomer] = useState(user.isGroomer === true);
  /* The label beside the name on a booking's crew — "Sinta · Senior". */
  const [groomerLevel, setGroomerLevel] = useState<GroomerLevel | null>(
    user.groomerLevel ?? null,
  );

  const [weeklyOff, setWeeklyOff] = useState<number[]>(
    user.availability?.weeklyOff ?? [],
  );
  const [leaveDates, setLeaveDates] = useState<string[]>(
    (user.availability?.leaveDates ?? []).map((date) => date.slice(0, 10)),
  );
  const [draftDate, setDraftDate] = useState("");
  /* Empty means "just the one day" — a range is the exception, not the shape. */
  const [draftUntil, setDraftUntil] = useState("");

  const [affected, setAffected] = useState<AffectedBooking[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Adds a leave date, or a RANGE of them, and asks what it would strand.
   *
   * THE ANSWER IS SHOWN, NOT ENFORCED. A shop that decides somebody is off
   * anyway is making a real decision — they will phone the four customers — and
   * a screen that refused would send that decision somewhere this system cannot
   * see.
   *
   * ─── WHY A RANGE AT ALL ────────────────────────────────────────────────────
   *
   * Leave is taken in weeks, not days. Somebody off from the 14th to the 20th is
   * SEVEN uses of a date picker under the old form, and a shop that finds that
   * tedious writes the leave on paper instead — at which point the booking form
   * happily offers a groomer who is in Bali.
   *
   * ─── STORED AS INDIVIDUAL DAYS, DELIBERATELY ──────────────────────────────
   *
   * `availability.leaveDates` is a list of dates and stays one. A stored range
   * would need every reader — `offReason`, the clash check, the calendar — to
   * learn about intervals, and each is a place to get an off-by-one wrong on
   * somebody's last day off. The range is a TYPING CONVENIENCE, expanded here.
   *
   * ─── THE WHOLE RANGE IS CHECKED IN ONE ASK ────────────────────────────────
   *
   * `affectedByLeave` already accepts a list; asking per day would be seven
   * round trips and, worse, seven separate warnings a reader has to add up.
   */
  async function addLeaveDates(from: string, to: string) {
    const added = expandRange(from, to).filter(
      (date) => !leaveDates.includes(date),
    );

    setDraftDate("");
    setDraftUntil("");

    if (added.length === 0) return;

    setLeaveDates((prev) => [...prev, ...added].sort());
    setChecking(true);

    try {
      const rows = await bookingService.affectedByLeave(user._id, added);
      setAffected(rows.length > 0 ? rows : null);
    } catch {
      /*
        SILENT. The warning is a courtesy; failing to fetch it must not stop
        somebody recording that a person is on leave.
      */
      setAffected(null);
    } finally {
      setChecking(false);
    }
  }

  /**
   * A weekly pattern is checked the same way — but only for the NEXT four
   * occurrences of that weekday.
   *
   * "EVERY WEDNESDAY, FOR EVER" has no end to check against, and asking the
   * server for every Wednesday until the heat death of the universe would answer
   * a question nobody asked. Four weeks is the horizon a shop schedules within.
   */
  async function checkWeekday(weekday: number) {
    const dates: string[] = [];
    const cursor = new Date();

    while (dates.length < 4) {
      cursor.setDate(cursor.getDate() + 1);
      if (cursor.getDay() === weekday) {
        dates.push(
          `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
        );
      }
    }

    setChecking(true);

    try {
      const rows = await bookingService.affectedByLeave(user._id, dates);
      setAffected(rows.length > 0 ? rows : null);
    } catch {
      setAffected(null);
    } finally {
      setChecking(false);
    }
  }

  function toggleWeekday(value: number) {
    const adding = !weeklyOff.includes(value);

    setWeeklyOff((prev) =>
      adding ? [...prev, value].sort() : prev.filter((day) => day !== value),
    );

    if (adding) void checkWeekday(value);
    else setAffected(null);
  }

  /* How many days the button is about to add — 0 means the range is unusable. */
  const rangeSize = expandRange(draftDate, draftUntil).length;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);

    try {
      const saved = await userService.update(user._id, {
        /*
          MERGED BY THE SERVER — the two keys are independent, so writing the
          weekly pattern must not wipe next month's leave. Both are sent anyway
          because this form owns both.

          NO `commissionRate`. The server no longer reads it, and sending the
          stored one back would keep alive a number that means nothing.
        */
        isGroomer,
        groomerLevel,
        availability: { weeklyOff, leaveDates },
      });

      onUpdated(saved);

      /* Chrome must never be able to fail a save — see BookingForm. */
      try {
        swalToast("Jadwal disimpan.");
      } catch {
        /* The form already shows what was saved. */
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Tidak bisa disimpan. Coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {error && <Alert variant="error">{error}</Alert>}

      {/*
        FIRST, because it decides whether the rest of this card matters at all.
        The weekly pattern and the leave dates exist to keep somebody OUT of a
        booking form they have to be in first.
      */}
      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
          <Checkbox
            checked={isGroomer}
            onCheckedChange={() => setIsGroomer((prev) => !prev)}
            disabled={saving}
            aria-label="Groomer"
          />
          Groomer — bisa ditugaskan menangani hewan
        </label>
        <p className="text-xs text-muted">
          Hanya yang ditandai di sini yang muncul di pilihan groomer saat membuat
          booking, dan di kolom kalender. Kasir dan resepsionis tidak perlu
          ditandai.
        </p>
        <p className="text-xs text-muted">
          Komisi diatur untuk seluruh toko di Layanan › Grooming › Pengaturan.
        </p>
      </div>

      {/*
        ONLY FOR A GROOMER — it is the label beside their name when they are put
        on a booking's session. Kept when the box is unticked, so ticking it
        back does not lose it.
      */}
      {isGroomer && (
        <SelectField
          label="Level groomer"
          value={groomerLevel ?? NO_LEVEL}
          onChange={(value) =>
            setGroomerLevel(value === NO_LEVEL ? null : (value as GroomerLevel))
          }
          options={[
            { value: NO_LEVEL, label: "Belum diatur" },
            ...GROOMER_LEVELS.map((level) => ({
              value: level,
              label: GROOMER_LEVEL_LABELS[level],
            })),
          ]}
          hint="Tampil di samping nama saat groomer ditugaskan ke sesi booking."
          disabled={saving}
          className="max-w-xs"
        />
      )}

      <div className="flex flex-col gap-2">
        <Label>Libur mingguan</Label>
        <p className="text-xs text-muted">
          Groomer yang libur tidak bisa dipilih di form booking pada hari itu.
        </p>

        <div className="flex flex-wrap gap-3">
          {WEEKDAYS.map((weekday) => (
            <label
              key={weekday.value}
              className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
            >
              <Checkbox
                checked={weeklyOff.includes(weekday.value)}
                onCheckedChange={() => toggleWeekday(weekday.value)}
                disabled={saving}
                aria-label={weekday.label}
              />
              {weekday.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Cuti tanggal tertentu</Label>

        {leaveDates.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {leaveDates.map((date) => (
              <li key={date}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={saving}
                  aria-label={`Hapus cuti ${date}`}
                  onClick={() =>
                    setLeaveDates((prev) => prev.filter((d) => d !== date))
                  }
                >
                  {day(date)}
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label="Dari tanggal"
            name="leave-date"
            type="date"
            value={draftDate}
            onChange={(event) => setDraftDate(event.target.value)}
            disabled={saving}
          />
          {/*
            "SAMPAI" IS OPTIONAL AND EMPTY BY DEFAULT. One day off is the common
            case and must stay one field and one button; a required second date
            would make every single-day absence a decision about whether to
            repeat the first one.

            `min` KEEPS THE PICKER HONEST about which way a range runs. The
            expander refuses a backwards one anyway — this only saves somebody
            finding that out after typing.
          */}
          <TextField
            label="Sampai (opsional)"
            name="leave-date-until"
            type="date"
            value={draftUntil}
            min={draftDate || undefined}
            onChange={(event) => setDraftUntil(event.target.value)}
            disabled={saving || draftDate === ""}
            hint="Kosongkan kalau cuma sehari."
          />
          <Button
            type="button"
            variant="secondary"
            disabled={saving || draftDate === "" || rangeSize === 0}
            onClick={() => void addLeaveDates(draftDate, draftUntil)}
          >
            {rangeSize > 1 ? `Tambah ${rangeSize} hari` : "Tambah"}
          </Button>
        </div>

        {/*
          THE TWO WAYS A RANGE CAN BE UNUSABLE, said before the button is
          pressed rather than by silently doing nothing.
        */}
        {draftUntil !== "" && rangeSize === 0 && (
          <p role="alert" className="text-xs font-semibold text-danger">
            Tanggal &ldquo;sampai&rdquo; harus setelah tanggal mulai.
          </p>
        )}
        {rangeSize === MAX_RANGE_DAYS && (
          <p className="text-xs text-muted">
            Maksimal {MAX_RANGE_DAYS} hari sekali tambah.
          </p>
        )}
      </div>

      {/*
        KRITERIA 4.9 — the four animals, made visible before the decision.
        Nothing here refuses; it only shows.
      */}
      {checking && (
        <p className="text-xs text-muted">Memeriksa booking yang terdampak…</p>
      )}

      {affected && (
        <Alert variant="warning">
          <span className="block font-semibold">
            {affected.length} layanan sudah terjadwal di hari libur itu.
          </span>
          <ul className="mt-1 list-disc pl-5">
            {affected.slice(0, 6).map((row) => (
              <li key={row._id}>
                {row.name} — {day(row.scheduledAt)}
                {row.bookingNumber ? ` (${row.bookingNumber})` : ""}
              </li>
            ))}
          </ul>
          {affected.length > 6 && (
            <span className="mt-1 block">
              …dan {affected.length - 6} lagi.
            </span>
          )}
          <span className="mt-1 block">
            Menyimpan tetap boleh — bookingnya tidak ikut berubah, jadi
            hubungi pelanggannya atau pindahkan groomernya.
          </span>
        </Alert>
      )}

      <div>
        <Button type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan jadwal"}
        </Button>
      </div>
    </form>
  );
}
