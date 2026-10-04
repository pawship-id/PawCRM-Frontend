"use client";

import { useState } from "react";
import { ListFilter } from "lucide-react";

import {
  FilterBar,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
  withAll,
  type AppliedFilter,
  type FilterOption,
} from "@/components";
import type { JournalSourceType } from "@/types/accounting";

import type { JournalEntriesQuery } from "../hooks/useJournalEntries";
import { SOURCE_LABEL } from "../labels";

/** The source types the API accepts, in the order the model declares them. */
const SOURCES: JournalSourceType[] = [
  "pos",
  "pos_cogs",
  "invoice",
  "invoice_cogs",
  "receipt",
  "goods_receipt",
  "purchase_payment",
  "opname",
  "return",
  "return_cogs",
  "commission",
  "commission_payment",
  "expense",
  "other_income",
  "manual",
];

const SOURCE_OPTIONS: FilterOption<JournalSourceType | "">[] = withAll(
  SOURCES.map((value) => ({ value, label: SOURCE_LABEL[value] })),
  "Semua sumber",
);

/**
 * The Jurnal list's own controls: search on the row, Sumber behind one button.
 *
 * WHAT MOVED OUT, and where (mockup, 21 September 2026):
 *
 *   - Cabang and the period went UP to the context bar above the card, the one
 *     every Keuangan tab shares. They say which shop and which month the list
 *     is about; they are not a narrowing of it (§8's line between a context bar
 *     and a filter bar), and having them in both places would be two controls
 *     for one question.
 *   - Urutkan went to the COLUMN HEADERS, the mockup's arrows — the same move
 *     Kas & Bank's list made on 20 September.
 *
 * What is left is Sumber, and it stays in a panel rather than on the row so the
 * row keeps its shape when more filters come back.
 *
 * SEARCH STAYS OUTSIDE THE PANEL because it applies live and debounced; burying
 * a field that needs no Terapkan behind one that does would make it feel broken.
 */
export function JournalEntriesToolbar({
  query,
  onChange,
}: {
  query: JournalEntriesQuery;
  onChange: (patch: Partial<JournalEntriesQuery>) => void;
}) {
  const chips: AppliedFilter[] = [];

  if (query.sourceType) {
    chips.push({
      key: `source:${query.sourceType}`,
      label: `Sumber ${SOURCE_LABEL[query.sourceType]}`,
      onRemove: () => onChange({ sourceType: "" }),
    });
  }

  return (
    <FilterBar
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      chips={chips}
      onClearAll={() => onChange({ sourceType: "" })}
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          // Names what the server actually matches — see #searchTargets in
          // journalEntry.service.js. A placeholder promising a field the API
          // ignores would be a placeholder that lies.
          placeholder="Cari no. jurnal, keterangan, no. sumber, atau cabang…"
          ariaLabel="Cari entri jurnal"
          fill
        />
      }
    >
      <SourceFilterPanel applied={query.sourceType} onApply={onChange} />
    </FilterBar>
  );
}

/**
 * Sumber behind one button. It waits for Terapkan — that is what a panel is
 * (§8) — and the count on the trigger is what stops a hidden filter being
 * forgotten while somebody reads the wrong rows.
 */
function SourceFilterPanel({
  applied,
  onApply,
}: {
  applied: JournalSourceType | "";
  onApply: (patch: Partial<JournalEntriesQuery>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  const count = applied === "" ? 0 : 1;

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft.
    if (next) setDraft(applied);
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
          onApply({ sourceType: "" });
          setOpen(false);
        }}
        onApply={() => {
          onApply({ sourceType: draft });
          setOpen(false);
        }}
      >
        <FilterSelect
          layout="field"
          label="Sumber"
          ariaLabel="Filter sumber entri"
          value={draft}
          options={SOURCE_OPTIONS}
          onChange={setDraft}
        />
      </FilterPanel>
    </>
  );
}
