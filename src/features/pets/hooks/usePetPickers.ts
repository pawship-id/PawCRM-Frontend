"use client";

import { useCallback } from "react";

import { usePetOptions, type PetOptionChoice } from "@/hooks/usePetOptions";
import type { PetOptionType } from "@/types/api";

/**
 * The items a species / breed / size / coat picker offers — for the two forms
 * that register an animal, `PetForm` and `PetQuickAddDialog`.
 *
 * A THIN LAYER OVER `usePetOptions().choices`, and it exists for one moment:
 * the first render, before the tenant's list has arrived. `choices()` marks
 * any kept code it cannot find as retired, so an edit form opened on a cold
 * cache would read "Anjing (nonaktif)" for a perfectly active species until the
 * list landed. While loading, the stored value is offered under its plain word
 * instead — the trigger reads right, and nothing is called retired that is not.
 */
export function usePetPickers() {
  const { options, choices, label, loading, error } = usePetOptions();

  const pickerOptions = useCallback(
    (type: PetOptionType, stored?: string | null): PetOptionChoice[] => {
      if (!loading) return choices(type, [stored]);

      return stored
        ? [{ value: stored, label: label(type, stored) ?? stored, retired: false }]
        : [];
    },
    [choices, label, loading],
  );

  /**
   * THE BREEDS OF ONE ANIMAL (18 September 2026) — a breed now says which
   * species it belongs to, so a cat's form stops offering "Golden Retriever".
   *
   * A BREED THAT SAYS NOTHING IS OFFERED FOR EVERY ANIMAL: `speciesCode` is
   * null on every breed stored before the field and on any the shop has not
   * sorted, and hiding those would empty the picker for a list nobody has
   * touched yet. No species chosen yet offers all of them, for the same reason.
   *
   * The stored breed is always kept, whatever animal it belongs to — correcting
   * a pet's species must not silently blank its breed.
   */
  const breedOptions = useCallback(
    (species: string | null | undefined, stored?: string | null): PetOptionChoice[] => {
      const all = pickerOptions("breed", stored);
      if (!species) return all;

      const codeOf = new Map(
        options
          .filter((option) => option.type === "breed")
          .map((option) => [option.code, option.speciesCode ?? null]),
      );

      return all.filter((choice) => {
        const belongsTo = codeOf.get(choice.value) ?? null;
        return belongsTo === null || belongsTo === species || choice.value === stored;
      });
    },
    [options, pickerOptions],
  );

  return { pickerOptions, breedOptions, loading, error };
}
