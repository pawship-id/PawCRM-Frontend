"use client";

import { useState } from "react";
import { ListFilter } from "lucide-react";

import {
  FilterBar,
  FilterDateRange,
  FilterField,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
  namedOptions,
  withAll,
  type FilterOption,
} from "@/components";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  CustomerInvoiceFilterOptions,
  CustomerInvoiceSource,
  CustomerInvoiceStatusFilter,
} from "@/types/api";

import type {
  CustomerInvoicesQuery,
  InvoicePeriodChoice,
} from "../hooks/useCustomerInvoices";

/**
 * What the Status filter offers. `overdue` is not a status — it rides here
 * because it is the question most often asked of this field, and the server ORs
 * it with the rest.
 *
 * THE SAME WORDS AS THE STATUS BADGE, so a reader filtering by "Lunas sebagian"
 * finds rows labelled that.
 */
export const STATUS_FILTERS: FilterOption<CustomerInvoiceStatusFilter>[] = [
  { value: "unpaid", label: "Belum lunas" },
  { value: "partial", label: "Lunas sebagian" },
  { value: "paid", label: "Lunas" },
  { value: "void", label: "Batal" },
  { value: "overdue", label: "Lewat jatuh tempo" },
];

/** Who raised the invoice — a filter, never an input. */
const SOURCES: FilterOption<CustomerInvoiceSource | "">[] = [
  { value: "", label: "Semua sumber" },
  { value: "pos_bridge", label: "Kasir" },
  { value: "manual", label: "Manual" },
];

/**
 * The periods. "Semua tanggal" is the default and sends nothing; the three named
 * ones go over the wire as their NAME and are cut in the tenant's timezone;
 * "Pilih tanggal" opens the range beneath.
 */
export const PERIODS: FilterOption<InvoicePeriodChoice>[] = [
  { value: "all", label: "Semua tanggal" },
  { value: "today", label: "Hari ini" },
  { value: "week", label: "Minggu ini" },
  { value: "month", label: "Bulan ini" },
  { value: "custom", label: "Pilih tanggal" },
];

type WarehouseOption = CustomerInvoiceFilterOptions["warehouses"][number];

/**
 * Whether a gudang sits under a cabang.
 *
 * ITS OWN CABANG FIRST — the master record's — and only when that is not named,
 * the cabang it has actually billed under. A gudang that once served another
 * branch's sale does not thereby belong to it.
 */
function belongsTo(warehouse: WarehouseOption, branchId: string) {
  return warehouse.branchId
    ? warehouse.branchId === branchId
    : warehouse.branchIds.includes(branchId);
}

/**
 * The cabang that picking this gudang fills in — or "" when it cannot be told,
 * in which case the Cabang field is left as it was rather than guessed.
 */
function homeBranchOf(warehouse: WarehouseOption) {
  if (warehouse.branchId) return warehouse.branchId;
  return warehouse.branchIds.length === 1 ? warehouse.branchIds[0] : "";
}

/** What the panel edits, as one draft. */
interface PanelDraft {
  branchId: string;
  warehouseId: string;
  createdBy: string[];
  source: CustomerInvoiceSource | "";
  statuses: CustomerInvoiceStatusFilter[];
  period: InvoicePeriodChoice;
  dateFrom: string;
  dateTo: string;
}

const CLEARED: Partial<CustomerInvoicesQuery> = {
  branchId: "",
  warehouseId: "",
  createdBy: [],
  source: "",
  statuses: [],
  period: "all",
  dateFrom: "",
  dateTo: "",
};

const sameSet = <T,>(a: T[], b: T[]) =>
  a.length === b.length && a.every((value) => b.includes(value));

/**
 * Search, and one Filter button holding everything else — Cabang, Gudang,
 * Kasir / Admin, Sumber, Status and Periode.
 *
 * SEARCH REACHES THE CUSTOMER'S NAME. The server resolves matching customers
 * into ids first, so the placeholder can promise what people type.
 *
 * NO ORDERING IN THE PANEL. The table's column headers sort — Tanggal, Jatuh
 * tempo, Nilai, Sisa — which is where the mockup puts it.
 */
