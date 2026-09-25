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
  const { options, choices, label, code, loading, error } = usePetOptions();

  /*
    `by: "id"` — A PET STORES THE OPTION'S `_id` (25 September 2026), so these
    two forms must SAVE ids. Every other caller of `choices` fills a service
    variant's axis, which is still keyed by code; that is why the default
    stayed `code` rather than flipping under them.
  */
  const pickerOptions = useCallback(
    (type: PetOptionType, stored?: string | null): PetOptionChoice[] => {
      if (!loading) return choices(type, [stored], { by: "id" });

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

      /*
        TWO SIDES OF THE SAME LINK, IN TWO CURRENCIES (25 September 2026). The
        picker now deals in breed IDS, while `speciesCode` on a breed is exactly
        what its name says — a species CODE, because only the PET moved to ids
        and the option rows point at each other as they did. So the map is keyed
        by `_id` and the selected species is translated to its code before the
        comparison; matching the raw ids would exclude every breed.
      */
      const chosen = code("species", species);

      const belongsToOf = new Map(
        options
          .filter((option) => option.type === "breed")
          .map((option) => [option._id, option.speciesCode ?? null]),
      );

      return all.filter((choice) => {
        const belongsTo = belongsToOf.get(choice.value) ?? null;
        return belongsTo === null || belongsTo === chosen || choice.value === stored;
      });
    },
    [options, pickerOptions, code],
  );

  return { pickerOptions, breedOptions, loading, error };
}
