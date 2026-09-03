"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Alert, FilterSelect, SelectField, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { serviceService } from "@/services/service.service";
import { userService } from "@/services/user.service";
import { swalToast } from "@/lib/swal";
import type { AffectedBooking, Service, User } from "@/types/api";

/** All four states a rate can be in, and this form now sets every one. */
type EditableRate = "none" | "percentage" | "fixed" | "matrix";

/**
 * One row of a per-service matrix, while it is being edited.
 *
 * `value` IS A STRING HERE, not a number. A half-typed "1" on the way to "15"
 * is a valid thing to have in a text box and not a valid rate, and coercing on
 * every keystroke turns a cleared field into a silent zero — which for a
 * commission means somebody works a day for nothing and nobody is told.
 */
type MatrixRow = { key: string; value: string };

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

const RATE_TYPES: { value: EditableRate; label: string }[] = [
  { value: "none", label: "Tidak berkomisi" },
  { value: "percentage", label: "Persentase dari harga layanan" },
  { value: "fixed", label: "Nominal tetap per layanan" },
  { value: "matrix", label: "Persen berbeda per layanan" },
];

/* Enough to hold a grooming catalogue whole; nobody pages a rate table. */
const SERVICE_LIMIT = 200;

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
 * The roster and the rate — FR-4 and FR-6, on the screen at last.
 *
 * BOTH FIELDS HAVE BEEN STORABLE SINCE THE USER MODULE SHIPPED and there was
 * never a screen for either. FR-4 made the roster load-bearing — it decides who
 * may be booked — and FR-6 made the rate decide what somebody earns; until this
 * existed the only way to set them was to call the API by hand.
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

  const [weeklyOff, setWeeklyOff] = useState<number[]>(
    user.availability?.weeklyOff ?? [],
  );
  const [leaveDates, setLeaveDates] = useState<string[]>(
    (user.availability?.leaveDates ?? []).map((date) => date.slice(0, 10)),
  );
  const [draftDate, setDraftDate] = useState("");
  /* Empty means "just the one day" — a range is the exception, not the shape. */
  const [draftUntil, setDraftUntil] = useState("");

  const [rateType, setRateType] = useState<EditableRate>(
    user.commissionRate?.type ?? "none",
  );
  const [rateValue, setRateValue] = useState(
    user.commissionRate?.value !== null &&
      user.commissionRate?.value !== undefined
      ? String(user.commissionRate.value)
      : "",
  );

  /*
    THE MATRIX ROWS, AND THE CATALOGUE THEY POINT AT.

    A row's `key` IS A SERVICE ID — that is what `CommissionService#amountFor`
    matches on. It has not always been: the field started as a free-text label
    and `backfillCommissionMatrixKeys.js` mapped the old labels across. A picker
    is the only thing that keeps it an id, and a text box here would quietly
    re-open the drift that migration closed.
  */
  const [matrix, setMatrix] = useState<MatrixRow[]>(
    user.commissionRate?.type === "matrix"
      ? (user.commissionRate.matrix ?? []).map((row) => ({
          key: String(row.key),
          value: String(row.value),
        }))
      : [],
  );
  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);

  const [affected, setAffected] = useState<AffectedBooking[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    FETCHED ONLY WHEN THE MATRIX IS CHOSEN. Most staff are on a percentage or on
    nothing at all, and loading the whole service catalogue to render a form that
    never shows it is a request every user page would pay for.
  */
  useEffect(() => {
    if (rateType !== "matrix" || services.length > 0) return;

    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingServices(true);

    serviceService
      .list({ isActive: true, limit: SERVICE_LIMIT })
      .then((result) => {
        if (active) setServices(result.items);
      })
      .catch(() => {
        /* The rows still render by id; the picker is what degrades. */
      })
      .finally(() => {
        if (active) setLoadingServices(false);
      });

    return () => {
      active = false;
    };
  }, [rateType, services.length]);

  /**
   * Adds a leave date, and asks what it would strand before accepting it.
   *
   * THE ANSWER IS SHOWN, NOT ENFORCED. A shop that decides somebody is off
   * anyway is making a real decision — they will phone the four customers — and
   * a screen that refused would send that decision somewhere this system cannot
   * see.
   */
  /**
   * Adds a leave date, or a RANGE of them, and asks what it would strand.
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

  function addMatrixRow() {
    setMatrix((prev) => [...prev, { key: "", value: "" }]);
  }

  function updateMatrixRow(index: number, patch: Partial<MatrixRow>) {
    setMatrix((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function removeMatrixRow(index: number) {
    setMatrix((prev) => prev.filter((_, i) => i !== index));
  }

  /*
    A SERVICE ALREADY PRICED CANNOT BE PICKED TWICE. Two rows for one service is
    a rate the reader has to guess between, and `#amountFor` takes the FIRST it
    finds — a silent tie-break nobody chose.
  */
  const takenKeys = new Set(matrix.map((row) => row.key).filter(Boolean));

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
        */
        isGroomer,
        availability: { weeklyOff, leaveDates },
        /*
          ONLY THE MEANINGFUL KEY. The server FORBIDS the other one, and it is
          right to: `value` alongside a matrix is a number no row would read, and
          `matrix` alongside a percentage is rows nothing would consult.

          THE FIRST VERSION OF THIS FORM SENT `matrix: []` WITH EVERY PERCENTAGE
          and was refused on every save — "commissionRate.matrix is not allowed
          for this commission type". `CommissionRateInput` is a union now, so the
          shape that cannot mean anything cannot be written either.

          `null` IS THE ANSWER FOR MOST STAFF — cashiers, receptionists, a vet on
          salary — and it says so far more clearly than a rate of zero.

          A MATRIX IS SENT AS ITS ROWS AND NOTHING ELSE — no `value` beside it,
          for the same reason. Switching AWAY from a matrix still replaces it,
          which is the moment the old rows stop meaning anything anyway.
        */
        commissionRate:
          rateType === "none"
            ? null
            : rateType === "matrix"
              ? {
                  type: "matrix",
                  /*
                    ROWS WITH NEITHER A SERVICE NOR A NUMBER ARE DROPPED, not
                    sent. An empty row is what a half-filled form looks like, and
                    the server refuses the whole save over it — "matrix[2].key is
                    not allowed to be empty" is a true sentence that tells nobody
                    which row to look at.
                  */
                  matrix: matrix
                    .filter((row) => row.key !== "" && row.value.trim() !== "")
                    .map((row) => ({
                      key: row.key,
                      value: Number(row.value) || 0,
                    })),
                }
              : { type: rateType, value: Number(rateValue) || 0 },
      });

      onUpdated(saved);

      /* Chrome must never be able to fail a save — see BookingForm. */
      try {
        swalToast("Jadwal dan komisi disimpan.");
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
      </div>

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

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Komisi"
          value={rateType}
          onChange={(value) => setRateType(value as EditableRate)}
          options={RATE_TYPES}
          disabled={saving}
          hint="Dihitung saat booking selesai, bukan saat dibayar."
        />

        {rateType !== "none" && (
          <TextField
            label={rateType === "percentage" ? "Persen (%)" : "Nominal (Rp)"}
            name="commission-value"
            type="number"
            inputMode="numeric"
            min={0}
            max={rateType === "percentage" ? 100 : undefined}
            value={rateValue}
            onChange={(event) => setRateValue(event.target.value)}
            disabled={saving}
            required
          />
        )}
      </div>

      {/*
        THE PER-SERVICE RATES — FR-6, and the last thing in this module that was
        storable, validated, computed, and had no screen.

        A ROW IS A SERVICE AND A PERCENT. Not a free-typed name: the row's key is
        matched against a service ID by `CommissionService#amountFor`, and it was
        a text label once — `backfillCommissionMatrixKeys.js` exists to clean up
        after that. A picker is what keeps the ids ids.

        A SERVICE WITH NO ROW PAYS NOTHING, and the form says so rather than
        leaving it to be discovered on a payslip. That is the server's rule:
        `#amountFor` returns null when no row matches, and no commission record
        is written at all.
      */}
      {rateType === "matrix" && (
        <div className="flex flex-col gap-2">
          <Label>Rate per layanan</Label>
          <p className="text-xs text-muted">
            Layanan yang tidak ada di daftar ini <strong>tidak berkomisi</strong>{" "}
            untuk staf ini.
          </p>

          {loadingServices && (
            <p className="text-xs text-muted">Memuat daftar layanan…</p>
          )}

          {matrix.length > 0 && (
            <ul className="flex flex-col gap-2">
              {matrix.map((row, index) => (
                <li
                  key={index}
                  className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3"
                >
                  <div className="min-w-52 flex-1">
                    <FilterSelect
                      label="Layanan"
                      value={row.key}
                      onChange={(value) => updateMatrixRow(index, { key: value })}
                      options={services
                        .filter(
                          (service) =>
                            service._id === row.key ||
                            !takenKeys.has(service._id),
                        )
                        .map((service) => ({
                          value: service._id,
                          label: service.name,
                        }))}
                      placeholder="Pilih layanan"
                      disabled={saving}
                    />
                  </div>

                  <div className="w-28">
                    <TextField
                      label="Persen (%)"
                      name={`matrix-value-${index}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      value={row.value}
                      onChange={(event) =>
                        updateMatrixRow(index, { value: event.target.value })
                      }
                      disabled={saving}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    aria-label={`Hapus baris ${index + 1}`}
                    onClick={() => removeMatrixRow(index)}
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={addMatrixRow}
            >
              Tambah layanan
            </Button>
          </div>

          {/*
            THE SERVER REFUSES AN EMPTY MATRIX — "commission, but no rate for
            anything" is not a state worth storing. Said here so the refusal is
            not the first anybody hears of it.
          */}
          {matrix.filter((row) => row.key !== "" && row.value.trim() !== "")
            .length === 0 && (
            <p className="text-xs font-semibold text-danger">
              Tambahkan minimal satu layanan, atau pilih jenis komisi lain.
            </p>
          )}
        </div>
      )}

      <div>
        <Button type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan jadwal & komisi"}
        </Button>
      </div>
    </form>
  );
}
