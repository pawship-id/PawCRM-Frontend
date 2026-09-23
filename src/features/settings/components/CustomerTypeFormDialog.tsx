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
import { customerTypeService } from "@/services/customerType.service";
import type { CustomerType } from "@/services/customerType.service";

/** Backend cap — NAME_MAX_LENGTH in customerType.model.js. */
const NAME_MAX_LENGTH = 60;
/** Backend cap — NOTE_MAX_LENGTH in customerType.model.js. */
const NOTE_MAX_LENGTH = 300;

/**
 * Add a tipe pelanggan, or change one — nama and catatan, on request
 * (24 September 2026).
 *
 * A DIALOG, NOT A ROUTE, matching `ZoneFormDialog` and `BusinessLineFormDialog`:
 * two fields do not earn a page, and the common case is adding Reguler,
 * Reseller and Grosir one after another.
 *
 * ONLY TWO FIELDS BECAUSE NOTHING ELSE EXISTS YET. `customerType.model.js`
 * says so plainly: this is a working list before it is a used one — a price
 * list per type, and a `customerTypeId` on the customer, are the next step.
 */
export function CustomerTypeFormDialog({
  type,
  onClose,
  onSaved,
}: {
  /** Present to change that type; absent to add one. */
  type?: CustomerType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = type !== undefined;

  const [name, setName] = useState(type?.name ?? "");
  const [note, setNote] = useState(type?.note ?? "");
  const [nameError, setNameError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = name.trim();
    if (trimmed === "") {
      setNameError("Nama tipe wajib diisi.");
      return;
    }

    setBusy(true);
    setFormError(null);
    setNameError(undefined);

    const input = { name: trimmed, note: note.trim() === "" ? null : note.trim() };

    try {
      if (editing) {
        await customerTypeService.update(type._id, input);
        swalToast("Tipe pelanggan disimpan.");
      } else {
        await customerTypeService.create(input);
        swalToast("Tipe pelanggan ditambahkan.");
      }
      onSaved();
      onClose();
    } catch (error) {
      // A name clash belongs on the field it is about; anything else is a
      // banner, because retyping the name would not fix it.
      if (error instanceof ApiError && error.status === 409) {
        setNameError(`Tipe "${trimmed}" sudah ada. Pakai nama lain.`);
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
              {editing ? "Ubah tipe pelanggan" : "Tambah tipe pelanggan"}
            </DialogTitle>
            <DialogDescription>
              Menempel di profil pelanggan. Belum jadi dasar harga khusus —
              itu menyusul.
            </DialogDescription>
          </DialogHeader>

          {formError && <Alert variant="error">{formError}</Alert>}

          <TextField
            label="Nama tipe"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(undefined);
            }}
            error={nameError}
            placeholder="mis. Reseller"
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            disabled={busy}
            required
          />

          <TextareaField
            label="Catatan"
            name="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="mis. Nanti bisa pakai daftar harga sendiri"
            maxLength={NOTE_MAX_LENGTH}
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
              {editing ? "Simpan tipe" : "Tambah tipe"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
