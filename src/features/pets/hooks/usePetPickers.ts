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

  /*
    EVERY CHOICE IS AN OPTION `_id` (25 September 2026). `choices` took a `by`
    flag for one day — `"id"` here, `"code"` for a service variant's axis — and
    the axes hold ids too now, so there is one currency and no flag.
  */
  const pickerOptions = useCallback(
    (type: PetOptionType, stored?: string | null): PetOptionChoice[] => {
      if (!loading) return choices(type, [stored]);

      return stored
        ? [
            {
              value: stored,
              label: label(type, stored) ?? stored,
              retired: false,
            },
          ]
        : [];
    },
    [choices, label, loading],
  );

  /**
   * THE BREEDS OF ONE ANIMAL (18 September 2026) — a breed now says which
   * species it belongs to, so a cat's form stops offering "Golden Retriever".
   *
   * A BREED THAT SAYS NOTHING IS OFFERED FOR EVERY ANIMAL: `speciesId` is null
   * on every breed stored before the field and on any the shop has not sorted,
   * and hiding those would empty the picker for a list nobody has touched yet.
   * No species chosen yet offers all of them, for the same reason.
   *
   * The stored breed is always kept, whatever animal it belongs to — correcting
   * a pet's species must not silently blank its breed.
   */
  const breedOptions = useCallback(
    (
      species: string | null | undefined,
      stored?: string | null,
    ): PetOptionChoice[] => {
      const all = pickerOptions("breed", stored);
      if (!species) return all;

      /*
        BOTH SIDES OF THE LINK ARE IDS (25 September 2026). `speciesId` on a
        breed is the species row's own `_id`, which is exactly what this picker
        already holds for the selected species — so the two are compared
        directly. It used to store a CODE, and this function had to translate
        the selected id back into one on every render before it could match.
      */
      const belongsToOf = new Map(
        options
          .filter((option) => option.type === "breed")
          .map((option) => [option._id, option.speciesId ?? null]),
      );

      return all.filter((choice) => {
        const belongsTo = belongsToOf.get(choice.value) ?? null;
        return (
          belongsTo === null || belongsTo === species || choice.value === stored
        );
      });
    },
    [options, pickerOptions],
  );

  return { pickerOptions, breedOptions, loading, error };
}
