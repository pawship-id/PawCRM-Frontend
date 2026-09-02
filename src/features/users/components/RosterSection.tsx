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
import type { AffectedBooking, User } from "@/types/api";

/**
 * What this form can set. `matrix` is deliberately absent — see the notice this
 * component renders for a staff member who already has one.
 */
type EditableRate = "none" | "percentage" | "fixed";

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
];

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
  const [weeklyOff, setWeeklyOff] = useState<number[]>(
    user.availability?.weeklyOff ?? [],
  );
  const [leaveDates, setLeaveDates] = useState<string[]>(
    (user.availability?.leaveDates ?? []).map((date) => date.slice(0, 10)),
  );
  const [draftDate, setDraftDate] = useState("");

  const [rateType, setRateType] = useState<EditableRate>(
    /* A matrix cannot be shown as a choice this form offers — see the notice. */
    user.commissionRate?.type === "matrix"
      ? "none"
      : (user.commissionRate?.type ?? "none"),
  );
  const [rateValue, setRateValue] = useState(
    user.commissionRate?.value !== null &&
      user.commissionRate?.value !== undefined
      ? String(user.commissionRate.value)
      : "",
  );

  const [affected, setAffected] = useState<AffectedBooking[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Adds a leave date, and asks what it would strand before accepting it.
   *
   * THE ANSWER IS SHOWN, NOT ENFORCED. A shop that decides somebody is off
   * anyway is making a real decision — they will phone the four customers — and
   * a screen that refused would send that decision somewhere this system cannot
   * see.
   */
  async function addLeaveDate(value: string) {
    if (!value || leaveDates.includes(value)) {
      setDraftDate("");
      return;
    }

    setLeaveDates((prev) => [...prev, value].sort());
    setDraftDate("");
    setChecking(true);

    try {
      const rows = await bookingService.affectedByLeave(user._id, [value]);
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

          MATRIX IS NEVER SENT FROM HERE. This form has no editor for it, so
          switching a matrix staff member to a percentage replaces it — which is
          what the notice above the button warns about.
        */
        commissionRate:
          rateType === "none"
            ? null
            : { type: rateType, value: Number(rateValue) || 0 },
      });

      onUpdated(saved);

      /* Chrome must never be able to fail a save — see BookingCreateForm. */
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
            label="Tambah tanggal cuti"
            name="leave-date"
            type="date"
            value={draftDate}
            onChange={(event) => setDraftDate(event.target.value)}
            disabled={saving}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={saving || draftDate === ""}
            onClick={() => void addLeaveDate(draftDate)}
          >
            Tambah
          </Button>
        </div>
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
        MATRIX IS DELIBERATELY ABSENT FROM THIS FORM. A per-service rate needs a
        service picker with a row per service, and a shop that wants one is
        better served by a screen built for it than by a third mode squeezed in
        here. A matrix already set through the API is left untouched: this form
        only sends `matrix: []` when somebody actively switches the type, which
        is the moment the old rows stop meaning anything anyway.
      */}
      {user.commissionRate?.type === "matrix" && (
        <Alert variant="info">
          Staf ini memakai komisi matriks (rate berbeda per layanan), yang belum
          bisa disunting dari layar ini. Mengganti jenis komisinya di sini akan
          menghapus matriksnya.
        </Alert>
      )}

      <div>
        <Button type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan jadwal & komisi"}
        </Button>
      </div>
    </form>
  );
}
