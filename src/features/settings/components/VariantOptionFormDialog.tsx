"use client";

import { useState } from "react";

import { Alert, SelectField, Spinner, TextareaField, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { variantOptionService } from "@/services/variantOption.service";

import { ServiceKindsField } from "./ServiceKindsField";
import type { ServiceKind } from "@/types/api";

const NAME_MAX_LENGTH = 60;
const DESCRIPTION_MAX_LENGTH = 200;

/**
 * "+ Tambah opsi" — a new Opsi Varian card.
 *
 * TWO KINDS, and only these: a "Dipilih staf" card with its first values (one
 * per line), or the tenant's one Zona card, whose values are the zones
 * themselves. The pet's three are seeded and cannot be added again, so the
 * source picker does not offer them; Zona drops out once the card exists.
 */
export function VariantOptionFormDialog({
  hasZoneCard,
  onClose,
  onSaved,
}: {
  hasZoneCard: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<"staff" | "zone">("staff");
  const [valuesText, setValuesText] = useState("");
  const [serviceKinds, setServiceKinds] = useState<ServiceKind[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [valuesError, setValuesError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const values = [
    ...new Set(
      valuesText
        .split("\n")
        .map((line) => line.trim().replace(/\s+/g, " "))
        .filter(Boolean),
    ),
  ];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const cleaned = name.trim().replace(/\s+/g, " ");
    let invalid = false;

    if (cleaned === "") {
      setNameError("Nama opsi wajib diisi.");
      invalid = true;
    }
    if (source === "staff" && values.length === 0) {
      setValuesError("Isi minimal satu nilai, satu per baris.");
      invalid = true;
    }
    if (invalid) return;

    setBusy(true);
    setFormError(null);

    try {
      await variantOptionService.create({
        name: cleaned,
        description: description.trim() || null,
        source,
        serviceKinds,
        ...(source === "staff" ? { values } : {}),
      });
      swalToast(`Opsi ${cleaned} ditambahkan.`);
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.name) {
        setNameError(`Opsi "${cleaned}" sudah ada. Pakai nama lain.`);
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
            <DialogTitle>Tambah opsi</DialogTitle>
            <DialogDescription>
              Sesuatu yang bisa membedakan harga layanan — dicentang di form
              layanan, lalu tiap kombinasinya diberi harga.
            </DialogDescription>
          </DialogHeader>

          {formError && <Alert variant="error">{formError}</Alert>}

          <TextField
            label="Nama opsi"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
            error={nameError ?? undefined}
            placeholder="mis. Lokasi"
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            disabled={busy}
            required
          />

          <SelectField
            label="Nilainya dari"
            value={source}
            onChange={(next) => {
              setSource(next as "staff" | "zone");
              setValuesError(null);
            }}
            options={[
              { value: "staff", label: "Dipilih staf saat booking, kasir, dan faktur" },
              ...(hasZoneCard
                ? []
                : [{ value: "zone", label: "Zona — otomatis dari alamat pelanggan" }]),
            ]}
            disabled={busy}
            required
          />

          {source === "staff" ? (
            <TextareaField
              label="Nilai"
              name="values"
              value={valuesText}
              onChange={(event) => {
                setValuesText(event.target.value);
                setValuesError(null);
              }}
              error={valuesError ?? undefined}
              hint="Satu nilai per baris, mis. Di Toko lalu Di Rumah."
              placeholder={"Di Toko\nDi Rumah"}
              disabled={busy}
              required
            />
          ) : (
            <p className="text-sm text-muted">
              Nilainya adalah daftar zona. Zona pelanggan dihitung dari jarak
              alamatnya ke cabang transaksi.
            </p>
          )}

          <ServiceKindsField
            value={serviceKinds}
            onChange={setServiceKinds}
            disabled={busy}
          />

          <TextField
            label="Keterangan"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="mis. menentukan home grooming tanpa katalog kedua"
            maxLength={DESCRIPTION_MAX_LENGTH}
            disabled={busy}
          />

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner size={16} />}
              Tambah opsi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "+ Nilai" on a "Dipilih staf" card — one label. */
export function VariantValueDialog({
  optionId,
  optionName,
  onClose,
  onSaved,
}: {
  optionId: string;
  optionName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const cleaned = label.trim().replace(/\s+/g, " ");
    if (cleaned === "") {
      setError("Nilai wajib diisi.");
      return;
    }

    setBusy(true);
    try {
      await variantOptionService.addValue(optionId, cleaned);
      swalToast(`${cleaned} ditambahkan ke ${optionName}.`);
      onSaved();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 409
          ? `${cleaned} sudah ada di ${optionName}.`
          : caught instanceof ApiError
            ? caught.fullMessage
            : "Terjadi kesalahan. Coba lagi.",
      );
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
            <DialogTitle>Tambah nilai {optionName}</DialogTitle>
            <DialogDescription>
              Muncul sebagai kolom baru di harga varian layanan yang memakai {optionName}.
            </DialogDescription>
          </DialogHeader>

          <TextField
            label="Nilai"
            name="label"
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              setError(null);
            }}
            error={error ?? undefined}
            maxLength={60}
            autoFocus
            disabled={busy}
            required
          />

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner size={16} />}
              Tambah nilai
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Pensil on a card — its name and keterangan. The source is fixed for life, and
 * a built-in card may be renamed too: "Ukuran" can be the shop's "Size".
 *
 * A RENAME REACHES EVERY SCREEN at once — the form's checkbox, the catalogue's
 * "Ukuran × Lokasi" — while a line already sold keeps the name it was sold under.
 */
export function VariantOptionEditDialog({
  option,
  onClose,
  onSaved,
}: {
  option: {
    _id: string;
    name: string;
    description: string | null;
    serviceCount: number;
    serviceKinds?: ServiceKind[];
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(option.name);
  const [description, setDescription] = useState(option.description ?? "");
  const [serviceKinds, setServiceKinds] = useState<ServiceKind[]>(
    option.serviceKinds ?? [],
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const cleaned = name.trim().replace(/\s+/g, " ");
    if (cleaned === "") {
      setNameError("Nama opsi wajib diisi.");
      return;
    }

    const stored = option.serviceKinds ?? [];
    const kindsChanged =
      stored.length !== serviceKinds.length ||
      stored.some((kind) => !serviceKinds.includes(kind));

    const patch = {
      ...(kindsChanged ? { serviceKinds } : {}),
      ...(cleaned !== option.name ? { name: cleaned } : {}),
      ...((description.trim() || null) !== option.description
        ? { description: description.trim() || null }
        : {}),
    };
    // Nothing changed — nothing to send.
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      await variantOptionService.update(option._id, patch);
      swalToast(`Opsi ${cleaned} disimpan.`);
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.name) {
        setNameError(`Opsi "${cleaned}" sudah ada. Pakai nama lain.`);
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
            <DialogTitle>Ubah opsi</DialogTitle>
            <DialogDescription>
              {option.serviceCount > 0
                ? `Dipakai ${option.serviceCount} layanan — nama barunya langsung tampil di layanan itu. Transaksi yang sudah tercatat tetap memakai nama lama.`
                : "Nama barunya langsung tampil di form layanan."}
            </DialogDescription>
          </DialogHeader>

          {formError && <Alert variant="error">{formError}</Alert>}

          <TextField
            label="Nama opsi"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
            error={nameError ?? undefined}
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            disabled={busy}
            required
          />
          <TextField
            label="Keterangan"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={DESCRIPTION_MAX_LENGTH}
            disabled={busy}
          />

          <ServiceKindsField
            value={serviceKinds}
            onChange={setServiceKinds}
            disabled={busy}
          />

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner size={16} />}
              Simpan opsi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A click on a chip — the value's name, and whether it is still offered. The
 * same dialog for a pet value and a "Dipilih staf" value; `save` says where it
 * is written.
 *
 * NONAKTIF IS THE WAY OUT FOR A VALUE IN USE: deleting one a service prices on
 * is refused, and switching it off stops it being chosen while every price and
 * record already holding it stays.
 */
export function VariantValueEditDialog({
  optionName,
  value,
  save,
  onClose,
  onSaved,
}: {
  optionName: string;
  value: { label: string; isActive: boolean };
  save: (patch: { label?: string; isActive?: boolean }) => Promise<unknown>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(value.label);
  const [isActive, setIsActive] = useState(value.isActive);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const cleaned = label.trim().replace(/\s+/g, " ");
    if (cleaned === "") {
      setError("Nilai wajib diisi.");
      return;
    }

    const patch = {
      ...(cleaned !== value.label ? { label: cleaned } : {}),
      ...(isActive !== value.isActive ? { isActive } : {}),
    };
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      await save(patch);
      swalToast(`${cleaned} disimpan.`);
      onSaved();
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setError(`${cleaned} sudah ada di ${optionName}.`);
      } else {
        setFormError(caught instanceof ApiError ? caught.fullMessage : "Terjadi kesalahan. Coba lagi.");
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
            <DialogTitle>Ubah nilai {optionName}</DialogTitle>
            <DialogDescription>
              Nama baru langsung dipakai di semua layanan dan pilihan. Data yang sudah
              tercatat tetap tersimpan.
            </DialogDescription>
          </DialogHeader>

          {formError && <Alert variant="error">{formError}</Alert>}

          <TextField
            label="Nilai"
            name="label"
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              setError(null);
            }}
            error={error ?? undefined}
            maxLength={60}
            autoFocus
            disabled={busy}
            required
          />

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="variant-value-active">Masih ditawarkan</Label>
              <p className="mt-1 text-xs text-muted">
                Matikan kalau sudah tidak dipakai. Tidak muncul lagi di pilihan baru, tapi
                harga dan data yang sudah memakainya tetap.
              </p>
            </div>
            <Switch
              id="variant-value-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={busy}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner size={16} />}
              Simpan nilai
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
