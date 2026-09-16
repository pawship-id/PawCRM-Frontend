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
  const { choices, label, loading, error } = usePetOptions();

  const pickerOptions = useCallback(
    (type: PetOptionType, stored?: string | null): PetOptionChoice[] => {
      if (!loading) return choices(type, [stored]);

      return stored
        ? [{ value: stored, label: label(type, stored) ?? stored, retired: false }]
        : [];
    },
    [choices, label, loading],
  );

  return { pickerOptions, loading, error };
}
