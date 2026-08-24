"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { FilterOptionList, type FilterOption } from "../filters";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { FIELD_HEIGHT, FIELD_SHELL, FormField } from "./FormField";

/**
 * The long select — a list somebody would want to TYPE into: Gudang, Pemasok,
 * Pelanggan, Akun, Penerimaan asal.
 *
 * The guideline calls this the same component as the filter's search-in-popover
 * trigger, and it very nearly is: the option list, its search box, its keyboard
 * cursor and its empty state are `FilterOptionList`, imported rather than
 * copied. Copy-paste instead of reuse is how fifteen toolbars happened.
 *
 * TWO THINGS DIFFER, and both are why this file exists rather than a `layout`
 * prop on `FilterSelect`:
 *
 *  1. It is FULL WIDTH with the label above it, not a `Gudang: Semua ⌄` pill
 *     whose width comes from its content. A form control has to line up with the
 *     inputs beside it in the grid.
 *  2. It shows a grey PLACEHOLDER when empty. A filter always has a value —
 *     "Semua" is a value — whereas an unanswered required field must look
 *     unanswered.
 *
 * Picking closes the popover. There is no Terapkan in here: a form field is not
 * a query, so there is nothing to batch and nothing to re-run.
 */
export type { FilterOption as SearchSelectOption };

export interface SearchSelectProps<T> {
  label: string;
  /** `null` means nothing chosen — the placeholder shows. */
  value: T | null;
  onChange: (value: T) => void;
  options: FilterOption<T>[];
  /** Bahasa, and never a repeat of the label: "Pilih gudang", not "Gudang". */
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: React.ReactNode;
  /** Lands on the wrapper, so a caller can span it across a grid. */
  className?: string;
}

export function SearchSelect<T>({
  label,
  value,
  onChange,
  options,
  placeholder = "Pilih…",
  searchPlaceholder = "Cari…",
  emptyLabel = "Tidak ditemukan",
  required,
  disabled,
  error,
  hint,
  className,
}: SearchSelectProps<T>) {
  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo(
    () =>
      value === null
        ? undefined
        : options.find((option) => Object.is(option.value, value)),
    [options, value],
  );

  return (
    <FormField
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={className}
    >
      {(field) => (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            {...field}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            disabled={disabled}
            className={cn(
              FIELD_SHELL,
              FIELD_HEIGHT,
              error && "border-danger focus-visible:ring-danger/40",
            )}
          >
            {/* The chosen label is `truncate`, not wrapped: a supplier name can
                be longer than the field, and a control that grows a second line
                pushes the whole grid row down as somebody picks. */}
            <span
              className={cn(
                "truncate",
                selected ? "text-foreground" : "text-muted",
              )}
            >
              {selected?.label ?? placeholder}
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted transition-transform",
                open && "rotate-180",
              )}
            />
          </PopoverTrigger>

          {/* Matches the trigger's width so the list reads as the field opening
              downward rather than as a menu that happened to appear near it. */}
          <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
            <FilterOptionList
              options={options}
              selected={selected ? [selected.value] : []}
              onPick={(picked) => {
                onChange(picked);
                setOpen(false);
              }}
              searchable
              searchPlaceholder={searchPlaceholder}
              searchLabel={`Cari ${label.toLowerCase()}`}
              emptyLabel={emptyLabel}
            />
          </PopoverContent>
        </Popover>
      )}
    </FormField>
  );
}
