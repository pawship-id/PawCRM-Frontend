"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, Store } from "lucide-react";

import { Button } from "@/components/ui/button";

import { withAll } from "./filters/codecs";
import { FilterDateRange } from "./filters/FilterDateRange";
import { FilterPills, type PillOption } from "./filters/FilterPills";
import { FilterSelect } from "./filters/FilterSelect";

/**
 * The windows a summary tab can be read over.
 *
 *   all    — every date; nothing about a period is sent.
 *   today / week / month — a period the SERVER resolves by name, in the tenant's
 *            timezone.
 *   custom — two dates somebody typed. With neither typed it also means every
 *            date, an honest reading of a range nobody has bounded yet.
 */
export type ScopePeriod = "all" | "today" | "week" | "month" | "custom";

/**
 * The chips, in the order the windows grow.
 *
 * "Semua" LEADS THEM: a tab opens on Bulan ini, and somebody widening from a
 * month reads left to right past the narrower windows to reach it. Putting the
 * widest first is what makes the row read as a scale rather than as five
 * unrelated buttons. "Custom" is last, because it is the only one that reveals a
 * second control.
 */
const PERIODS: PillOption<ScopePeriod>[] = [
  { value: "all", label: "Semua" },
  { value: "today", label: "Hari ini" },
  { value: "week", label: "Minggu ini" },
  { value: "month", label: "Bulan ini" },
  { value: "custom", label: "Custom" },
];

/**
 * THE SHELL both scope rows wear: one bordered strip, its fields divided by a
 * hairline, and an optional row beneath for whatever the last field reveals.
 *
 * EXTRACTED WHEN INVENTORI ASKED FOR THE SAME ROW with different fields (29
 * September 2026). It holds geometry and nothing else — which fields go in it,
 * and what they mean, stays with the screen that knows.
 */
export function ScopeCard({
  children,
  below,
}: {
  children: ReactNode;
  /** Revealed under the divider — the custom range, today. */
  below?: ReactNode;
}) {
  return (
    <section
      aria-label="Lingkup data"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-5 py-3.5 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {children}
      </div>
      {below}
    </section>
  );
}

/**
 * One labelled control in a `ScopeCard` — icon, caption, then the control.
 *
 * THE HAIRLINE BELONGS TO THE FIELD, not to the row: `first:` drops it from the
 * leading one, so a card of two fields and a card of three are the same markup.
 */
export function ScopeField({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:border-l sm:border-border sm:pl-6 sm:first:border-l-0 sm:first:pl-0">
      <span aria-hidden className="text-primary">
        {icon}
      </span>
      <span className="text-sm text-muted">{label}</span>
      {children}
    </div>
  );
}

export interface ScopePeriodCardProps {
  /** The cabang this tab is scoped to; `""` is every one of them. */
  branchId: string;
  /** Only the branches that make sense for the screen — its own list, not every branch. */
  branches: Array<{ _id: string; name: string }>;
  onBranchChange: (branchId: string) => void;
  period: ScopePeriod;
  onPeriodChange: (period: ScopePeriod) => void;
  /** `yyyy-mm-dd`, read only under `custom`. */
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (range: { from: string; to: string }) => void;
  /**
   * What the dates BOUND, in the screen's own words — "Tanggal bayar", "Tanggal
   * faktur". It reaches the inputs' accessible names, so a reader hears which of
   * a module's several dates this one is.
   */
  dateLabel: string;
}

/**
 * The scope row a summary tab wears: which cabang, which period — and, unlike
 * the read-only card it replaced, the controls themselves.
 *
 * PROMOTED FROM `features/purchasing` (29 September 2026) when Penjualan ›
 * Ringkasan was asked for the same row. Both tabs answer "what did this period
 * look like" over one shop's books, both are read by the same person in one
 * sitting, and a second copy would have drifted first on the part that is
 * subtle — the draft the custom range holds.
 *
 * NO `Filter` BUTTON, which is the whole point of the shape. A panel exists to
 * stop a table re-querying while somebody composes a query (ui-rules §8); a
 * summary tab has no table, these controls apply on click, and they fit on one
 * line. A button here would cost a click and a modal to change what the row can
 * show outright — and with nothing concealed there is no `Filter (n)` badge to
 * pay anybody back and nothing for a Reset to put back.
 *
 * THE PILL ROW CARRIES A VISIBLE CAPTION, which is the condition §8's Transaksi
 * exception attaches to using one at all: `FilterPills` names itself only to a
 * screen reader, and an unlabelled row of five is a filter somebody cannot find.
 *
 * IT DRAWS NO EXPLANATORY LINE (29 September 2026, on request). Both callers had
 * one saying which figures each control reached — that the cabang scoped
 * everything while the period touched only some of it. Where that distinction
 * still has to be made, it belongs on the figure it is about (a card's own
 * caption), not on a filter row somebody reads once and then scrolls past.
 */
