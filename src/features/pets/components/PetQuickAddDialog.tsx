"use client";

import { useState } from "react";

import { Alert, TextField } from "@/components";
import { SelectField } from "@/components";
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
import { petService } from "@/services/pet.service";
import type { Pet, PetOptionId } from "@/types/api";

import { usePetPickers } from "../hooks/usePetPickers";

const NAME_MAX_LENGTH = 80;

/**
 * Registers an animal without leaving whatever screen you are on.
 *
 * BUILT FOR THE POS, not for this module. The Booking Bridge (FR-3, Fase 4) has
 * to let a cashier add a pet mid-sale — "bisa tambah hewan baru langsung di
 * modal ini (nama saja)" — and a redirect to the pet form would abandon a
 * half-built cart. It lands in Fase 1 because it belongs to the pets feature and
 * because the customer detail screen wants it too.
 *
 * FOUR FIELDS, NOT NINE — and it was two until 7 September 2026.
 *
 * ─── WHY SIZE AND COAT EARNED THEIR PLACE ──────────────────────────────────
 *
 * The rule was "name and species, everything else later", and it was right while
 * everything else was `ras`, `berat`, `microchip` — facts nobody at a counter
 * with a dog on the lead needs to answer to ring up a sale.
 *
 * SIZE AND COAT ARE NOT THAT. They are what a variant-priced grooming is priced
 * BY, so a pet quick-added without them cannot be quoted at all: the till adds
 * the animal, then refuses the service it was added for, and sends the cashier
 * to the full form anyway — with the customer still standing there. The two
 * fields that remove that dead end are cheaper on this dialog than the trip they
 * replace.
 *
 * OPTIONAL BY DEFAULT, because a shop whose services are flat-priced never
 * needs either, and a required field with nothing to say is a field that gets
 * filled in wrong. The screen that DOES need them says so at the moment it
 * needs them — either by asking here (`requireTraits`, which grooming booking
 * passes) or by sending somebody back for them later (`PetFixLink`).
 *
 * NOTHING ELSE JOINS THEM without the same argument: a quick-add that asked for
 * a birth date would be the full form wearing a dialog.
 *
 * ─── THE SAME LISTS AS THE FULL FORM ───────────────────────────────────────
 *
 * Species, sizes and coats are the tenant's own lists since 14 September 2026
 * (`petoptions`), and this dialog offers exactly what `PetForm` offers — both
 * read `usePetPickers`, so an animal is described one way wherever it is
 * described. They were copied arrays here before, and the copy had already
 * drifted once. Nothing is stored yet, so only ACTIVE options are offered.
 *
 * THE OWNER IS A PROP, not a picker. Every caller already knows whose animal it
 * is: the POS has a selected pelanggan, and the customer screen IS one. Offering
 * a customer picker here would let somebody file the pet under the wrong person
 * from a screen that was already telling them the right one.
 *
 * `onCreated` hands the created pet straight back, so the caller can select it
 * immediately rather than refetching a list to find the row it just made.
 */
