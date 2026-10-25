"use client";

import { useState } from "react";
import Link from "next/link";
import { ListFilter } from "lucide-react";

import {
  Alert,
  DataTable,
  FilterBar,
  FilterDateRange,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
  HighlightText,
  Pagination,
  withAll,
  type DataTableColumn,
} from "@/components";
import {
  SERVICE_KIND_LABELS,
  type CustomerHistoryKind,
  type CustomerHistoryRow,
  type CustomerHistorySource,
} from "@/types/api";
import { formatMoney } from "@/utils/decimal";

import {
  DEFAULT_HISTORY_QUERY,
  useCustomerHistory,
  type CustomerHistoryQuery,
} from "../hooks/useCustomerHistory";
import { day } from "../labels";
import { CustomerModuleHeader } from "./CustomerModuleHeader";

const KIND_LABELS: Record<CustomerHistoryKind, string> = {
  ...SERVICE_KIND_LABELS,
  service: "Layanan",
  product: "Produk",
  membership: "Membership",
  invoice: "Faktur",
};

const SOURCE_LABELS: Record<CustomerHistorySource, string> = {
  pos: "Kasir",
  invoice: "Faktur",
};

const KINDS = withAll<CustomerHistoryQuery["kind"]>(
  (Object.keys(KIND_LABELS) as CustomerHistoryKind[]).map((value) => ({
    value,
    label: KIND_LABELS[value],
  })),
  "Semua jenis",
);

const SOURCES = withAll<CustomerHistoryQuery["source"]>(
  (Object.keys(SOURCE_LABELS) as CustomerHistorySource[]).map((value) => ({
    value,
    label: SOURCE_LABELS[value],
  })),
  "Semua sumber",
);

const BADGE = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold";

/** The table's columns; `search` is what the names are highlighted against. */
const columnsFor = (search: string): DataTableColumn<CustomerHistoryRow>[] => [
  {
    id: "date",
    header: "Tanggal",
    cellClassName: "whitespace-nowrap tabular-nums",
    cell: (row) => day(row.date),
  },
  {
    id: "customer",
    header: "Pelanggan",
    cell: (row) =>
      row.customer ? (
        <Link
          href={`/dashboard/customers/${row.customer.id}`}
          className="text-foreground hover:text-primary-hover"
        >
          <HighlightText text={row.customer.name ?? "—"} query={search} />
        </Link>
      ) : (
        "—"
      ),
  },
  {
    id: "pet",
    header: "Hewan",
    cell: (row) =>
      row.pet ? (
        <Link
          href={`/dashboard/pets/${row.pet.id}`}
          className="text-foreground hover:text-primary-hover"
        >
          <HighlightText text={row.pet.name ?? "—"} query={search} />
        </Link>
      ) : (
        <span className="text-muted">—</span>
      ),
  },
  {
    id: "activity",
    header: "Kegiatan",
    cell: (row) => {
      const label =
        row.otherLines > 0 ? `${row.activity} +${row.otherLines} lainnya` : row.activity;

      return row.source === "invoice" ? (
        <Link
          href={`/dashboard/sales/invoice/${row.documentId}`}
          className="text-foreground hover:text-primary-hover"
        >
          {label}
        </Link>
      ) : (
        label
      );
    },
  },
  {
    id: "kind",
    header: "Jenis",
    cell: (row) => (
      <span className={`${BADGE} bg-tint-info text-primary`}>{KIND_LABELS[row.kind]}</span>
    ),
  },
  {
    id: "place",
    header: "Cabang / Gudang",
    cell: (row) => (
      <>
        <p className="text-foreground">{row.branch?.name ?? "—"}</p>
        {row.warehouse?.name && <p className="text-xs text-muted">{row.warehouse.name}</p>}
      </>
    ),
  },
  {
    id: "amount",
    header: "Nilai",
    align: "right",
    cellClassName: "whitespace-nowrap tabular-nums",
    cell: (row) => formatMoney(row.amount),
  },
  {
    id: "source",
    header: "Sumber",
    cell: (row) =>
      row.source === "invoice" ? (
        <span className={`${BADGE} bg-tint-warning text-warning`}>{SOURCE_LABELS.invoice}</span>
      ) : (
        <span className={`${BADGE} bg-tint-info text-primary`}>{SOURCE_LABELS.pos}</span>
      ),
  },
];

