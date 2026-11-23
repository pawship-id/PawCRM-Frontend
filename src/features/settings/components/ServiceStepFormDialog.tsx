"use client";

import { useState } from "react";

import {
  Alert,
  FormField,
  Spinner,
  TextareaField,
  TextField,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/services/api-error";
import { serviceStepService } from "@/services/serviceStep.service";
import { swalToast } from "@/lib/swal";
import type { ServiceKind, ServiceStep } from "@/types/api";

import {
  HOTEL_TIME_MAX_LENGTH,
  MAX_ESTIMATE_MINUTES,
  SERVICE_STEP_NAME_MAX_LENGTH,
  STEP_NOTE_MAX_LENGTH,
  STEP_USED_IN,
  stepNameOf,
  stepUsedIn,
} from "../serviceSteps";

/**
 * Add a tahapan to the list, or rename one.
 *
 * A DIALOG, NOT A ROUTE, on PetOptionFormDialog's grounds: one field, the
 * common case is adding three in a row, and the list staying on screen is what
 * answers "is this one already there".
 *
 * NAME, ESTIMASI AND JAM DEFAULT (HOTEL) — one list per tenant (22 September
 * 2026); Estimasi and Jam default joined on 22 November 2026 (BO, mockup). Both
 * are optional. The order is the end of the list (the server appends) and is
 * moved from the table; retiring is a row action. The commission weight is not
 * here at all — it belongs to a step's place IN A SERVICE (`sessionWeights[i]`),
 * so the same "Mandi" can weigh differently in two services.
 *
 * DIPAKAI DI (23 November 2026, BO) — Grooming, Hotel, Antar-Jemput; at least
 * one, all three on a new step. Jam default (hotel) is asked only while Hotel
 * is ticked, and is dropped when it is not.
 *
 * A RENAME IS NOT ONLY A LABEL. Services store the NAME, not an id, so the
 * server rewrites every service that lists the old one, and leaves
 * bookings alone — a booking's turn is a record of what was agreed on the day.
 * When `serviceCount` says services are affected, the dialog says how many
 * BEFORE the click, and the toast says how many after, from
 * `renamedServiceCount`.
 */
export function ServiceStepFormDialog({
  step,
  initialName = "",
  description,
  onClose,
  onSaved,
  onCreated,
}: {
  /** Present to rename that step; absent to add one. */
  step?: ServiceStep;
  /** Prefilled name when adding — what was typed in a picker. */
  initialName?: string;
  /** Replaces the add dialog's description — the caller says where the step goes. */
  description?: string;
  onClose: () => void;
  /** After an add: the step as the server saved it. */
  onCreated?: (step: ServiceStep) => void;
  /** Re-read the screen's list and the app's shared one. */
  onSaved: () => void;
}) {
  const editing = step !== undefined;
  const usedBy = step?.serviceCount ?? 0;

  const [name, setName] = useState(step?.name ?? initialName);
  const [estimate, setEstimate] = useState(
    step?.estimateMinutes ? String(step.estimateMinutes) : "",
  );
  const [hotelTime, setHotelTime] = useState(step?.hotelTime ?? "");
  const [note, setNote] = useState(step?.note ?? "");
  const [usedIn, setUsedIn] = useState<ServiceKind[]>(() => stepUsedIn(step));
  const [usedInError, setUsedInError] = useState<string | null>(null);
  const forHotel = usedIn.includes("hotel");
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const cleaned = stepNameOf(name);

    if (cleaned === "") {
      setFieldError("Nama tahapan wajib diisi.");
      return;
    }
    if (cleaned.length > SERVICE_STEP_NAME_MAX_LENGTH) {
      setFieldError(`Maksimal ${SERVICE_STEP_NAME_MAX_LENGTH} karakter.`);
      return;
    }
    if (usedIn.length === 0) {
      setUsedInError("Pilih minimal satu layanan.");
      return;
    }
    const estimateMinutes = estimate.trim() === "" ? null : Number(estimate);
    if (
      estimateMinutes !== null &&
      (!Number.isInteger(estimateMinutes) ||
        estimateMinutes < 1 ||
        estimateMinutes > MAX_ESTIMATE_MINUTES)
    ) {
      setEstimateError(`Isi 1–${MAX_ESTIMATE_MINUTES} menit, atau kosongkan.`);
      return;
    }
    const time = forHotel
      ? hotelTime.trim().replace(/\s+/g, " ") || null
      : null;
    // In the dialog's order, so an unchanged set compares equal.
    const kinds = STEP_USED_IN.map((option) => option.value).filter((kind) =>
      usedIn.includes(kind),
    );
    const cleanedNote = note.trim() || null;

    // Only what changed is sent: a PATCH carrying the same name would still
    // rewrite every service for nothing.
    const changes = editing
      ? {
          ...(cleaned !== step.name ? { name: cleaned } : {}),
          ...(estimateMinutes !== (step.estimateMinutes ?? null)
            ? { estimateMinutes }
            : {}),
          ...(time !== (step.hotelTime ?? null) ? { hotelTime: time } : {}),
          ...(cleanedNote !== (step.note ?? null) ? { note: cleanedNote } : {}),
          ...(kinds.join() !==
          STEP_USED_IN.map((option) => option.value)
            .filter((kind) => stepUsedIn(step).includes(kind))
            .join()
            ? { usedIn: kinds }
            : {}),
        }
      : {};
    if (editing && Object.keys(changes).length === 0) {
      onClose();
      return;
    }

    setBusy(true);
    setFieldError(null);
    setFormError(null);

    try {
      if (editing) {
        const saved = await serviceStepService.update(step._id, changes);
        const renamed = saved.renamedServiceCount ?? 0;
        onSaved();
        swalToast(
          renamed > 0
            ? `Tahapan disimpan. ${renamed} layanan ikut diperbarui.`
            : "Tahapan disimpan.",
        );
      } else {
        const created = await serviceStepService.create({
          name: cleaned,
          estimateMinutes,
          hotelTime: time,
          note: cleanedNote,
          usedIn: kinds,
        });
        onSaved();
        onCreated?.(created);
        swalToast("Tahapan ditambahkan.");
      }
      onClose();
    } catch (error) {
      // A clash belongs on the field — it is the name that has to change. The
      // server compares case-insensitively across the list, and a deleted step
      // has already given its name up, so "sudah ada" is the whole story.
      if (error instanceof ApiError && error.status === 409) {
        setFieldError(
          `"${cleaned}" sudah ada di daftar tahapan. Pakai nama lain.`,
        );
      } else {
        setFormError(
          error instanceof ApiError
            ? error.fullMessage
            : "Terjadi kesalahan. Coba lagi.",
        );
      }
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>
              {editing ? "Ubah tahapan" : "Tambah tahapan"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Nama baru langsung dipakai di semua layanan yang memakainya. Jam default hanya mengisi layanan hotel dan kegiatan harian yang menambahkan tahapan ini sesudahnya."
                : (description ??
                  "Masuk ke daftar tahapan, di urutan paling akhir. Bobot komisinya diisi di tiap layanan.")}
            </DialogDescription>
          </DialogHeader>

          {formError && <Alert variant="error">{formError}</Alert>}

          {editing && usedBy > 0 && (
            <Alert variant="warning">
              {usedBy} layanan memakai tahapan ini dan ikut berganti nama.
              Booking yang sudah dibuat tetap memakai nama lama.
            </Alert>
          )}

          <TextField
            label="Nama tahapan"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFieldError(null);
            }}
            error={fieldError ?? undefined}
            placeholder="mis. Mandi"
            maxLength={SERVICE_STEP_NAME_MAX_LENGTH}
            autoFocus
            disabled={busy}
            required
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-foreground">
              Dipakai di
            </legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {STEP_USED_IN.map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground"
                >
                  <Checkbox
                    checked={usedIn.includes(option.value)}
                    disabled={busy}
                    onCheckedChange={(next) => {
                      setUsedIn((current) =>
                        next === true
                          ? [...current, option.value]
                          : current.filter((kind) => kind !== option.value),
                      );
                      setUsedInError(null);
                    }}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {usedInError && (
              <p role="alert" className="text-sm font-semibold text-danger">
                {usedInError}
              </p>
            )}
          </fieldset>

          <div className="flex flex-col gap-4">
            <FormField
              label="Estimasi"
              hint="Opsional. Berapa lama biasanya."
              error={estimateError ?? undefined}
            >
              {(field) => (
                <div className="relative">
                  <Input
                    {...field}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_ESTIMATE_MINUTES}
                    value={estimate}
                    onChange={(event) => {
                      setEstimate(event.target.value);
                      setEstimateError(null);
                    }}
                    placeholder="mis. 15"
                    disabled={busy}
                    className="h-11 pr-16 tabular-nums"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
                    menit
                  </span>
                </div>
              )}
            </FormField>
            {forHotel && (
              <FormField
                label="Jam default (hotel)"
                hint="Opsional. Kalau diisi jam (08:00), jam itu langsung terisi di hotel."
              >
                {(field) => (
                  <Input
                    {...field}
                    value={hotelTime}
                    onChange={(event) => setHotelTime(event.target.value)}
                    placeholder="mis. 08:00 atau Ikut jam datang"
                    maxLength={HOTEL_TIME_MAX_LENGTH}
                    disabled={busy}
                    className="h-11"
                  />
                )}
              </FormField>
            )}
          </div>

          <TextareaField
            label="Catatan"
            name="note"
            hint="Opsional."
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="mis. Pakai sampo hipoalergenik untuk kulit sensitif"
            maxLength={STEP_NOTE_MAX_LENGTH}
            rows={3}
            disabled={busy}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={busy}
            >
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner size={16} />}
              {editing ? "Simpan tahapan" : "Tambah tahapan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
