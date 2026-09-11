"use client";

import type { ReactNode } from "react";
import { CalendarDays, Store, Warehouse } from "lucide-react";

import type {
  CustomerInvoiceFilterOptions,
  CustomerInvoiceListSummary,
} from "@/types/api";

import type { CustomerInvoicesQuery } from "../hooks/useCustomerInvoices";
import { PERIODS } from "./ReceivablesToolbar";

/** `9` → `Sep`, in the module's own month vocabulary (the table's dates use it). */
function monthShort(month: number): string {
  return new Date(2026, month - 1, 1).toLocaleDateString("id-ID", {
    month: "short",
  });
}

function partsOf(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function fullDate(date: string): string {
  const { year, month, day } = partsOf(date);
  return `${day} ${monthShort(month)} ${year}`;
}

/**
 * Two calendar days as one short phrase, sharing what they share.
 *
 *   same day    → `11 Sep 2026`
 *   same month  → `1–30 Sep 2026`
 *   same year   → `31 Agu – 6 Sep 2026`
 *   otherwise   → `28 Des 2026 – 3 Jan 2027`
 *
 * READS `yyyy-mm-dd` STRINGS, NEVER INSTANTS. The day a range starts on is the
 * tenant's calendar day; a `Date` formatted in the reader's timezone would name
 * the day before for anybody west of the shop.
 */
export function formatDateRange(from: string | null, to: string | null): string {
  if (!from && !to) return "Semua tanggal";
  if (from && !to) return `Sejak ${fullDate(from)}`;
  if (!from && to) return `Sampai ${fullDate(to)}`;

  const a = partsOf(from!);
  const b = partsOf(to!);

  if (from === to) return fullDate(from!);
  if (a.year === b.year && a.month === b.month) {
    return `${a.day}–${b.day} ${monthShort(b.month)} ${b.year}`;
  }
  if (a.year === b.year) {
    return `${a.day} ${monthShort(a.month)} – ${b.day} ${monthShort(b.month)} ${b.year}`;
  }
  return `${fullDate(from!)} – ${fullDate(to!)}`;
}

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
}: {
  query: CustomerInvoicesQuery;
  options: CustomerInvoiceFilterOptions;
  summary: CustomerInvoiceListSummary | null;
  summaryStale: boolean;
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
      <p className="text-xs text-muted sm:ml-auto">Ubah lewat tombol Filter</p>
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