/**
 * The Riwayat tab (25 October 2026): what the shop did for its customers, in
 * one timeline — every service done for an animal, every sale's products, and
 * every invoice typed in the back office. See `findHistory` on the server for
 * what makes a row.
 *
 * Search leads the bar like the Pelanggan tab's; Periode, Jenis and Sumber sit
 * behind one `Filter (n)` — a date range carries its own Terapkan, which is a
 * panel's case (ui-rules §8).
 */
export function CustomerHistoryScreen() {
  const { items, pagination, query, loading, error, setQuery } = useCustomerHistory();

  return (
    <div className="flex flex-col gap-6">
      <CustomerModuleHeader />

      <FilterBar
        searchPlacement="leading"
        searchClassName="min-w-[12rem] flex-1"
        search={
          <FilterSearch
            value={query.search}
            onChange={(search) => setQuery({ search })}
            placeholder="Cari nama pelanggan atau hewan…"
            ariaLabel="Cari pelanggan"
            fill
          />
        }
      >
        <HistoryFilterPanel query={query} onApply={setQuery} />
      </FilterBar>

      {error && <Alert variant="error">{error}</Alert>}

      <DataTable
        columns={columnsFor(query.search)}
        rows={items}
        rowKey={(row) => row.id}
        loading={loading}
        loadingLabel="Memuat riwayat…"
        tableClassName="min-w-[64rem]"
        empty={
          <div className="flex flex-col items-center gap-1 py-10 text-center">
            <p className="font-medium text-foreground">Belum ada riwayat di sini.</p>
            <p className="max-w-md text-sm text-muted">
              Penjualan di kasir dan faktur pelanggan akan muncul di sini.
            </p>
          </div>
        }
      />

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        unit="kegiatan"
        unitPlural="kegiatan"
        onPageChange={(page) => setQuery({ page })}
      />
    </div>
  );
}

type HistoryFilters = Pick<CustomerHistoryQuery, "dateFrom" | "dateTo" | "kind" | "source">;

function HistoryFilterPanel({
  query,
  onApply,
}: {
  query: CustomerHistoryQuery;
  onApply: (next: HistoryFilters) => void;
}) {
  const applied: HistoryFilters = {
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    kind: query.kind,
    source: query.source,
  };
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  const count = [
    applied.dateFrom !== "" || applied.dateTo !== "",
    applied.kind !== "",
    applied.source !== "",
  ].filter(Boolean).length;

  function patch(change: Partial<HistoryFilters>) {
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
        onClick={() => onOpenChange(true)}
      />

      <FilterPanel
        open={open}
        onOpenChange={onOpenChange}
        onReset={() => {
          const { dateFrom, dateTo, kind, source } = DEFAULT_HISTORY_QUERY;
          onApply({ dateFrom, dateTo, kind, source });
          setOpen(false);
        }}
        onApply={() => {
          onApply(draft);
          setOpen(false);
        }}
      >
        <FilterDateRange
          layout="field"
          label="Periode"
          ariaLabel="Filter periode"
          from={draft.dateFrom}
          to={draft.dateTo}
          onApply={({ from, to }) => patch({ dateFrom: from, dateTo: to })}
        />
        <FilterSelect
          layout="field"
          label="Jenis"
          ariaLabel="Filter jenis kegiatan"
          value={draft.kind}
          options={KINDS}
          onChange={(kind) => patch({ kind })}
        />
        <FilterSelect
          layout="field"
          label="Sumber"
          ariaLabel="Filter sumber"
          value={draft.source}
          options={SOURCES}
          onChange={(source) => patch({ source })}
        />
      </FilterPanel>
    </>
  );
}
