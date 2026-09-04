"use client";

import { cn } from "@/lib/utils";

/**
 * The page's main lens, as a row of pills: status, urgensi, tipe.
 *
 * Lives outside the bar and always applies on click. A pill row earns its space
 * over a dropdown only when the dimension is the one people reach for first and
 * the options are few — and when it can show counts, which is the thing a
 * dropdown cannot do.
 *
 * `tone: "danger"` exists for the one lens that carries urgency (overdue
 * invoices); it is presentation metadata on the option, not a filter concept.
 */
export interface PillOption<T> {
  value: T;
  label: string;
  count?: number;
  tone?: "default" | "danger";
}

export interface FilterPillsProps<T> {
  value: T;
  options: PillOption<T>[];
  onChange: (value: T) => void;
  /** Announced on the group wrapper. */
  ariaLabel: string;
  className?: string;
}

export function FilterPills<T>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: FilterPillsProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {options.map((option) => {
        const selected = Object.is(option.value, value);
        const danger = option.tone === "danger";

        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border-[1.5px] px-4 text-sm font-semibold transition",
              "outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selected
                ? danger
                  ? "border-danger bg-danger text-danger-foreground"
                  : "border-primary bg-primary text-primary-foreground"
                : danger
                  ? "border-border bg-surface text-danger hover:border-input-hover"
                  : "border-border bg-surface text-muted hover:border-input-hover",
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs",
                  selected
                    ? "bg-white/25"
                    : danger
                      ? "bg-tint-danger text-danger"
                      : "bg-navy-100 text-primary",
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
