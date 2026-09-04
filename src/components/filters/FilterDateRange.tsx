"use client";

import * as React from "react";
import { Calendar } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatRangeShort } from "./codecs";
import { FilterField } from "./FilterField";
import { FilterTrigger } from "./FilterTrigger";

/**
 * A date range, rendered as `Tanggal: 1 Ags–14 Ags ⌄`.
 *
 * Replaces the pattern this codebase repeated five times: a group label, two
 * bare `<input type="date">`, a literal "s/d" span between them, and a
 * conditional "Reset tanggal" button beside them.
 *
 * Holds a draft and needs Terapkan, for the reason the preset chips make
 * obvious: a "Dari" with no "Sampai" is not yet a question. Presets fill both
 * inputs without applying, so a preset can still be adjusted before it counts.
 *
 * The two inputs bound each other (`max` / `min`), which was one screen's
 * private trick and is now everyone's — it pre-empts a backend 400 rather than
 * explaining one.
 *
 * Native inputs, not a calendar grid: Indonesian formatting comes free, the
 * bundle stays put, and `userEvent.type(input, "2026-08-01")` keeps working.
 *
 * INSIDE A PANEL IT LOSES ITS POPOVER ENTIRELY (`layout="field"`) — presets and
 * both inputs render straight into the stack. A popover carrying its own
 * Terapkan inside a panel carrying its own Terapkan is two pairs of verbs for
 * one decision, and the inner one commits nothing a user can see: the panel is
 * still holding the draft. There is also no draft to hold in that mode, because
 * the panel already is the draft — see `onApply` below.
 */
export interface DatePreset {
  label: string;
  from: string;
  to: string;
}

export interface FilterDateRangeProps {
  label?: string;
  /** ISO `yyyy-mm-dd`, or `""` when unset. Never null — the repo's convention. */
  from: string;
  to: string;
  /**
   * Commits a range.
   *
   * On a bar this fires on the popover's own Terapkan, once. In a PANEL it
   * fires on every edit, into the panel's draft — the panel's Terapkan is the
   * one that reaches the query, so a second commit here would be a button that
   * appears to do nothing.
   */
  onApply: (range: { from: string; to: string }) => void;
  /**
   * "inline" — a trigger on a bar, reading `Tanggal: 1 Ags–14 Ags ⌄`.
   * "field" — a labeled block inside a `FilterPanel`, popover and footer gone.
   */
  layout?: "inline" | "field";
  ariaLabel?: string;
  presets?: DatePreset[];
  disabled?: boolean;
  align?: "start" | "end";
  className?: string;
}

function iso(date: Date): string {
  // Local parts, not toISOString(): the latter is UTC and shifts the day for
  // anyone east of Greenwich, which is everyone using this.
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function defaultPresets(): DatePreset[] {
  const today = new Date();
  const back = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1));
    return iso(d);
  };
  return [
    { label: "Hari ini", from: iso(today), to: iso(today) },
    { label: "7 hari", from: back(7), to: iso(today) },
    { label: "30 hari", from: back(30), to: iso(today) },
    {
      label: "Bulan ini",
      from: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: iso(today),
    },
  ];
}

export function FilterDateRange({
  label = "Tanggal",
  from,
  to,
  onApply,
  layout = "inline",
  ariaLabel,
  presets,
  disabled,
  align = "start",
  className,
}: FilterDateRangeProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({ from, to });

  function onOpenChange(next: boolean) {
    if (next) setDraft({ from, to });
    setOpen(next);
  }

  const chips = presets ?? defaultPresets();
  const active = Boolean(from || to);

  const body = (
    value: { from: string; to: string },
    onChange: (next: { from: string; to: string }) => void,
  ) => (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((preset) => {
          const picked =
            value.from === preset.from && value.to === preset.to;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange({ from: preset.from, to: preset.to })}
              className={cn(
                "rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted transition",
                "outline-none hover:border-input-hover focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                picked && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-end gap-2">
        <label className="flex-1 space-y-1">
          <span className="block text-xs font-semibold">Dari</span>
          <input
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(event) =>
              onChange({ ...value, from: event.target.value })
            }
            aria-label={`${ariaLabel ?? label} dari`}
            className="h-10 w-full rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
        <label className="flex-1 space-y-1">
          <span className="block text-xs font-semibold">Sampai</span>
          <input
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(event) =>
              onChange({ ...value, to: event.target.value })
            }
            aria-label={`${ariaLabel ?? label} sampai`}
            className="h-10 w-full rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
      </div>
    </div>
  );

  if (layout === "field") {
    return (
      // Spans the panel's two columns: the presets alone wrap onto three lines
      // in half a modal, and the pair of inputs beneath them go narrower than
      // the date format they hold.
      <FilterField label={label} className={cn("sm:col-span-2", className)}>
        {body({ from, to }, onApply)}
      </FilterField>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <FilterTrigger
          label={label}
          value={active ? formatRangeShort(from, to) : "Semua"}
          active={active}
          disabled={disabled}
          icon={<Calendar className="size-3.5 shrink-0 text-muted" />}
          aria-label={ariaLabel ?? label}
          className={className}
        />
      </PopoverTrigger>

      <PopoverContent align={align} className="w-80 p-0">
        <div className="p-3.5">{body(draft, setDraft)}</div>

        <div className="flex items-center justify-between border-t border-border bg-background px-3 py-2.5">
          <button
            type="button"
            onClick={() => {
              setDraft({ from: "", to: "" });
              onApply({ from: "", to: "" });
              setOpen(false);
            }}
            className="rounded-sm text-sm font-semibold text-warning outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Reset
          </button>
          <Button
            size="sm"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            Terapkan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
