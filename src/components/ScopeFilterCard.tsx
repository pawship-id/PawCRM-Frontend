"use client";

import type { ReactNode } from "react";
import { CalendarDays, Store, Warehouse } from "lucide-react";

import { namedOptions } from "./filters/codecs";
import { FilterMultiSelect } from "./filters/FilterMultiSelect";
import { FilterPills, type PillOption } from "./filters/FilterPills";
import {
  SCOPE_PERIODS,
  ScopeCard,
  ScopeCustomRange,
  ScopeField,
  type ScopePeriod,
} from "./ScopePeriodCard";

/** A cabang as the card offers it. */
export interface ScopeBranchOption {
  _id: string;
  name: string;
}

/**
 * A gudang as the card offers it — with WHICH CABANG IT SITS UNDER, which is
 * what lets the card link the two fields.
 *
 *   branchIds    — the cabang it belongs to; `"all"` for a gudang that serves
 *                  every one (no default cabang), which is offered under any.
 *   homeBranchId — the cabang that picking it ticks too, when that can be told.
 *
 * Each screen maps its own lookup into this shape; the card does not know
 * which API a gudang came from.
 */
export interface ScopeWarehouseOption {
  _id: string;
  name: string;
  branchIds: string[] | "all";
  homeBranchId: string | null;
}

/** The two sets the card changes together. */
export interface ScopeSelection {
  branchIds: string[];
  warehouseIds: string[];
}

export interface ScopeFilterCardPeriod<P extends string = ScopePeriod> {
  value: P;
  onChange: (period: P) => void;
  /**
   * The chips, when a screen's periods are not the default five — Grooming has
   * no "Semua", because its board would load every booking ever taken.
   * Defaults to `SCOPE_PERIODS`. Whatever is passed, "custom" is the value that
   * reveals the two dates.
   */
  options?: PillOption<P>[];
  /** `yyyy-mm-dd`, read only under `custom`. */
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (range: { from: string; to: string }) => void;
  /** What the dates bound, in the screen's own words — "Tanggal faktur". */
  dateLabel: string;
}

export interface ScopeFilterCardProps<P extends string = ScopePeriod> {
  branches: ScopeBranchOption[];
  branchIds: string[];
  /** Omit to draw no Gudang field — a screen whose data has no gudang. */
  warehouses?: ScopeWarehouseOption[];
  warehouseIds?: string[];
  /**
   * Called with BOTH sets whenever either field is applied, already linked:
   * picking cabang drops a gudang under none of them, picking a gudang ticks
   * its cabang.
   */
  onScopeChange: (scope: ScopeSelection) => void;
  /** Omit to draw no Periode field — a page of balances as of now. */
  period?: ScopeFilterCardPeriod<P>;
  /** Drawn at the row's right end — a screen's "Reset filter (n)". */
  trailing?: ReactNode;
}

/* ---------------------------------------------------- the cabang–gudang link */

function belongsToAny(warehouse: ScopeWarehouseOption, branchIds: string[]) {
  return (
    warehouse.branchIds === "all" ||
    branchIds.some((id) => (warehouse.branchIds as string[]).includes(id))
  );
}

/**
 * The gudang to offer under these cabang — every one while none is picked, and
 * always the ones already picked, since a value that cannot be seen cannot be
 * unticked.
 */
export function warehousesOffered<T extends ScopeWarehouseOption>(
  warehouses: T[],
  branchIds: string[],
  warehouseIds: string[],
): T[] {
  return branchIds.length === 0
    ? warehouses
    : warehouses.filter(
        (warehouse) =>
          belongsToAny(warehouse, branchIds) ||
          warehouseIds.includes(warehouse._id),
      );
}

/** Picking cabang drops a picked gudang that sits under none of them. */
export function warehousesAfterBranches(
  warehouses: ScopeWarehouseOption[],
  branchIds: string[],
  warehouseIds: string[],
): string[] {
  if (branchIds.length === 0) return warehouseIds;
  return warehouseIds.filter((id) => {
    const warehouse = warehouses.find((row) => row._id === id);
    // A gudang whose options have not loaded is kept, not guessed away.
    return !warehouse || belongsToAny(warehouse, branchIds);
  });
}

/** Picking a gudang ticks its own cabang too, when it can be told. */
export function branchesAfterWarehouses(
  warehouses: ScopeWarehouseOption[],
  branchIds: string[],
  previous: string[],
  next: string[],
): string[] {
  const homes = next
    .filter((id) => !previous.includes(id))
    .map((id) => warehouses.find((row) => row._id === id)?.homeBranchId ?? "")
    .filter((home) => home !== "" && !branchIds.includes(home));
  return homes.length > 0 ? [...branchIds, ...new Set(homes)] : branchIds;
}

