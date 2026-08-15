"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A filter laid out vertically: its name above, the control full width below.
 *
 * The panel counterpart to the bar's `Label: Value ⌄` trigger. Same controls in
 * both places — see `FilterSelect`'s `layout` prop; only the wrapper changes.
 *
 * `htmlFor` IS OPTIONAL AND USUALLY ABSENT: most filter controls here are a
 * button that opens a popover, and a `<label for>` pointing at a button is not
 * something a browser does anything useful with. Those render a plain span and
 * carry their own `aria-label`. Pass `htmlFor` only for a real form control.
 */
export interface FilterFieldProps {
  label: string;
  /** The id of a real `<input>`/`<select>`, when the control is one. */
  htmlFor?: string;
  children: ReactNode;
  /** Explanatory line under the control. */
  hint?: ReactNode;
  className?: string;
}

export function FilterField({
  label,
  htmlFor,
  children,
  hint,
  className,
}: FilterFieldProps) {
  const caption = "mb-1.5 block text-xs font-semibold text-foreground";

  return (
    <div className={cn("min-w-0", className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={caption}>
          {label}
        </label>
      ) : (
        <span className={caption}>{label}</span>
      )}
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
