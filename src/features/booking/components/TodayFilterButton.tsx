"use client";

import { useState } from "react";
import { ListFilter } from "lucide-react";

import { FilterCheckList, FilterPanel, FilterTrigger } from "@/components";

import {
  countTodayFilters,
  DEFAULT_TODAY_FILTERS,
  type TodayFilters,
  type TodayRow,
} from "../today";

/**
 * Hari Ini's Filter — the mockup's two fields, behind one button.
 *
 * A PANEL, BY §8: both fields are multi-selects, so both wait for Terapkan
 * rather than redrawing three views on the way to "Grooming, Sinta".
 *
 * ─── THE OPTIONS ARE READ OFF WHAT IS LOADED ───────────────────────────────
 *
 * Not off the catalogue and not off the staff register. A line of business with
 * nothing booked this month, or a groomer with nothing on them, would be an
 * option whose only possible result is an empty screen. The range somebody is
 * looking at is the list of answers that can come back.
 *
 * WHICH IS WHY THE PANEL SAYS SO when a filter is set on something that has
 * since left the range — the field would otherwise silently drop the tick.
 */
export function TodayFilterButton({
  rows,
  filters,
  onChange,
}: {
  /** Everything loaded for the visible range — where the options come from. */
  rows: TodayRow[];
  filters: TodayFilters;
  onChange: (filters: TodayFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);

  const lines = [...new Set(rows.map((row) => row.line))].sort((a, b) =>
    a.localeCompare(b, "id-ID"),
  );

  const groomers = new Map<string, string>();
  for (const row of rows) {
    for (const who of row.groomers) groomers.set(who._id, who.name);
  }

  const count = countTodayFilters(filters);

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft.
    if (next) setDraft(filters);
    setOpen(next);
  }

  return (
    <>
      <FilterTrigger
        label={count === 0 ? "Filter" : `Filter (${count})`}
        active={count > 0}
        icon={<ListFilter className="size-4" />}
        aria-label="Filter"
        onClick={() => onOpenChange(true)}
      />

      <FilterPanel
        open={open}
        onOpenChange={onOpenChange}
        onReset={() => {
          onChange(DEFAULT_TODAY_FILTERS);
          setOpen(false);
        }}
        onApply={() => {
          onChange(draft);
          setOpen(false);
        }}
      >
        <FilterCheckList
          label="Layanan"
          options={lines.map((line) => ({ value: line, label: line }))}
          values={draft.lines}
          onChange={(next) => setDraft((prev) => ({ ...prev, lines: next }))}
          empty="Belum ada booking pada rentang ini."
        />
        <FilterCheckList
          label="PIC — groomer yang ada pekerjaannya"
          options={[...groomers.entries()].map(([id, name]) => ({
            value: id,
            label: name,
          }))}
          values={draft.groomerIds}
          onChange={(next) =>
            setDraft((prev) => ({ ...prev, groomerIds: next }))
          }
          empty="Belum ada tahapan yang sudah ada groomernya."
        />
      </FilterPanel>
    </>
  );
}
