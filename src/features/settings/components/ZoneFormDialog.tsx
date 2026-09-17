"use client";

import { useState } from "react";

import { Alert, Spinner, TextareaField, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { zoneService } from "@/services/zone.service";
import type { Zone } from "@/types/api";

import {
  ZONE_DESCRIPTION_MAX_LENGTH,
  ZONE_NAME_MAX_LENGTH,
  kmText,
  kmValue,
  rangesOverlap,
  zoneRangeText,
} from "../zones";

interface FieldErrors {
  name?: string;
  minKm?: string;
  maxKm?: string;
}

/**
 * Add a zona, or change one — nama, keterangan, jarak minimal and maksimal.
 *
 * THE RANGE IS CHECKED HERE BEFORE IT IS SENT, against the zones already on the
 * screen, with the server's own rule: min in, max out, no shared distance. The
 * server checks again inside a transaction — this is only so the refusal names
 * the zone in the way while the boxes are still open, not after a round trip.
 * A 409 that gets past it (somebody else saved meanwhile) lands in the same
 * place.
 */
export function ZoneFormDialog({
  zone,
  zones,
  onClose,
  onSaved,
}: {
  /** Present to change that zone; absent to add one. */
  zone?: Zone;
  /** Every zone on the screen — the live ones are what a range may not overlap. */
  zones: Zone[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = zone !== undefined;

  const [name, setName] = useState(zone?.name ?? "");
  const [description, setDescription] = useState(zone?.description ?? "");
  const [minKm, setMinKm] = useState(zone ? kmText(zone.minKm) : "");
  const [maxKm, setMaxKm] = useState(zone ? kmText(zone.maxKm) : "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function validate(): { name: string; minKm: number; maxKm: number } | null {
    const next: FieldErrors = {};
    const cleaned = name.trim().replace(/\s+/g, " ");
    const min = kmValue(minKm);
    const max = kmValue(maxKm);

    if (cleaned === "") next.name = "Nama zona wajib diisi.";
    if (min === null) next.minKm = "Isi jarak 0–1000 km, maksimal 3 angka di belakang koma.";
    if (max === null) next.maxKm = "Isi jarak 0–1000 km, maksimal 3 angka di belakang koma.";

    if (min !== null && max !== null) {
      if (max <= min) {
        next.maxKm = "Harus lebih besar dari jarak minimal.";
      } else {
        const clash = zones.find(
          (other) =>
            other.deletedAt === null &&
            other._id !== zone?._id &&
            rangesOverlap(min, max, other.minKm, other.maxKm),
        );
        if (clash) {
          next.minKm = `Bertabrakan dengan ${clash.name} (${zoneRangeText(clash)}).`;
        }
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0 && min !== null && max !== null
      ? { name: cleaned, minKm: min, maxKm: max }
      : null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const valid = validate();
    if (!valid) return;

    setBusy(true);
    setFormError(null);

    const input = {
      name: valid.name,
      description: description.trim() === "" ? null : description.trim(),
      minKm: valid.minKm,
      maxKm: valid.maxKm,
    };

    try {
      if (editing) {
        await zoneService.update(zone._id, input);
        swalToast("Zona disimpan.");
      } else {
        await zoneService.create(input);
        swalToast("Zona ditambahkan.");
      }
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // The server says which: a taken name, or a range somebody else's zone
        // now covers.
        if (error.fieldErrors.name) {
          setErrors({ name: `Zona "${valid.name}" sudah ada. Pakai nama lain.` });
        } else {
          setErrors({ minKm: error.reason ?? error.fullMessage });
        }
      } else {
        setFormError(error instanceof ApiError ? error.fullMessage : "Terjadi kesalahan. Coba lagi.");
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
            <DialogTitle>{editing ? "Ubah zona" : "Tambah zona"}</DialogTitle>
            <DialogDescription>
              Jarak minimal ikut zona, jarak maksimal tidak — 1–3 km berarti 1
              sampai 2,999 km, jadi zona berikutnya bisa mulai di 3.
            </DialogDescription>
          </DialogHeader>

          {formError && <Alert variant="error">{formError}</Alert>}

          <TextField
            label="Nama zona"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setErrors((current) => ({ ...current, name: undefined }));
            }}
            error={errors.name}
            placeholder="mis. Zona A"
            maxLength={ZONE_NAME_MAX_LENGTH}
            autoFocus
            disabled={busy}
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Jarak minimal (km)"
              name="minKm"
              inputMode="decimal"
              value={minKm}
              onChange={(event) => {
                setMinKm(event.target.value);
                setErrors((current) => ({ ...current, minKm: undefined }));
              }}
              error={errors.minKm}
              hint="Termasuk dalam zona."
              placeholder="mis. 0"
              className="tabular-nums"
              disabled={busy}
              required
            />
            <TextField
              label="Jarak maksimal (km)"
              name="maxKm"
              inputMode="decimal"
              value={maxKm}
              onChange={(event) => {
                setMaxKm(event.target.value);
                setErrors((current) => ({ ...current, maxKm: undefined }));
              }}
              error={errors.maxKm}
              hint="Tidak termasuk dalam zona."
              placeholder="mis. 3"
              className="tabular-nums"
              disabled={busy}
              required
            />
          </div>

          <TextareaField
            label="Keterangan"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="mis. Citraland dan sekitarnya"
            maxLength={ZONE_DESCRIPTION_MAX_LENGTH}
            disabled={busy}
          />

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner size={16} />}
              {editing ? "Simpan zona" : "Tambah zona"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