export function ReceivablesToolbar({
  query,
  onChange,
  options,
}: {
  query: CustomerInvoicesQuery;
  onChange: (patch: Partial<CustomerInvoicesQuery>) => void;
  options: CustomerInvoiceFilterOptions;
}) {
  return (
    <FilterBar
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nomor faktur, nama pelanggan, atau catatan…"
          ariaLabel="Cari faktur"
          fill
        />
      }
    >
      <ReceivablesFilterPanel
        query={query}
        options={options}
        onChange={onChange}
      />
    </FilterBar>
  );
}

/**
 * The panel. Fields wait for Terapkan (§8); Reset clears and applies at once.
 *
 * CABANG AND GUDANG ARE LINKED, in both directions:
 *
 *   Semua cabang      → every gudang is offered.
 *   one cabang        → only the gudang under it; a gudang already chosen that
 *                       is not under it is cleared rather than left narrowing
 *                       the list to nothing.
 *   a gudang first    → Cabang fills in with that gudang's own cabang.
 *
 * Both stay single choices, which is what lets the link be stated at all — a
 * gudang "under three of the five ticked cabang" is not a rule anybody can read.
 *
 * THE BADGE COUNTS WHAT THE SCREEN DOES NOT OTHERWISE SHOW — kasir, sumber,
 * status. Cabang, Gudang and Periode are edited here but always READ on the
 * scope card above the figures, and the badge exists to pay back what a panel
 * conceals (§8). Counting them too would put a standing number over a list
 * whose scope is already spelled out.
 */
