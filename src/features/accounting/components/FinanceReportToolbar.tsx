"use client";

import * as React from "react";

import {
  Button,
  FilterChips,
  FilterDateRange,
  FilterPills,
  FilterSelect,
  formatRangeShort,
  namedOptions,
  withAll,
  type AppliedFilter,
  type DatePreset,
} from "@/components";

import { cn } from "@/lib/utils";

import {
  SHARED_LINE_LABEL,
  SHARED_LINE_NONE,
  type FinanceQuery,
} from "../financeSummary";

/**
 * The named thing a filter picks from — all these controls read off a lookup.
 *
 * `{ _id, name }` RATHER THAN `Branch` AND `BusinessLine`, which is what this
 * asked for while the dashboard was its only caller. A `Branch` carries an
 * address, a location and three timestamps, none of which a dropdown looks at;
 * demanding the whole document means a caller with a shorter list — the report
 * screens' fixtures, a test — has to fabricate nine fields to fill a select.
 * Real API documents still satisfy this structurally.
 */
interface NamedOption {
  _id: string;
  name: string;
}

/**
 * Cabang, Lini Usaha, Periode — the controls every Keuangan report shares.
 *
 * THREE SCREENS, ONE BAR: the dashboard, Laba Rugi and Arus Kas. They are read
 * one after another by the same person in the same sitting, and a filter row
 * that moved or renamed itself between them would be three toolbars to learn.
 * This is also why it is one component rather than three copies — §14, and the
 * fifteen hand-rolled toolbars that rule exists because of.
 *
 * A CONTEXT BAR, NOT A `FilterBar` — the mockup's shape, adopted 16 Sep 2026 on
 * request. The difference is what these filters ARE: they do not narrow a list
 * on the page, they say which shop and which period every figure below is
 * about. So they sit on a card of their own, each named by a caption beside it
 * with a rule between the groups, rather than as a row of `Label: Value ⌄`
 * pills above a table. Same controls underneath — `FilterSelect` with its
 * searchable popover, `FilterDateRange` for the two date boxes — wearing
 * `layout="bar"`, which is that same trigger with the name drawn outside it.
 *
 * PERIODE IS A PILL ROW (§8): one dimension, small cardinality, the page's main
 * lens, and it applies ON CLICK with no Terapkan. That is the one arrangement
 * §8 allows to live outside the bar's normal grammar, and a period is what it
 * describes — the control somebody reaches for first.
 *
 * "CUSTOM" IS A PILL TOO, AND IT IS THE ONE THAT DOES NOT ANSWER ON CLICK. It
 * is one more answer to "which period", so it wears the shape of the others;
 * what it does is REVEAL two date boxes under the row, and those keep the
 * Reset/Terapkan §8 gives every range — an arbitrary range is two decisions, and
 * applying it half-made re-queries on the first date somebody picks. A popover
 * would have been a second thing to open behind a button that is already a
 * disclosure.
 *
 * "SEMUA" LEADS THE PILLS, where the mockup starts at "Hari Ini". These screens
 * open unfiltered on purpose — on a tenant whose ledger starts in June, a
 * default of "this month" shows an empty August that reads as "no data" rather
 * than as "no data *this month*" — so the state they open in has to be one the
 * control can show and get back to.
 *
 * A BAR AND NOT A PANEL (§8): at most three fields, all single-select, each
 * applying on its own terms. The mockup had lini bisnis as a multi-select, which
 * would have forced a panel — but the API filters one line at a time, and an
 * unfiltered read already returns every line, so "compare the lines" is answered
 * by reading the result rather than by selecting several. On Laba Rugi that is
 * literal: unfiltered, every line is a column.
 *
 * The options come from `/branches` and `/business-lines`. Both may be empty
 * when the user cannot read them, and an empty list renders as a select holding
 * only "Semua" — which is honest: they are not filtering, because they cannot.
 */