export function PetQuickAddDialog({
  customerId,
  customerName,
  open,
  onOpenChange,
  onCreated,
  requireTraits = false,
}: {
  customerId: string;
  /** Shown in the dialog so nobody has to trust that the right owner is implied. */
  customerName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (pet: Pet) => void;
  /**
   * Demands Ukuran and Jenis bulu instead of merely offering them.
   *
   * FOR THE SCREEN THAT CANNOT PROCEED WITHOUT THEM — grooming booking, where
   * the variant price IS size and coat, so a pet added blank is a pet that has
   * to be fixed before the row it was added for can be quoted. Asking here
   * costs two taps; the `PetFixLink` round trip it replaces costs a screen.
   *
   * OFF EVERYWHERE ELSE, for the reason the fields were optional to begin
   * with: a flat-priced shop has nothing to say in either.
   */
  requireTraits?: boolean;
}) {
  const [name, setName] = useState("");
  /* Option IDS, not codes — `usePetPickers` builds the items. See PetForm. */
  const [species, setSpecies] = useState<PetOptionId | "">("");
  const [size, setSize] = useState<PetOptionId | "">("");
  const [furType, setFurType] = useState<PetOptionId | "">("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [speciesError, setSpeciesError] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [furTypeError, setFurTypeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setSpecies("");
    setSize("");
    setFurType("");
    setNameError(null);
    setSpeciesError(null);
    setSizeError(null);
    setFurTypeError(null);
    setFormError(null);
  }

  function handleOpenChange(next: boolean) {
    // Never close mid-write: the caller would be told nothing about whether the
    // pet was created.
    if (saving) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const trimmed = name.trim();
    let invalid = false;

    if (trimmed === "") {
      setNameError("Nama hewan wajib diisi.");
      invalid = true;
    } else if (trimmed.length > NAME_MAX_LENGTH) {
      setNameError(`Maksimal ${NAME_MAX_LENGTH} karakter.`);
      invalid = true;
    }
    if (species === "") {
      setSpeciesError("Pilih jenis hewannya.");
      invalid = true;
    }
    if (requireTraits && size === "") {
      setSizeError("Pilih ukurannya.");
      invalid = true;
    }
    if (requireTraits && furType === "") {
      setFurTypeError("Pilih jenis bulunya.");
      invalid = true;
    }

    if (invalid) return;

    setSaving(true);
    setFormError(null);

    try {
      const pet = await petService.create({
        customerId,
        name: trimmed,
        species: species as PetOptionId,
        /* NULL, NOT OMITTED, when nothing was chosen — "belum diisi" is a real
           state the pricing rule reads, and the API says so explicitly. */
        size: size === "" ? null : size,
        furType: furType === "" ? null : furType,
      });

      onCreated(pet);
      reset();
      onOpenChange(false);
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? (error.reason ?? error.message)
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Tambah hewan</DialogTitle>
            <DialogDescription>
              {customerName
                ? `Didaftarkan atas nama ${customerName}. Ciri-ciri lainnya bisa dilengkapi nanti.`
                : "Ciri-ciri lainnya bisa dilengkapi nanti."}
            </DialogDescription>
          </DialogHeader>

          {formError && <Alert variant="error">{formError}</Alert>}

          <TextField
            label="Nama hewan"
            name="quick-pet-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
            error={nameError ?? undefined}
            placeholder="mis. Bella"
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            disabled={saving}
            required
          />

          <QuickAddPickers
            species={species}
            onSpeciesChange={(next) => {
              setSpecies(next);
              setSpeciesError(null);
            }}
            speciesError={speciesError}
            size={size}
            onSizeChange={(next) => {
              setSize(next);
              setSizeError(null);
            }}
            sizeError={sizeError}
            furType={furType}
            onFurTypeChange={(next) => {
              setFurType(next);
              setFurTypeError(null);
            }}
            furTypeError={furTypeError}
            required={requireTraits}
            disabled={saving}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Tambah hewan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Jenis, then Ukuran and Jenis bulu side by side.
 *
 * ITS OWN COMPONENT FOR ONE REASON: the dialog's content is mounted only while
 * it is open, so the tenant's lists are asked for when somebody opens the
 * dialog — not by every booking form and till screen that merely carries it
 * closed.
 */
function QuickAddPickers({
  species,
  onSpeciesChange,
  speciesError,
  size,
  onSizeChange,
  sizeError,
  furType,
  onFurTypeChange,
  furTypeError,
  required,
  disabled,
}: {
  species: PetOptionId | "";
  onSpeciesChange: (next: PetOptionId) => void;
  speciesError: string | null;
  size: PetOptionId | "";
  onSizeChange: (next: PetOptionId) => void;
  sizeError: string | null;
  furType: PetOptionId | "";
  onFurTypeChange: (next: PetOptionId) => void;
  furTypeError: string | null;
  /** Ukuran and Jenis bulu are answers, not offers — see `requireTraits`. */
  required: boolean;
  disabled: boolean;
}) {
  const { pickerOptions, loading, error } = usePetPickers();

  return (
    <>
      <SelectField
        label="Jenis"
        value={species}
        onChange={onSpeciesChange}
        options={pickerOptions("species")}
        placeholder={loading ? "Memuat…" : "Pilih jenis"}
        error={speciesError ?? undefined}
        hint={error ?? undefined}
        disabled={disabled || loading}
        required
      />

      {/*
        SIDE BY SIDE. They sit under the two required fields because that is the
        order somebody answers them in — what is it called, what is it, then
        what is it like — and they are the two the price may depend on. A shop
        with flat prices leaves both alone; a grooming booking cannot, which is
        what `required` is for.
      */}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Ukuran"
          value={size}
          onChange={onSizeChange}
          options={pickerOptions("size")}
          placeholder={loading ? "Memuat…" : "Pilih ukuran"}
          error={sizeError ?? undefined}
          disabled={disabled || loading}
          required={required}
        />
        <SelectField
          label="Jenis bulu"
          value={furType}
          onChange={onFurTypeChange}
          options={pickerOptions("furType")}
          placeholder={loading ? "Memuat…" : "Pilih jenis bulu"}
          error={furTypeError ?? undefined}
          disabled={disabled || loading}
          required={required}
        />
      </div>
    </>
  );
}
