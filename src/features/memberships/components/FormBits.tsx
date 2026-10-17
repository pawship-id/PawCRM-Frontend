"use client";

import { useId, type ReactNode } from "react";

import { InfoTooltip } from "@/components";
import { cn } from "@/lib/utils";

/**
 * Two small pieces the plan form needs and the form layer does not have.
 *
 * FEATURE-LOCAL ON PURPOSE (ui-rules §14): nothing outside membership uses a
 * segmented choice yet. Promote them when a second feature does — do not copy.
 */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/**
 * A SEGMENTED CHOICE — two or three answers, all visible, one click each
 * ("Satu harga / Per varian hewan", "Hewan / Pelanggan"). A radiogroup to a
 * screen reader; 36 px segments inside a 4 px frame reach the 44 px floor.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-border bg-surface p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-9 rounded-md px-3 text-sm font-medium whitespace-nowrap transition outline-none",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-surface-hover",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A labelled block for a control that is not a single input — a segmented
 * choice, a table. Same label → control → hint/error stack as `FormField`,
 * plus the ⓘ beside the label for an explanation longer than a hint
 * (ui-rules §9: `InfoTooltip`, never a native `title`).
 */
export function FieldBlock({
  label,
  tooltip,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  tooltip?: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();

  return (
    <div role="group" aria-labelledby={id} className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <span id={id} className="text-sm leading-none font-medium">
          {label}
          {required && <span className="text-danger"> *</span>}
        </span>
        {tooltip && <InfoTooltip hint={tooltip} />}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
