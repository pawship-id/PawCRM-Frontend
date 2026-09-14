"use client";

import { useId, type ReactNode } from "react";

import { FIELD_HEIGHT, FormField } from "@/components";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * The three controls the Pengaturan cards are built from.
 *
 * KEPT IN THIS FEATURE (§14). Radio cards and a unit-suffixed box exist nowhere
 * else yet; they are promoted the day a second settings screen wants them.
 */

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

/**
 * A choice between two or three ways of doing one thing, drawn as cards.
 *
 * CARDS, NOT A SELECT: the options are the decision the card exists for, and a
 * closed select hides the one sentence that tells them apart.
 */
export function ChoiceCards<T extends string>({
  legend,
  value,
  options,
  onChange,
  disabled = false,
}: {
  legend: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-2">
      <p id={`${id}-legend`} className="text-sm font-medium text-foreground">
        {legend}
      </p>
      <RadioGroup
        aria-labelledby={`${id}-legend`}
        value={value}
        onValueChange={(next) => onChange(next as T)}
        disabled={disabled}
        className="grid gap-3 sm:grid-cols-2"
      >
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <label
              key={option.value}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 transition",
                selected
                  ? "border-primary bg-surface-selected"
                  : "border-border bg-surface",
                disabled
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer hover:border-primary",
              )}
            >
              <RadioGroupItem
                value={option.value}
                className="mt-0.5 focus-visible:border-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  {option.label}
                </span>
                {option.description && (
                  <span className="mt-0.5 block text-xs text-muted">
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}

/**
 * A number box with its unit written beside it — "Rp [ 25000 ] per add-on".
 *
 * THE UNIT IS OUTSIDE THE BOX, not a placeholder: a placeholder disappears the
 * moment somebody types, which is exactly when "is this per cent or rupiah?"
 * gets asked.
 */
export function UnitField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  error,
  invalid = false,
  describedBy,
  disabled = false,
  inputMode = "numeric",
  className,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  prefix?: string;
  suffix?: string;
  hint?: ReactNode;
  error?: string;
  /**
   * Not yet valid, WITHOUT a sentence of its own and WITHOUT the red border —
   * for a row of boxes that share one quiet note below them (the per-size
   * nominals, decided 14 September 2026 on request: default colours, no red).
   *
   * NOT EVEN `aria-invalid`: the vendored `ui/input` paints a red border and
   * ring on that attribute, so setting it brought back exactly the red the shop
   * asked to remove. The box is tied to the note by `describedBy` instead, so a
   * screen reader still hears the rule.
   */
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  inputMode?: "numeric" | "decimal";
  className?: string;
}) {
  return (
    <FormField label={label} hint={hint} error={error} className={className}>
      {(field) => (
        <div className="flex items-center gap-2">
          {prefix && <span className="text-sm text-muted">{prefix}</span>}
          <Input
            {...field}
            aria-describedby={field["aria-describedby"] ?? (invalid ? describedBy : undefined)}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            inputMode={inputMode}
            disabled={disabled}
            className={cn(
              FIELD_HEIGHT,
              "w-36 text-right tabular-nums",
              error && "border-danger focus-visible:ring-danger/40",
            )}
          />
          {suffix && <span className="text-sm text-muted">{suffix}</span>}
        </div>
      )}
    </FormField>
  );
}

/** A switch with its label and consequence to the left, like the service form's. */
export function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="mt-1 max-w-prose text-xs text-muted">{hint}</p>}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}

/** A thin bar for one groomer's day. The figures beside it carry the meaning. */
export function LoadBar({
  percent,
  tone,
  onDark = false,
}: {
  percent: number;
  tone: "normal" | "high" | "over";
  /** Drawn inside the navy panel, where navy on navy would vanish. */
  onDark?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "h-2 w-full overflow-hidden rounded-full",
        onDark ? "bg-primary-foreground/20" : "bg-tint-neutral",
      )}
    >
      <div
        className={cn(
          "h-full rounded-full",
          tone === "over"
            ? "bg-danger"
            : tone === "high"
              ? "bg-secondary"
              : onDark
                ? "bg-primary-foreground"
                : "bg-primary",
        )}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}
