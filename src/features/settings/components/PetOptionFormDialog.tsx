"use client";

import { useState } from "react";

import { Alert, SelectField, Spinner, TextField } from "@/components";
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
 * THE NAME IS FREELY EDITABLE, and there is no code to show beside it any
 * more. Pets, variant prices and commission rows store the option's `_id`, so
 * renaming "Sedang" to "Medium" moves every screen at once and rewrites
 * nothing.
 *
 * ⚠️ WHAT THE SPECIES FIELD SENDS IS `speciesId` (27 September 2026). It sent
 * `speciesCode` until then — a key the API does not name, which
 * `validate.middleware`'s `stripUnknown: true` removed without a word, so every
 * breed added through this dialog was saved with no animal and the field looked
 * broken rather than refused.
 *
 * NO ACTIVE SWITCH HERE. Retiring is a row action of its own — somebody adds a
 * word because they want to offer it, and renaming is not the moment to decide
 * whether to stop.
 */
export function PetOptionFormDialog({
  type,
  speciesChoices = [],
  option,
  onClose,
  onSaved,
}: {
  /** Which list a new word goes into — the pill that was on. */
  type: PetOptionType;
  /** Present to rename that option; absent to add one. */
  option?: PetOption;
  /**
   * The tenant's animals, for a breed's "Jenis hewan" — from the SCREEN'S OWN
   * list, so opening this dialog costs no second load of the same one.
   */
  speciesChoices?: { value: string; label: string }[];
  onClose: () => void;
  /** Re-read the screen's list and the app's shared one. */
  onSaved: () => void;
}) {
  const editing = option !== undefined;
  const words = PET_OPTION_TYPE_WORDS[type];

  const [label, setLabel] = useState(option?.label ?? "");
  /* A breed says which animal it is for — "" means every animal. */
  const [speciesId, setSpeciesId] = useState(option?.speciesId ?? "");

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
    // An untouched save closes: there is nothing to send, and the server would
    // answer an empty patch with a 400.
    const speciesChanged =
      type === "breed" && (speciesId || null) !== (option?.speciesId ?? null);
    if (editing && trimmed === option.label && !speciesChanged) {
      onClose();
      return;
    }

    setBusy(true);
    setFieldError(null);
    setFormError(null);

    try {
      if (editing) {
        await petOptionService.update(option._id, {
          ...(trimmed === option.label ? {} : { label: trimmed }),
          ...(speciesChanged ? { speciesId: speciesId || null } : {}),
        });
      } else {
        await petOptionService.create({
          type,
          label: trimmed,
          ...(type === "breed" ? { speciesId: speciesId || null } : {}),
        });
      }
      onSaved();
      swalToast(
        editing ? `Nama ${words.noun} diubah.` : `${words.title} ditambahkan.`,
      );
      onClose();
    } catch (error) {
      /*
        A clash belongs on the field — it is the name that has to change. The
        server compares case-insensitively within the list, and a deleted word
        has already given its name up.

        ⚠️ IT SAYS WHICH ANIMAL FOR A BREED (28 September 2026), because the
        name only has to be free within one: "Persia sudah ada di daftar ras"
        reads as a flat refusal when the shop can plainly see no such cat, and
        the breed it collides with may be filed under a different animal
        entirely.

        ⚠️ AND IT NO LONGER SWALLOWS EVERY 409. This blanket mapping is what
        hid a real outage for a day: a stale unique index on the removed `code`
        field made EVERY new option collide, the server answered 409, and this
        branch reported it as a name that was taken — for names nothing had
        ever used. The server NAMES the field on a real label clash now, so a
        conflict it means differently reaches the form error and says what the
        server actually said.
      */
      const labelClash =
        error instanceof ApiError &&
        error.status === 409 &&
        Boolean(error.fieldErrors.label);

      if (labelClash) {
        setFieldError(
          type === "breed" && speciesId
            ? `"${trimmed}" sudah ada untuk jenis hewan itu. Pakai nama lain, atau pilih jenis hewan lain.`
            : `"${trimmed}" sudah ada di daftar ${words.noun}. Pakai nama lain.`,
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
                : "Namanya masih bisa diubah kapan saja."}
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

          {/*
            WHICH ANIMAL A BREED IS FOR (18 September 2026) — "Poodle" is a dog.
            "Semua hewan" is an honest answer: a shop that has not sorted its
            list yet keeps offering every breed for every animal.
          */}
          {type === "breed" && (
            <SelectField
              label="Jenis hewan"
              value={speciesId}
              onChange={setSpeciesId}
              options={[
                { value: "", label: "Semua hewan" },
                ...speciesChoices.map((choice) => ({
                  value: choice.value,
                  label: choice.label,
                })),
              ]}
              hint="Dipakai untuk menyaring pilihan ras saat mencatat hewan."
              disabled={busy}
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
