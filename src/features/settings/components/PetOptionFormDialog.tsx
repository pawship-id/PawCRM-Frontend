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
import { petOptionService } from "@/services/petOption.service";
import { swalToast } from "@/lib/swal";
import type { PetOption, PetOptionType } from "@/types/api";

import {
  PET_OPTION_LABEL_MAX_LENGTH,
  PET_OPTION_TYPE_WORDS,
} from "../petOptions";

/**
 * Add a word to one of the four lists, or rename one.
 *
 * A DIALOG, NOT A ROUTE, on BusinessLineFormDialog's grounds: one field does not
 * earn a page, the common case is adding three breeds in a row, and keeping the
 * list on screen is what answers "is this one already there".
 *
 * THE NAME IS THE ONLY FIELD. The code is derived by the server from the first
 * name and never changes after — pets, variant prices and commission rows store
 * the CODE, so renaming "Sedang" to "Medium" moves every screen at once and
 * rewrites nothing. Creating says so before the code exists; renaming shows the
 * code read-only so nobody goes hunting for where to edit it.
 *
 * NO ACTIVE SWITCH HERE. Retiring is a row action of its own — somebody adds a
 * word because they want to offer it, and renaming is not the moment to decide
 * whether to stop.
 */
export function PetOptionFormDialog({
  type,
  option,
  onClose,
  onSaved,
}: {
  /** Which list a new word goes into — the pill that was on. */
  type: PetOptionType;
  /** Present to rename that option; absent to add one. */
  option?: PetOption;
  onClose: () => void;
  /** Re-read the screen's list and the app's shared one. */
  onSaved: () => void;
}) {
  const editing = option !== undefined;
  const words = PET_OPTION_TYPE_WORDS[type];

  const [label, setLabel] = useState(option?.label ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = label.trim();

    if (trimmed === "") {
      setFieldError(`Nama ${words.noun} wajib diisi.`);
      return;
    }
    if (trimmed.length > PET_OPTION_LABEL_MAX_LENGTH) {
      setFieldError(`Maksimal ${PET_OPTION_LABEL_MAX_LENGTH} karakter.`);
      return;
    }
    // An untouched rename closes: there is nothing to send, and the server
    // would answer an empty patch with a 400.
    if (editing && trimmed === option.label) {
      onClose();
      return;
    }

    setBusy(true);
    setFieldError(null);
    setFormError(null);

    try {
      if (editing) {
        await petOptionService.update(option._id, { label: trimmed });
      } else {
        await petOptionService.create({ type, label: trimmed });
      }
      onSaved();
      swalToast(
        editing ? `Nama ${words.noun} diubah.` : `${words.title} ditambahkan.`,
      );
      onClose();
    } catch (error) {
      // A clash belongs on the field — it is the name that has to change. The
      // server compares case-insensitively within the list, and a deleted word
      // has already given its name up, so "sudah ada" is the whole story.
      if (error instanceof ApiError && error.status === 409) {
        setFieldError(
          `"${trimmed}" sudah ada di daftar ${words.noun}. Pakai nama lain.`,
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
              {editing ? `Ubah nama ${words.noun}` : `Tambah ${words.noun}`}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Nama baru langsung dipakai di semua layar, termasuk hewan dan layanan yang sudah memakainya."
                : "Kodenya dibuat otomatis dari nama dan tidak bisa diubah nanti. Namanya masih bisa diubah kapan saja."}
            </DialogDescription>
          </DialogHeader>

          {formError && <Alert variant="error">{formError}</Alert>}

          <TextField
            label={`Nama ${words.noun}`}
            name="label"
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              setFieldError(null);
            }}
            error={fieldError ?? undefined}
            placeholder={words.placeholder}
            maxLength={PET_OPTION_LABEL_MAX_LENGTH}
            autoFocus
            disabled={busy}
            required
          />

          {editing && (
            <TextField
              label="Kode"
              name="code"
              value={option.code}
              readOnly
              className="text-muted"
              hint="Kode tidak bisa diubah — data hewan dan harga layanan menyimpan kode ini, bukan namanya."
            />
          )}

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
              {editing ? `Simpan ${words.noun}` : `Tambah ${words.noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
