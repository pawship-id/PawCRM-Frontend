import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { FormField } from "./FormField";

/**
 * The multi-line field — Keterangan, Catatan, Alasan, Deskripsi singkat.
 *
 * WHY THIS EXISTS: there was no textarea in this codebase at all. Every "why did
 * this happen" field was a single-line `<input>`, which shows a stock clerk the
 * last forty characters of their own sentence and nothing else. A reason that
 * cannot be re-read before saving is a reason nobody writes carefully, and these
 * documents are append-only — the note is the only chance to explain the number.
 *
 * NOT `h-11`. Height is the one place a textarea must disagree with the other
 * controls: it opens at roughly four lines and grows by drag (`resize-y`), never
 * horizontally, which would break the grid it sits in.
 *
 * Per the form guideline this field is ALWAYS LAST — the closing full-width row
 * of an entity card or of a transaction header. That is a placement rule for the
 * caller, not something the component can enforce.
 */
export interface TextareaFieldProps
  extends Omit<ComponentProps<"textarea">, "id"> {
  label: string;
  error?: string;
  hint?: ReactNode;
}

export function TextareaField({
  label,
  error,
  hint,
  className,
  required,
  rows = 4,
  ...props
}: TextareaFieldProps) {
  return (
    <FormField label={label} required={required} error={error} hint={hint}>
      {(field) => (
        <textarea
          {...props}
          {...field}
          rows={rows}
          required={required}
          className={cn(
            "w-full min-h-24 resize-y rounded-md border border-border bg-surface px-3 py-2.5",
            "text-sm leading-relaxed shadow-xs transition-[color,box-shadow] outline-none",
            "placeholder:text-muted",
            // The pair from §7: navy border AND orange halo. The halo alone is
            // 2.33:1 and misses the 3:1 non-text floor.
            "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-danger focus-visible:ring-danger/40",
            className,
          )}
        />
      )}
    </FormField>
  );
}