function ReceivablesFilterPanel({
  query,
  options,
  onChange,
}: {
  query: CustomerInvoicesQuery;
  options: CustomerInvoiceFilterOptions;
  onChange: (patch: Partial<CustomerInvoicesQuery>) => void;
}) {
  const seed = (): PanelDraft => ({
    branchId: query.branchId,
    warehouseId: query.warehouseId,
    createdBy: query.createdBy,
    source: query.source,
    statuses: query.statuses,
    period: query.period,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PanelDraft>(seed);

  const count = [
    query.createdBy.length > 0,
    query.source !== "",
    query.statuses.length > 0,
  ].filter(Boolean).length;

  const visibleWarehouses = draft.branchId
    ? options.warehouses.filter((warehouse) =>
        belongsTo(warehouse, draft.branchId),
      )
    : options.warehouses;

  function patch(change: Partial<PanelDraft>) {
    setDraft((prev) => ({ ...prev, ...change }));
  }

  function pickBranch(branchId: string) {
    const current = options.warehouses.find(
      (warehouse) => warehouse._id === draft.warehouseId,
    );
    const keepsWarehouse = !current || !branchId || belongsTo(current, branchId);

    patch({ branchId, ...(keepsWarehouse ? {} : { warehouseId: "" }) });
  }

  function pickWarehouse(warehouseId: string) {
    const picked = options.warehouses.find(
      (warehouse) => warehouse._id === warehouseId,
    );
    const home = picked ? homeBranchOf(picked) : "";

    patch({ warehouseId, ...(home ? { branchId: home } : {}) });
  }

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft.
    if (next) setDraft(seed());
    setOpen(next);
  }

  /**
   * Commits only what moved: the fetch effects key on the query, and posting
   * every field back would re-query after a Terapkan that changed nothing.
   */
  function apply() {
    const change: Partial<CustomerInvoicesQuery> = {};
    // A named period carries no dates of its own.
    const dateFrom = draft.period === "custom" ? draft.dateFrom : "";
    const dateTo = draft.period === "custom" ? draft.dateTo : "";

    if (draft.branchId !== query.branchId) change.branchId = draft.branchId;
    if (draft.warehouseId !== query.warehouseId) change.warehouseId = draft.warehouseId;
    if (!sameSet(draft.createdBy, query.createdBy)) change.createdBy = draft.createdBy;
    if (!sameSet(draft.statuses, query.statuses)) change.statuses = draft.statuses;
    if (draft.source !== query.source) change.source = draft.source;
    if (draft.period !== query.period) change.period = draft.period;
    if (dateFrom !== query.dateFrom) change.dateFrom = dateFrom;
    if (dateTo !== query.dateTo) change.dateTo = dateTo;

    if (Object.keys(change).length > 0) onChange(change);
    setOpen(false);
  }

  function reset() {
    onChange(CLEARED);
    setOpen(false);
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
        onReset={reset}
        onApply={apply}
      >
        <FilterSelect
          layout="field"
          label="Cabang"
          ariaLabel="Filter cabang"
          value={draft.branchId}
          options={withAll(namedOptions(options.branches), "Semua cabang")}
          onChange={pickBranch}
        />
        <FilterSelect
          layout="field"
          label="Gudang"
          ariaLabel="Filter gudang"
          value={draft.warehouseId}
          options={withAll(namedOptions(visibleWarehouses), "Semua gudang")}
          onChange={pickWarehouse}
        />
        <CheckMenuField
          label="Kasir / Admin"
          allLabel="Semua kasir/admin"
          unit="orang"
          options={namedOptions(options.creators)}
          selected={draft.createdBy}
          onChange={(createdBy) => patch({ createdBy })}
        />
        <FilterSelect
          layout="field"
          label="Sumber"
          ariaLabel="Filter sumber faktur"
          value={draft.source}
          options={SOURCES}
          onChange={(source) => patch({ source })}
        />
        <CheckMenuField
          label="Status"
          allLabel="Semua status"
          unit="status"
          options={STATUS_FILTERS}
          selected={draft.statuses}
          onChange={(statuses) => patch({ statuses })}
        />
        <FilterSelect
          layout="field"
          label="Periode"
          ariaLabel="Filter periode"
          value={draft.period}
          options={PERIODS}
          unsetValue="all"
          onChange={(period) => patch({ period })}
        />
        {draft.period === "custom" && (
          <FilterDateRange
            layout="field"
            label="Tanggal faktur"
            from={draft.dateFrom}
            to={draft.dateTo}
            // The Periode field above IS the preset list; chips here would be
            // a second "Bulan ini" cut in the browser's timezone, not the shop's.
            presets={[]}
            onApply={({ from, to }) => patch({ dateFrom: from, dateTo: to })}
          />
        )}
      </FilterPanel>
    </>
  );
}

/**
 * A many-value field inside the panel, as a menu of checkboxes.
 *
 * NOT A FilterMultiSelect, for the reason `ProductsToolbar`'s WarehouseField
 * gives: that control carries its own Terapkan, and this one sits inside a panel
 * that already has one. The shell — FilterField and FilterTrigger — is shared,
 * so it lines up with the selects beside it.
 *
 * NOTHING TICKED IS "SEMUA", and that row is what the empty state looks like
 * rather than a separate mode.
 */
function CheckMenuField<T extends string>({
  label,
  allLabel,
  unit,
  options,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  /** The noun a count past one reads as — "2 orang". */
  unit: string;
  options: FilterOption<T>[];
  selected: T[];
  onChange: (values: T[]) => void;
}) {
  const names = options
    .filter((option) => selected.includes(option.value))
    .map((option) => option.label);

  const value =
    selected.length === 0
      ? allLabel
      : selected.length === 1 && names.length === 1
        ? names[0]
        : `${selected.length} ${unit}`;

  function toggle(option: T) {
    onChange(
      selected.includes(option)
        ? selected.filter((current) => current !== option)
        : [...selected, option],
    );
  }

  return (
    <FilterField label={label}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <FilterTrigger
            layout="field"
            label={label}
            value={value}
            active={selected.length > 0}
            aria-label={`${label}: ${value}`}
            title={names.length > 1 ? names.join(", ") : undefined}
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuCheckboxItem
            checked={selected.length === 0}
            onCheckedChange={() => onChange([])}
          >
            {allLabel}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted">
              Belum ada pilihan dari faktur yang ada.
            </p>
          ) : (
            options.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={selected.includes(option.value)}
                onCheckedChange={() => toggle(option.value)}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </FilterField>
  );
}