export function FinanceReportToolbar({
  query,
  branches,
  businessLines,
  presets,
  disabled,
  onChange,
}: {
  query: FinanceQuery;
  branches: NamedOption[];
  /**
   * Omitted by a report with no business-line dimension — Arus Kas is the one,
   * because a rupiah in the bank belongs to the shop rather than to grooming or
   * retail. Absent rather than disabled: a control that cannot narrow anything
   * is worse than one that is not there, because somebody eventually reaches
   * for it.
   */
  businessLines?: NamedOption[];
  presets: DatePreset[];
  /** True while the figures are in flight — the controls stay readable, not live. */
  disabled?: boolean;
  onChange: (patch: Partial<FinanceQuery>) => void;
}) {
  const branchOptions = withAll(namedOptions(branches), "Semua cabang");

  const lineOptions = withAll(
    [
      ...namedOptions(businessLines ?? []),
      // The unattributed bucket is a real answer, not an absence: rent, gaji
      // kantor and listrik live there. It is filterable because "how much have
      // we not yet charged to a line" is a question somebody asks.
      { value: SHARED_LINE_NONE, label: SHARED_LINE_LABEL },
    ],
    "Semua lini bisnis",
  );

  /*
    THE PILLS ARE THE PRESETS, BY NAME. Taking the three the mockup draws out of
    the shared list rather than writing their dates again is what keeps a pill
    and the identically-named chip inside the Custom popover from drifting into
    two different weeks.
  */
  const pillPresets = PILL_PRESETS.map((label) =>
    presets.find((preset) => preset.label === label),
  ).filter((preset): preset is DatePreset => Boolean(preset));

  const current = pillPresets.find(
    (preset) => preset.from === query.dateFrom && preset.to === query.dateTo,
  );
  const custom = Boolean(query.dateFrom || query.dateTo) && !current;

  /*
    OPEN BECAUSE SOMEBODY PRESSED CUSTOM, or because a custom range is already
    on — a range reached by a deep link or left behind by the last visit would
    otherwise light a pill whose inputs are nowhere to be seen.

    `useState` rather than derived, because the pill has to survive being
    pressed with no dates in it yet: that is the whole gesture.
  */
  const [customOpen, setCustomOpen] = React.useState(custom);
  const open = customOpen || custom;

  /*
    THE DRAFT THE INPUTS EDIT, seeded from whatever is applied.

    Keyed on the applied range so it re-seeds when the query changes underneath
    — picking "Bulan ini" and then reopening Custom should show that month, not
    the range from two edits ago. `key` on the state rather than an effect: this
    is state derived from a prop, which React re-initialises by identity.
  */
  const [draft, setDraft] = React.useState({
    from: query.dateFrom,
    to: query.dateTo,
  });
  const seed = `${query.dateFrom}|${query.dateTo}`;
  const [seeded, setSeeded] = React.useState(seed);
  if (seeded !== seed) {
    setSeeded(seed);
    setDraft({ from: query.dateFrom, to: query.dateTo });
  }

  /*
    "" IS SEMUA, AND A CUSTOM RANGE IS NOT IT. Falling back to "" for a range
    that matches no preset would light the "Semua" pill — announcing an
    unfiltered screen while the figures below are filtered to a range the pills
    cannot show.
  */
  const pillValue = open
    ? CUSTOM_PERIOD
    : !(query.dateFrom || query.dateTo)
      ? ""
      : (current?.label ?? CUSTOM_PERIOD);

  const chips: AppliedFilter[] = [];

  /*
    ONLY A CUSTOM RANGE GETS A CHIP. A chip pays back what a control CONCEALS
    (§8), and a lit pill conceals nothing — it is the period, in words, already
    on the row. The range behind "Custom" is the one choice the bar cannot show
    in full, so it is the one that says so and offers a way off.
  */
  if (custom) {
    chips.push({
      key: "period",
      // One chip for the range, not one per bound: an open-ended range is still
      // one question somebody asked, and `formatRangeShort` already says which
      // end is missing ("sejak 1 Ags").
      label: `Periode ${formatRangeShort(query.dateFrom, query.dateTo)}`,
      onRemove: () => onChange({ dateFrom: "", dateTo: "" }),
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-5 py-4 shadow-sm">
      {/*
        STACKED BELOW `lg`, ONE ROW WITH RULES ABOVE IT — and the breakpoint is
        what makes the rules safe. A wrapping flex row strands its last divider
        at the end of a line, pointing at nothing; here the row never wraps
        (`flex-nowrap`), because the only group that can grow is Periode and its
        pills wrap INSIDE it. Narrower than that, the groups stack and the rules
        go with them: a vertical stroke between two stacked rows separates
        nothing.
      */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:gap-0 lg:divide-x lg:divide-border">
        <Group label="Cabang" className="lg:pr-4">
          <FilterSelect
            label="Cabang"
            layout="bar"
            ariaLabel="Filter cabang"
            value={query.branchId}
            options={branchOptions}
            disabled={disabled}
            onChange={(branchId) => onChange({ branchId })}
          />
        </Group>

        {businessLines && (
          <Group label="Lini Usaha" className="lg:px-4">
            <FilterSelect
              label="Lini bisnis"
              layout="bar"
              ariaLabel="Filter lini bisnis"
              value={query.businessLineId}
              options={lineOptions}
              disabled={disabled}
              onChange={(businessLineId) => onChange({ businessLineId })}
            />
          </Group>
        )}

        {/* The one group allowed to grow, so the row above it never has to. */}
        <Group label="Periode" className="lg:min-w-0 lg:flex-1 lg:pl-4">
          <FilterPills
            ariaLabel="Periode laporan"
            value={pillValue}
            options={[
              { value: "", label: "Semua" },
              ...pillPresets.map((preset) => ({
                value: preset.label,
                label: preset.label,
              })),
              // LAST, AND A PILL LIKE THE REST — it is one more answer to
              // "which period", so it wears the shape of the others. What it
              // does differently is open the two inputs below rather than
              // answer on the spot.
              { value: CUSTOM_PERIOD, label: "Custom" },
            ]}
            onChange={(picked) => {
              if (picked === CUSTOM_PERIOD) {
                setCustomOpen(true);
                // NOTHING IS APPLIED YET. Pressing Custom asks a question; the
                // answer is the range, and until both ends are in, re-querying
                // would move the figures for a choice nobody finished making.
                return;
              }

              setCustomOpen(false);
              const preset = pillPresets.find((item) => item.label === picked);
              onChange(
                preset
                  ? { dateFrom: preset.from, dateTo: preset.to }
                  : { dateFrom: "", dateTo: "" },
              );
            }}
          />
        </Group>
      </div>

      {/*
        THE TWO INPUTS, REVEALED BY THE PILL. `presets={[]}` drops the chip row
        the control would otherwise draw inside itself — the pills above already
        offer the named periods, and a second set under them would be the same
        question asked twice in two shapes.

        `layout="field"` is the mode with no popover of its own, which is the
        point: the disclosure is the pill, so a popover here would be a second
        thing to open. It reports every edit, so the edits land in a DRAFT and
        the query waits for Terapkan — a range is two decisions, and applying it
        half-made re-queries on the first date somebody picks.
      */}
      {open && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <FilterDateRange
            label="Rentang khusus"
            layout="field"
            presets={[]}
            from={draft.from}
            to={draft.to}
            ariaLabel="Periode khusus"
            onApply={setDraft}
            // Two date boxes, not a stripe across the card. `sm:col-span-1`
            // undoes the span the control assumes for a two-column panel.
            className="w-full max-w-md sm:col-span-1"
          />
          <div className="flex gap-2">
            {/*
              RESET / TERAPKAN, the pair every other range in this app carries —
              and in that order, matching the popover this replaced. "Batal"
              would be the wrong verb for the left one: after a range is applied
              it does not undo an edit, it clears the filter.
            */}
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDraft({ from: "", to: "" });
                setCustomOpen(false);
                // Reset clears and re-queries in the SAME CLICK (§8) — it never
                // waits for Terapkan. Only worth firing when a range is
                // actually on; otherwise this is just "close".
                if (query.dateFrom || query.dateTo) {
                  onChange({ dateFrom: "", dateTo: "" });
                }
              }}
            >
              Reset
            </Button>
            <Button
              type="button"
              disabled={disabled || !(draft.from || draft.to)}
              onClick={() => {
                onChange({ dateFrom: draft.from, dateTo: draft.to });
                setCustomOpen(false);
              }}
            >
              Terapkan
            </Button>
          </div>
        </div>
      )}

      {chips.length > 0 && (
        <FilterChips
          items={chips}
          onClearAll={() => {
            setCustomOpen(false);
            onChange({ dateFrom: "", dateTo: "" });
          }}
        />
      )}
    </div>
  );
}

/** The three the mockup draws, in its order. Resolved against `presets`. */
const PILL_PRESETS = ["Hari ini", "Minggu ini", "Bulan ini"];

/** A pill value no pill has — "a range is set, and none of these is it". */
const CUSTOM_PERIOD = "__custom__";

/**
 * A caption and the control it names, side by side.
 *
 * The caption is presentational — every control below carries its own
 * `ariaLabel`, so a screen reader hears the name from the control itself and
 * this text is not a second, competing label for it.
 */
function Group({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}
    >
      <span className="shrink-0 text-sm font-semibold text-muted">{label}</span>
      {children}
    </div>
  );
}
