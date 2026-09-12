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

/** Where the invoice came from — a filter, never an input. Nothing ticked is every source. */
const SOURCES: FilterOption<CustomerInvoiceSource>[] = [
  { value: "pos_bridge", label: "Kasir" },
  { value: "manual", label: "Manual" },
];

/**
 * The periods. "Semua tanggal" is the default and sends nothing; the three named
 * ones go over the wire as their NAME and are cut in the tenant's timezone;
 * "Pilih tanggal" opens the range beneath.
 *
 * THE ONE OPTION FIELD THAT STAYS A SINGLE CHOICE. Hari ini sits inside Minggu
 * ini, which sits inside Bulan ini — ticking two of them would only ever mean
 * the larger one, and "Pilih tanggal" beside a named period is two ranges with
 * no rule for combining them.
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

const belongsToAny = (warehouse: WarehouseOption, branchIds: string[]) =>
  branchIds.some((branchId) => belongsTo(warehouse, branchId));

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
  branchIds: string[];
  warehouseIds: string[];
  createdBy: string[];
  sources: CustomerInvoiceSource[];
  statuses: CustomerInvoiceStatusFilter[];
  period: InvoicePeriodChoice;
  dateFrom: string;
  dateTo: string;
}

const CLEARED: Partial<CustomerInvoicesQuery> = {
  branchIds: [],
  warehouseIds: [],
  createdBy: [],
  sources: [],
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
 * EVERY OPTION FIELD IS A SET but Periode (see PERIODS for why). Nothing ticked
 * is "Semua", and the values ticked in one field are OR'd.
 *
 * CABANG AND GUDANG ARE LINKED, in both directions:
 *
 *   Semua cabang      → every gudang is offered.
 *   some cabang       → only the gudang under any of them; a gudang already
 *                       ticked that is under none of them is unticked rather
 *                       than left narrowing the list to nothing.
 *   a gudang first    → its own cabang is ticked too, when it can be told.
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
    branchIds: query.branchIds,
    warehouseIds: query.warehouseIds,
    createdBy: query.createdBy,
    sources: query.sources,
    statuses: query.statuses,
    period: query.period,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PanelDraft>(seed);

  const count = [
    query.createdBy.length > 0,
    query.sources.length > 0,
    query.statuses.length > 0,
  ].filter(Boolean).length;

  /*
    A TICKED GUDANG IS ALWAYS OFFERED, even when the cabang ticked beside it do
    not cover it — a value that cannot be seen cannot be unticked.
  */
  const visibleWarehouses =
    draft.branchIds.length === 0
      ? options.warehouses
      : options.warehouses.filter(
          (warehouse) =>
            belongsToAny(warehouse, draft.branchIds) ||
            draft.warehouseIds.includes(warehouse._id),
        );

  function patch(change: Partial<PanelDraft>) {
    setDraft((prev) => ({ ...prev, ...change }));
  }

  function pickBranches(branchIds: string[]) {
    const warehouseIds =
      branchIds.length === 0
        ? draft.warehouseIds
        : draft.warehouseIds.filter((id) => {
            const warehouse = options.warehouses.find((row) => row._id === id);
            // A gudang whose options have not loaded is kept, not guessed away.
            return !warehouse || belongsToAny(warehouse, branchIds);
          });

    patch({ branchIds, warehouseIds });
  }

  function pickWarehouses(warehouseIds: string[]) {
    const homes = warehouseIds
      .filter((id) => !draft.warehouseIds.includes(id))
      .map((id) => options.warehouses.find((row) => row._id === id))
      .map((warehouse) => (warehouse ? homeBranchOf(warehouse) : ""))
      .filter((home) => home !== "" && !draft.branchIds.includes(home));

    patch({
      warehouseIds,
      ...(homes.length > 0
        ? { branchIds: [...draft.branchIds, ...new Set(homes)] }
        : {}),
    });
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

    if (!sameSet(draft.branchIds, query.branchIds)) change.branchIds = draft.branchIds;
    if (!sameSet(draft.warehouseIds, query.warehouseIds)) {
      change.warehouseIds = draft.warehouseIds;
    }
    if (!sameSet(draft.createdBy, query.createdBy)) change.createdBy = draft.createdBy;
    if (!sameSet(draft.statuses, query.statuses)) change.statuses = draft.statuses;
    if (!sameSet(draft.sources, query.sources)) change.sources = draft.sources;
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
        <CheckMenuField
          label="Cabang"
          allLabel="Semua cabang"
          unit="cabang"
          options={namedOptions(options.branches)}
          selected={draft.branchIds}
          onChange={pickBranches}
        />
        <CheckMenuField
          label="Gudang"
          allLabel="Semua gudang"
          unit="gudang"
          options={namedOptions(visibleWarehouses)}
          selected={draft.warehouseIds}
          onChange={pickWarehouses}
        />
        <CheckMenuField
          label="Kasir / Admin"
          allLabel="Semua kasir/admin"
          unit="orang"
          options={namedOptions(options.creators)}
          selected={draft.createdBy}
          onChange={(createdBy) => patch({ createdBy })}
        />
        <CheckMenuField
          label="Sumber"
          allLabel="Semua sumber"
          unit="sumber"
          options={SOURCES}
          selected={draft.sources}
          onChange={(sources) => patch({ sources })}
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
 *
 * THE LIST IS HELD STILL WHILE THE MENU IS OPEN. Ticking a gudang ticks its
 * cabang, which narrows the gudang on offer; re-drawn mid-menu, the row somebody
 * was reaching for next would vanish under the pointer. The narrower list shows
 * the next time the menu opens.
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
  const [heldOptions, setHeldOptions] = useState<FilterOption<T>[] | null>(
    null,
  );
  const shown = heldOptions ?? options;

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
      <DropdownMenu
        onOpenChange={(isOpen) => setHeldOptions(isOpen ? options : null)}
      >
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
          {shown.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted">
              Belum ada pilihan dari faktur yang ada.
            </p>
          ) : (
            shown.map((option) => (
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
