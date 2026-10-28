"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/** The step row of the three E-commerce wizards — Upload → Tinjau → Selesai. */
export function WizardSteps({
  steps,
  current,
  label,
}: {
  steps: readonly string[];
  current: number;
  label: string;
}) {
  return (
    <ol className="flex flex-wrap gap-4 text-sm" aria-label={label}>
      {steps.map((name, index) => {
        const number = index + 1;
        const done = current > number;
        return (
          <li
            key={name}
            aria-current={current === number ? "step" : undefined}
            className={cn(
              "flex items-center gap-2",
              current === number ? "font-semibold text-foreground" : "text-muted",
            )}
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs",
                done || current === number ? "bg-primary text-primary-foreground" : "bg-tint-neutral",
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : number}
            </span>
            {name}
          </li>
        );
      })}
    </ol>
  );
}

/** A clickable count that filters a wizard's preview table. */
export function CountChip({
  label,
  value,
  selected,
  tone = "plain",
  onClick,
}: {
  label: string;
  value: string;
  selected?: boolean;
  tone?: "plain" | "warning";
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="text-xs text-muted">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "warning" && value !== "0" ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </span>
    </>
  );

  if (!onClick) {
    return <div className="flex flex-col gap-1 rounded-xl border border-border p-3">{body}</div>;
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-11 flex-col gap-1 rounded-xl border p-3 text-left transition",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        selected ? "border-primary bg-navy-100" : "border-border hover:bg-surface-hover",
      )}
    >
      {body}
    </button>
  );
}
