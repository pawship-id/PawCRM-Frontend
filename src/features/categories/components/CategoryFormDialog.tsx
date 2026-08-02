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
import { categoryService } from "@/services/category.service";
import { swalToast } from "@/lib/swal";
import type { Category } from "@/types/api";

/** Backend cap — NAME_MAX_LENGTH in category.model.js. */
const NAME_MAX_LENGTH = 120;

/**
 * Create or rename a category, in a dialog rather than on its own route.
 *
 * A CATEGORY HAS EXACTLY ONE EDITABLE FIELD. Branches and users get /new and
 * /:id pages because they have a screenful of fields worth a screen; sending
 * somebody to a separate page, and then back, to type one word would make the
 * common case — adding three categories in a row — three round trips through
 * the router. The dialog leaves the list on screen, which is also the thing
 * that tells you whether the name you are about to type already exists.
 *
 * ONE COMPONENT FOR BOTH VERBS because the form is identical; only the request
 * and the wording differ. Splitting them would be two copies of the same field
 * kept in step by hand.
 *
 * THE 409 IS THE INTERESTING FAILURE, and it is shown against the field rather
 * than as a banner: the name is what is wrong, and a message at the top of a
 * one-field form makes the user hunt for which field it means. A deleted
 * category still holding the name is the case that surprises people — the
 * unique index is partial on `deletedAt: null`, so the name looks free and is
 * not until the deleted one is restored or the name is changed.
 */
export function CategoryFormDialog({
  category,
  onClose,
  onSaved,
}: {
  /** Absent to create; present to rename that category. */
  category?: Category;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = category !== undefined;

  const [name, setName] = useState(category?.name ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = name.trim();

    if (trimmed === "") {
      setFieldError("Nama kategori wajib diisi.");
      return;
    }
    if (trimmed.length > NAME_MAX_LENGTH) {
      setFieldError(`Maksimal ${NAME_MAX_LENGTH} karakter.`);
      return;
    }
    // Renaming to the same name would be a request that changes nothing, and
    // the backend rejects an empty patch body anyway.
    if (editing && trimmed === category.name) {
      onClose();
      return;
    }

    setBusy(true);
    setFieldError(null);
    setFormError(null);

    try {
      if (editing) {
        await categoryService.update(category._id, { name: trimmed });
      } else {
        await categoryService.create({ name: trimmed });
      }
      onSaved();
      swalToast(editing ? "Kategori diperbarui." : `Kategori ${trimmed} dibuat.`);
      onClose();
    } catch (error) {
      // A name clash belongs on the field; anything else is a banner, because
      // it is not something the user can fix by retyping.
      if (error instanceof ApiError && error.status === 409) {
        setFieldError(
          `Nama "${trimmed}" sudah dipakai kategori lain. Kategori yang sudah dihapus juga masih memegang namanya sampai dipulihkan atau diganti.`,
        );
      } else {
        setFormError(
          error instanceof ApiError
            ? error.message
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
              {editing ? "Ubah nama kategori" : "Kategori baru"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Nama baru langsung berlaku untuk semua produk yang sudah difilekan di sini."
                : "Kategori hanya mengelompokkan produk — tidak punya harga, stok, maupun aturan sendiri."}
            </DialogDescription>
          </DialogHeader>

          {formError && <Alert variant="error">{formError}</Alert>}

          <TextField
            label="Nama kategori"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFieldError(null);
            }}
            error={fieldError ?? undefined}
            placeholder="mis. Makanan Kucing"
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            required
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner size={16} />}
              {editing ? "Simpan" : "Buat kategori"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
