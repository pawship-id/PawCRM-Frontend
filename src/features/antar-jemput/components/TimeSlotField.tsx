"use client";

import { FilterSelect } from "@/components";

import { asSlot, TIME_SLOTS } from "../ride";

const OPTIONS = TIME_SLOTS.map((slot) => ({ value: slot, label: slot.replace(":", ".") }));

/**
 * A time, picked every half hour — BO's note 8 (21 September 2026): "jamnya
 * bukan free text, bisa kelipatan 30 menit".
 *
 * THE FORM'S SEARCHABLE PICKER (§16), not a native select: forty-eight slots is
 * a list somebody wants to type "14" into. A stored time off the half hour —
 * one written before this field — reads as the slot it falls in rather than
 * as blank.
 */
export function TimeSlotField({
  label,
  value,
  onChange,
  disabled,
  error,
}: {
  label: string;
  /** "09:30". */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <FilterSelect
      layout="form"
      label={label}
      ariaLabel={label}
      value={asSlot(value)}
      options={OPTIONS}
      onChange={onChange}
      active={false}
      placeholder="Pilih jam"
      searchable
      searchPlaceholder="Cari jam, mis. 14"
      closeOnScroll
      required
      disabled={disabled}
      error={error}
    />
  );
}
