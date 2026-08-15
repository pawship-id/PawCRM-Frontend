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
  onApply: (range: { from: string; to: string }) => void;
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
        <div className="space-y-3 p-3.5">
          <div className="flex flex-wrap gap-1.5">
            {chips.map((preset) => {
              const picked =
                draft.from === preset.from && draft.to === preset.to;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setDraft({ from: preset.from, to: preset.to })}
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
                value={draft.from}
                max={draft.to || undefined}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, from: event.target.value }))
                }
                aria-label={`${ariaLabel ?? label} dari`}
                className="h-10 w-full rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </label>
            <label className="flex-1 space-y-1">
              <span className="block text-xs font-semibold">Sampai</span>
              <input
                type="date"
                value={draft.to}
                min={draft.from || undefined}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, to: event.target.value }))
                }
                aria-label={`${ariaLabel ?? label} sampai`}
                className="h-10 w-full rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </label>
          </div>
        </div>

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
