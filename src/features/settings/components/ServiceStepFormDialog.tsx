"use client";

import { useState } from "react";

import { Alert, Spinner, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/services/api-error";
import type { BusinessLine } from "@/services/businessLine.service";
import { serviceStepService } from "@/services/serviceStep.service";
import { swalToast } from "@/lib/swal";
import type { ServiceStep } from "@/types/api";

import { SERVICE_STEP_NAME_MAX_LENGTH, stepNameOf } from "../serviceSteps";

/**
 * Add a tahapan to one line's list, or rename one.
 *
 * A DIALOG, NOT A ROUTE, on PetOptionFormDialog's grounds: one field, the
 * common case is adding three in a row, and the list staying on screen is what
 * answers "is this one already there".
 *
 * THE NAME IS THE ONLY FIELD. The line is the pill that was on and never
 * changes after; the order is the end of the list (the server appends) and is
 * moved from the table; retiring is a row action. The commission weight is not
 * here at all — it belongs to a step's place IN A SERVICE (`sessionWeights[i]`),
 * so the same "Mandi" can weigh differently in two services.
 *
 * A RENAME IS NOT ONLY A LABEL. Services store the NAME, not an id, so the
 * server rewrites every service of the line that lists the old one, and leaves
 * bookings alone — a booking's turn is a record of what was agreed on the day.
 * When `serviceCount` says services are affected, the dialog says how many
 * BEFORE the click, and the toast says how many after, from
 * `renamedServiceCount`.
 */
export function ServiceStepFormDialog({
  line,
  step,
  onClose,
  onSaved,
}: {
  /** The line a new step goes into — the pill that was on. */
  line: BusinessLine;
  /** Present to rename that step; absent to add one. */
  step?: ServiceStep;
  onClose: () => void;
  /** Re-read the screen's list and the app's shared one. */
  onSaved: () => void;
}) {
  const editing = step !== undefined;
  const usedBy = step?.serviceCount ?? 0;

  const [name, setName] = useState(step?.name ?? "");
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
    // An untouched rename closes: there is nothing to send, and a PATCH with
    // the same name would still rewrite every service for nothing.
    if (editing && cleaned === step.name) {
      onClose();
      return;
    }

    setBusy(true);
    setFieldError(null);
    setFormError(null);

    try {
      if (editing) {
        const saved = await serviceStepService.update(step._id, {
          name: cleaned,
        });
        const renamed = saved.renamedServiceCount ?? 0;
        onSaved();
        swalToast(
          renamed > 0
            ? `Nama tahapan disimpan. ${renamed} layanan ikut diperbarui.`
            : "Nama tahapan disimpan.",
        );
      } else {
        await serviceStepService.create({
          businessLineId: line._id,
          name: cleaned,
        });
        onSaved();
        swalToast("Tahapan ditambahkan.");
      }
      onClose();
    } catch (error) {
      // A clash belongs on the field — it is the name that has to change. The
      // server compares case-insensitively within the line, and a deleted step
      // has already given its name up, so "sudah ada" is the whole story.
      if (error instanceof ApiError && error.status === 409) {
        setFieldError(
          `"${cleaned}" sudah ada di tahapan ${line.name}. Pakai nama lain.`,
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
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Ubah nama tahapan" : "Tambah tahapan"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? `Nama baru langsung dipakai di semua layanan ${line.name}.`
                : `Masuk ke daftar tahapan ${line.name}, di urutan paling akhir. Bobot komisinya diisi di tiap layanan.`}
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
