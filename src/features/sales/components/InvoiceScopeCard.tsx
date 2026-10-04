"use client";

import type { ReactNode } from "react";
import { CalendarDays, Store, Warehouse } from "lucide-react";

import { Button } from "@/components/ui/button";
/**
 * PROMOTED TO `utils/date` (29 September 2026) when Pembelian's own scope card
 * needed the same phrase. Re-exported here because the tests and one import
 * still name this module — see ui-rules §14 on promotion.
 */
import { formatDateRange } from "@/utils/date";
import type {
  CustomerInvoiceFilterOptions,
  CustomerInvoiceListSummary,
} from "@/types/api";

import type { CustomerInvoicesQuery } from "../hooks/useCustomerInvoices";
import { PERIODS } from "./ReceivablesToolbar";

export { formatDateRange };

/**
 * A ticked set of cabang or gudang, as the few words the card has room for.
 *
 *   none           → `Semua cabang`
 *   one            → its name
 *   two            → both names
 *   three or more  → `3 cabang`, with every name in the tooltip
 *
 * A CHOSEN VALUE WHOSE NAME HAS NOT ARRIVED READS "—", never "Semua". The
 * options load separately, and "Semua cabang" over figures scoped to one cabang
 * would be a confident wrong caption. Several with a name missing read as their
 * count, which is true whether or not the names have loaded.
 */
function scopeValue(
  ids: string[],
  rows: { _id: string; name: string }[],
  allLabel: string,
  unit: string,
): { value: string; title?: string } {
  if (ids.length === 0) return { value: allLabel };

  const names = ids.map((id) => rows.find((row) => row._id === id)?.name);
  if (names.some((name) => name === undefined)) {
    return { value: ids.length === 1 ? "—" : `${ids.length} ${unit}` };
  }
  if (names.length <= 2) return { value: names.join(", ") };
  return { value: `${names.length} ${unit}`, title: names.join(", ") };
}

/**
 * WHOSE BOOKS AND WHICH DAYS the four cards below are about — read-only.
 *
 * NOT A CONTROL, deliberately. Cabang, Gudang and Periode are changed in the
 * filter panel; this card only says what is on, so a reader looking at "Omzet
 * Rp 4.200.000" can see at a glance which month and which shop it is. It carries
 * no buttons, and says in words where the controls are rather than looking like
 * something to click.
 *
 * THE PERIOD'S DATES ARE THE SERVER'S. A named period ("Bulan ini") is resolved
 * in the tenant's timezone, so its days come from the summary's echo — and only
 * once that echo answers the CURRENT filter, or a switch to "Minggu ini" would
 * briefly caption the week with last month's dates. A typed range is shown from
 * the days that were typed.
 */
export function InvoiceScopeCard({
  query,
  options,
  summary,
  summaryStale,
  filterCount,
  onReset,
}: {
  query: CustomerInvoicesQuery;
  options: CustomerInvoiceFilterOptions;
  summary: CustomerInvoiceListSummary | null;
  summaryStale: boolean;
  /** How many filters narrow the list — see `countInvoiceFilters`. */
  filterCount: number;
  /** Clears them all in one press. Nothing is drawn while none are on. */
  onReset: () => void;
}) {
  const branch = scopeValue(
    query.branchIds,
    options.branches,
    "Semua cabang",
    "cabang",
  );
  const warehouse = scopeValue(
    query.warehouseIds,
    options.warehouses,
    "Semua gudang",
    "gudang",
  );

  let period: string;
  if (query.period === "all") {
    period = "Semua tanggal";
  } else if (query.period === "custom") {
    period = formatDateRange(query.dateFrom || null, query.dateTo || null);
  } else {
    const label =
      PERIODS.find((option) => option.value === query.period)?.label ?? "";
    const echo = !summaryStale ? summary?.period : null;
    period = echo
      ? `${label} · ${formatDateRange(echo.fromDate, echo.toDate)}`
      : label;
  }

  return (
    <section
      aria-label="Lingkup data"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-surface px-5 py-3.5 shadow-sm"
    >
      <dl className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <ScopeItem
          icon={<Store className="size-4" />}
          label="Cabang"
          value={branch.value}
          title={branch.title}
        />
        <ScopeItem
          icon={<Warehouse className="size-4" />}
          label="Gudang"
          value={warehouse.value}
          title={warehouse.title}
        />
        <ScopeItem
          icon={<CalendarDays className="size-4" />}
          label="Periode"
          value={period}
        />
      </dl>
      {/*
        ONE WAY OUT OF A NARROWED LIST (16 September 2026, on request) — the same
        "Reset filter (n)" the grooming catalogue puts on its own context card.
        It appears only while something is on; with nothing on, the card is the
        read-only thing it has always been and says where its controls live.
      */}
      {filterCount > 0 ? (
        <Button
          type="button"
          variant="link"
          className="min-h-11 sm:ml-auto"
          onClick={onReset}
        >
          Reset filter ({filterCount})
        </Button>
      ) : (
        <p className="text-xs text-muted sm:ml-auto">Ubah lewat tombol Filter</p>
      )}
    </section>
  );
}

/** One label and its value, divided from the one before by a hairline. */
function ScopeItem({
  icon,
  label,
  value,
  title,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  /** The whole list, when `value` is only its count. */
  title?: string;
}) {
  return (
    <div className="flex items-center gap-2 sm:border-l sm:border-border sm:pl-6 sm:first:border-l-0 sm:first:pl-0">
      <span aria-hidden className="text-primary">
        {icon}
      </span>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-bold text-foreground tabular-nums" title={title}>
        {value}
      </dd>
    </div>
  );
}
