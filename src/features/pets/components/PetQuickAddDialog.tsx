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
import type { Pet, PetSpecies } from "@/types/api";

const NAME_MAX_LENGTH = 80;

const SPECIES_OPTIONS: { value: PetSpecies; label: string }[] = [
  { value: "cat", label: "Kucing" },
  { value: "dog", label: "Anjing" },
];

/**
 * Registers an animal without leaving whatever screen you are on.
 *
 * BUILT FOR THE POS, not for this module. The Booking Bridge (FR-3, Fase 4) has
 * to let a cashier add a pet mid-sale — "bisa tambah hewan baru langsung di
 * modal ini (nama saja)" — and a redirect to the pet form would abandon a
 * half-built cart. It lands in Fase 1 because it belongs to the pets feature and
 * because the customer detail screen wants it too.
 *
 * TWO FIELDS, NOT NINE. Name and species are what the API requires and what
 * somebody at a counter with a dog on the lead can actually answer; everything
 * else — ras, berat, microchip — is filled in later from the full form, exactly
 * as the PRD says a quick-added customer's profile is. A quick-add that asked
 * for a birth date would be the full form wearing a dialog.
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
}: {
  customerId: string;
  /** Shown in the dialog so nobody has to trust that the right owner is implied. */
  customerName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (pet: Pet) => void;
}) {
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<PetSpecies | "">("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [speciesError, setSpeciesError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setSpecies("");
    setNameError(null);
    setSpeciesError(null);
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

    if (invalid) return;

    setSaving(true);
    setFormError(null);

    try {
      const pet = await petService.create({
        customerId,
        name: trimmed,
        species: species as PetSpecies,
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
                : "Cukup nama dan jenisnya dulu. Ciri-ciri lainnya bisa dilengkapi nanti."}
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

          <SelectField
            label="Jenis"
            value={species}
            onChange={(next) => {
              setSpecies(next as PetSpecies);
              setSpeciesError(null);
            }}
            options={SPECIES_OPTIONS}
            placeholder="Pilih jenis"
            error={speciesError ?? undefined}
            disabled={saving}
            required
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