/**
 * A picked set as the few words a trigger has room for.
 *
 *   none           → `Semua cabang`
 *   one or two     → their names
 *   three or more  → `3 cabang`
 *
 * A PICKED VALUE WHOSE NAME HAS NOT ARRIVED READS "—", never "Semua". The
 * options load separately, and "Semua cabang" over figures scoped to one cabang
 * would be a confident wrong caption.
 */
export function scopeSummary(
  ids: string[],
  rows: { _id: string; name: string }[],
  allLabel: string,
  unit: string,
): string {
  if (ids.length === 0) return allLabel;
  const names = ids.map((id) => rows.find((row) => row._id === id)?.name);
  if (names.some((name) => name === undefined)) {
    return ids.length === 1 ? "—" : `${ids.length} ${unit}`;
  }
  return names.length <= 2 ? names.join(", ") : `${names.length} ${unit}`;
}

/**
 * THE SCOPE ROW EVERY SCREEN WEARS — Cabang, Gudang and Periode, applied from
 * the row itself. Made one component on 12 October 2026 (on request) after
 * Ringkasan and Faktur had drifted into two different dropdowns for the same
 * question.
 *
 * EVERY DROPDOWN TAKES SEVERAL VALUES (on request): nothing ticked is "Semua",
 * and ticking waits for Terapkan, because people tick a few boxes before they
 * mean any of it. Periode stays one choice — "Hari ini" sits inside "Minggu
 * ini", so ticking two would only ever mean the larger.
 *
 * GUDANG AND PERIODE ARE OPTIONAL, so a screen draws only the fields its data
 * has: Ringkasan has no gudang, a stock page has no period.
 */
export function ScopeFilterCard<P extends string = ScopePeriod>({
  branches,
  branchIds,
  warehouses,
  warehouseIds = [],
  onScopeChange,
  period,
  trailing,
}: ScopeFilterCardProps<P>) {
  return (
    <ScopeCard
      below={
        period?.value === "custom" ? (
          <ScopeCustomRange
            /* Keyed on the applied range, so it re-seeds when that changes
               from outside — a Reset, or the filter panel. */
            key={`${period.dateFrom}|${period.dateTo}`}
            from={period.dateFrom}
            to={period.dateTo}
            label={period.dateLabel}
            onApply={period.onDateRangeChange}
          />
        ) : undefined
      }
    >
      <ScopeField icon={<Store className="size-4" />} label="Cabang">
        <FilterMultiSelect
          label="Cabang"
          layout="bar"
          ariaLabel="Cabang"
          values={branchIds}
          options={namedOptions(branches)}
          formatValue={(ids) =>
            scopeSummary(ids, branches, "Semua cabang", "cabang")
          }
          onApply={(next) =>
            onScopeChange({
              branchIds: next,
              warehouseIds: warehouses
                ? warehousesAfterBranches(warehouses, next, warehouseIds)
                : warehouseIds,
            })
          }
          onReset={() => onScopeChange({ branchIds: [], warehouseIds })}
        />
      </ScopeField>

      {warehouses && (
        <ScopeField icon={<Warehouse className="size-4" />} label="Gudang">
          <FilterMultiSelect
            label="Gudang"
            layout="bar"
            ariaLabel="Gudang"
            values={warehouseIds}
            options={namedOptions(
              warehousesOffered(warehouses, branchIds, warehouseIds),
            )}
            formatValue={(ids) =>
              scopeSummary(ids, warehouses, "Semua gudang", "gudang")
            }
            onApply={(next) =>
              onScopeChange({
                warehouseIds: next,
                branchIds: branchesAfterWarehouses(
                  warehouses,
                  branchIds,
                  warehouseIds,
                  next,
                ),
              })
            }
            onReset={() => onScopeChange({ branchIds, warehouseIds: [] })}
          />
        </ScopeField>
      )}

      {period && (
        <ScopeField icon={<CalendarDays className="size-4" />} label="Periode">
          <FilterPills
            ariaLabel="Periode"
            value={period.value}
            options={
              period.options ?? (SCOPE_PERIODS as unknown as PillOption<P>[])
            }
            onChange={period.onChange}
          />
        </ScopeField>
      )}

      {trailing && <div className="sm:ml-auto">{trailing}</div>}
    </ScopeCard>
  );
}