export function ScopePeriodCard({
  branchId,
  branches,
  onBranchChange,
  period,
  onPeriodChange,
  dateFrom,
  dateTo,
  onDateRangeChange,
  dateLabel,
}: ScopePeriodCardProps) {
  return (
    <ScopeCard
      below={
        /*
          THE TWO DATES APPEAR ONLY UNDER "Custom", on a row of their own. Inline
          beside five pills they would wrap into a block that reads as several
          controls rather than as one lens.
        */
        period === "custom" ? (
          <CustomRange
            /*
              KEYED ON THE APPLIED RANGE, which is how the draft is re-seeded
              when it changes from outside — Reset, or coming back to Custom
              after another chip. React remounts on a new key; an effect writing
              state would be the same thing said worse (and is banned by
              react-hooks/set-state-in-effect).
            */
            key={`${dateFrom}|${dateTo}`}
            from={dateFrom}
            to={dateTo}
            label={dateLabel}
            onApply={onDateRangeChange}
          />
        ) : undefined
      }
    >
      <ScopeField icon={<Store className="size-4" />} label="Cabang">
        {/*
          `layout="bar"` draws the VALUE alone, so the caption beside it is the
          one label — the arrangement the list footer's page size uses. The
          trigger stays plain rather than navy: picking a cabang here is the
          page's own scope, not a filter applied on top of one.
        */}
        <FilterSelect
          layout="bar"
          label="Cabang"
          ariaLabel="Cabang"
          value={branchId}
          options={withAll(
            branches.map((branch) => ({
              value: branch._id,
              label: branch.name,
            })),
            "Semua cabang",
          )}
          onChange={onBranchChange}
          active={false}
        />
      </ScopeField>

      <ScopeField icon={<CalendarDays className="size-4" />} label="Periode">
        <FilterPills
          ariaLabel="Periode"
          value={period}
          options={PERIODS}
          onChange={onPeriodChange}
        />
      </ScopeField>
    </ScopeCard>
  );
}

/**
 * The two dates the "Custom" chip reveals — open in the card, not behind a
 * trigger.
 *
 * WHY NOT THE POPOVER FORM. That one is for a bar, where a range has to share a
 * line with five other controls; here the chip has already declared that a range
 * is being typed, and a second click to open a box that says "Dari / Sampai"
 * again is a step that answers nothing.
 *
 * IT KEEPS ITS OWN DRAFT AND ITS OWN TERAPKAN, which is the one thing a bare
 * `layout="field"` would have lost. That form applies on every keystroke, and a
 * date input reports a half-typed year as a real value — "0002-09-01" would go
 * over the wire and come back with an empty month before anybody finished
 * typing. A range is composed before it is meant (ui-rules §8).
 *
 * NO PRESET CHIPS INSIDE IT. The period row above IS the preset list — a second
 * set of shortcuts under it would be two controls for one question, and a preset
 * picked here would leave "Custom" lit over what is really "Bulan ini".
 *
 * RESET CLEARS AND APPLIES IN ONE CLICK, the rule §8 carves out for it, and
 * leaves the chip on Custom: it empties the range, it does not undo the choice to
 * type one.
 */
function CustomRange({
  from,
  to,
  label,
  onApply,
}: {
  from: string;
  to: string;
  label: string;
  onApply: (range: { from: string; to: string }) => void;
}) {
  const [draft, setDraft] = useState({ from, to });

  const dirty = draft.from !== from || draft.to !== to;

  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <FilterDateRange
        layout="field"
        label="Rentang khusus"
        ariaLabel={label}
        from={draft.from}
        to={draft.to}
        /* In this layout the component reports every edit; the draft is ours and
           `onApply` below is what reaches the query. */
        onApply={setDraft}
        presets={[]}
        /*
          SIZED TO THE DATES, not to the card. `flex-1` here stretched the two
          inputs across a 1400px screen, which reads as a form rather than as the
          pair of short fields the mockup draws; `dd/mm/yyyy` needs about 200px.
          The buttons then sit beside them instead of a screen away.
        */
        className="w-full max-w-[26rem] sm:col-span-1"
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setDraft({ from: "", to: "" });
          onApply({ from: "", to: "" });
        }}
        disabled={!from && !to && !dirty}
      >
        Reset
      </Button>
      <Button
        type="button"
        onClick={() => onApply(draft)}
        /* Nothing to apply is not a click worth allowing — it would re-query for
           the answer already on screen. */
        disabled={!dirty}
      >
        Terapkan
      </Button>
    </div>
  );
}
