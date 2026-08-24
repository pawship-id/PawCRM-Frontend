"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { FormField } from "./FormField";

/**
 * The short select — a closed list of roughly eight options or fewer that needs
 * no searching: Satuan, Tipe akun, Metode pembayaran, PPN.
 *
 * A NATIVE-BEHAVING RADIX SELECT, deliberately, and this is the one place the
 * form layer parts company with the filter layer. docs/ui-rules.md §8 forbids a
 * `<select>` for a FILTER and requires a labelled trigger + popover, because a
 * filter is opened and closed repeatedly while someone narrows a table and its
 * long lists need in-popover search. A form field is opened once, answered, and
 * left alone. Reach for `SearchSelect` the moment the list is long enough that
 * somebody would want to type — Gudang, Pemasok, Pelanggan, Akun, Produk.
 *
 * `w-full`, because the shadcn trigger defaults to `w-fit`: right on a toolbar,
 * wrong in a form grid, where it leaves the control narrower than the inputs
 * beside it and makes the width jump with whichever option is selected.
 *
 * NO `""` OPTION. Radix refuses `<SelectItem value="">`, and an empty ROOT value
 * is how "nothing chosen yet" is spelled — that is what shows `placeholder`. If
 * a form needs an explicit "none" row, give it a real value ("tanpa-induk"), not
 * a sentinel.
 */
export interface SelectFieldOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps {
  label: string;
  /** `""` means nothing chosen — the placeholder shows. */
  value: string;
  onChange: (value: string) => void;
  options: SelectFieldOption[];
  /** Shown while `value` is `""`. Bahasa, and never a repeat of the label. */
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: ReactNode;
  /** Lands on the wrapper, so a caller can span it across a grid. */
  className?: string;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Pilih…",
  required,
  disabled,
  error,
  hint,
  className,
}: SelectFieldProps) {
  return (
    <FormField
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={className}
    >
      {(field) => (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger
            {...field}
            size="lg"
            aria-label={label}
            className={cn(
              "w-full",
              error && "border-danger focus-visible:ring-danger/40",
            )}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
