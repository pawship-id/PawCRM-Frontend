"use client";

import { useState } from "react";
import { Download, ListFilter } from "lucide-react";

import {
  FilterBar,
  FilterDateRange,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
  withAll,
  type FilterOption,
} from "@/components";
import { Button } from "@/components/ui/button";
import type { MovementSort, MovementType } from "@/types/inventory";

import type { StockCardFilters as Filters } from "../hooks/useStockCard";

/**
 * The ledger's controls: one row — search, one Filter button and the export —
 * with the ordering, the movement type and the date range inside a panel.
 *
 * Purely presentational — it renders the current filters and reports changes up
 * to the screen, which owns them.
 *
 * THE WAREHOUSE AND PRODUCT PICKERS ARE NOT HERE, deliberately. They live in
 * WarehouseProductPicker on the screen above, because they are required INPUTS
 * rather than filters — nothing loads until both are chosen, which is why every
 * control here takes `disabled` until they are.
 *
 * NO FILTER COSTS THE BALANCE COLUMN. Narrowing by type or by date hides rows
 * newer than the ones on screen, which broke the balance back when the frontend
 * reconstructed it by walking backwards from the current stock level. The server
 * now sums over the rows it hides too (PawCRM-Backend 0.20.0).
 *
 * EXPORT SITS ON THE ROW BECAUSE IT OBEYS THE FILTERS. The downloaded file is
 * exactly the rows on screen — every page of them, not just this one — and
 * putting the button anywhere else would invite the assumption that it dumps
 * everything.
 *
 * THERE IS NO "MUAT ULANG". It was a button asking the screen to re-fetch what
 * it already re-fetches on every filter change, and a ledger nobody else can
 * write to while you read it does not go stale in the seconds it takes to look
 * at it.
 */
const MOVEMENT_FILTERS: FilterOption<MovementType | "">[] = [
  { value: "receipt", label: "Penerimaan" },
  { value: "pos_sale", label: "Penjualan" },
  { value: "adjustment", label: "Penyesuaian" },
  { value: "opname_diff", label: "Selisih opname" },
  { value: "transfer_in", label: "Transfer masuk" },
  { value: "transfer_out", label: "Transfer keluar" },
  { value: "customer_return", label: "Retur customer" },
  { value: "purchase_return", label: "Retur supplier" },
  { value: "bundle_consume", label: "Bundle consume" },
];

const TYPES = withAll(MOVEMENT_FILTERS, "Semua tipe");

/**
 * The orderings the API accepts — MOVEMENT_SORTS in stockMovement.model.js.
 *
 * TWO, AND BOTH CHRONOLOGICAL. A stock card carries a running balance, and
 * "saldo awal, plus setiap baris, sama dengan saldo terakhir" is the one
 * arithmetic a reader checks. Ordered by quantity or by type that sentence stops
 * being true while every number in it stays right — so there is nothing else
 * here to offer, and the API refuses anything else anyway.
 */
const SORTS: FilterOption<MovementSort>[] = [
  { value: "newest", label: "Terbaru dulu" },
  { value: "oldest", label: "Terlama dulu" },
];

/** Everything the panel edits, as one draft. */
interface PanelFilters {
  movementType: MovementType | "";
  from: string;
  to: string;
  sort: MovementSort;
}

/**
 * What Reset returns to — the query's own defaults, not "empty".
 *
 * The ordering is included: a ledger with no ordering is not a thing, so Reset
 * puts it back to newest-first rather than clearing it to nothing.
 */
const CLEARED: PanelFilters = {
  movementType: "",
  from: "",
  to: "",
  sort: "newest",
};

export function StockCardFilters({
  filters,
  disabled,
  exporting,
  onChange,
  onExport,
}: {
  filters: Filters;
  disabled: boolean;
  exporting: boolean;
  onChange: (patch: Partial<Filters>) => void;
  onExport: () => void;
}) {
  const applied: PanelFilters = {
    movementType: filters.movementType,
    from: filters.from,
    to: filters.to,
    sort: filters.sort,
  };

  /**
   * Commits the draft, sending only what actually moved — the ledger is
   * re-fetched on any change to the filter object, so posting every field back
   * would re-query after a Terapkan that changed nothing.
   */
  function apply(next: PanelFilters) {
    const patch: Partial<Filters> = {};
    if (next.movementType !== filters.movementType)
      patch.movementType = next.movementType;
    if (next.from !== filters.from) patch.from = next.from;
    if (next.to !== filters.to) patch.to = next.to;
    if (next.sort !== filters.sort) patch.sort = next.sort;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <FilterBar
      // Search leads the row and takes what is left of it: with the filters
      // behind one button there is nothing else on the line that grows.
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      // Below sm the row cannot hold all three, so the export takes a line of
      // its own — and takes all of it.
      actionsClassName="max-sm:w-full"
      search={
        <FilterSearch
          value={filters.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari catatan atau kode batch…"
          ariaLabel="Cari pergerakan"
          disabled={disabled}
          fill
        />
      }
      hint={
        <>
          Export mengikuti filter di atas dan berisi <b>seluruh</b> pergerakan
          yang cocok — bukan hanya halaman yang sedang tampil.
        </>
      }
      actions={
        <Button
          onClick={onExport}
          disabled={disabled || exporting}
          className="w-full"
        >
          <Download />
          {exporting ? "Menyiapkan…" : "Export .xlsx"}
        </Button>
      }
    >
      <LedgerFilterPanel
        applied={applied}
        disabled={disabled}
        onApply={apply}
      />
    </FilterBar>
  );
}

/**
 * The ordering, the movement type and the date range, behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8), and it is why the
 * date range renders as a field here rather than as its own popover: two pairs
 * of Reset/Terapkan for one decision is a second commit that appears to do
 * nothing.
 */
function LedgerFilterPanel({
  applied,
  disabled,
  onApply,
}: {
  applied: PanelFilters;
  disabled: boolean;
  onApply: (next: PanelFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the ledger. The range counts once, not
   * twice, and THE ORDERING IS NOT COUNTED — every ledger has one, so a badge
   * reading `Filter (1)` over an unnarrowed card would teach people to ignore
   * the number.
   */
  const count = [
    applied.movementType !== "",
    applied.from !== "" || applied.to !== "",
  ].filter(Boolean).length;

  function patch(change: Partial<PanelFilters>) {
    setDraft((prev) => ({ ...prev, ...change }));
  }

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
        disabled={disabled}
        onClick={() => onOpenChange(true)}
      />

      <FilterPanel
        open={open}
        onOpenChange={onOpenChange}
        onReset={() => {
          onApply(CLEARED);
          setOpen(false);
        }}
        onApply={() => {
          onApply(draft);
          setOpen(false);
        }}
      >
        {/* Sort leads: it is the one field here that is always set, and the
            only one that changes what the top of the ledger is rather than
            what is in it. */}
        <FilterSelect
          layout="field"
          label="Urutkan"
          ariaLabel="Urutkan"
          value={draft.sort}
          options={SORTS}
          unsetValue="newest"
          onChange={(sort) => patch({ sort })}
        />
        <FilterSelect
          layout="field"
          label="Tipe pergerakan"
          ariaLabel="Tipe pergerakan"
          value={draft.movementType}
          options={TYPES}
          onChange={(movementType) => patch({ movementType })}
        />
        <FilterDateRange
          layout="field"
          label="Tanggal"
          from={draft.from}
          to={draft.to}
          onApply={({ from, to }) => patch({ from, to })}
        />
      </FilterPanel>
    </>
  );
}
