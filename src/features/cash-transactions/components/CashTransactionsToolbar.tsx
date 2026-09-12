"use client";

import { useState } from "react";
import { ListFilter } from "lucide-react";

import {
  FilterBar,
  FilterDateRange,
  FilterField,
  FilterPanel,
  FilterPills,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
  formatRangeShort,
  namedOptions,
  withAll,
  type AppliedFilter,
  type FilterOption,
  type PillOption,
} from "@/components";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  Branch,
  CashTransactionDirection,
  CashTransactionKind,
  CashTransactionSort,
  CashTransactionStatus,
  PaymentChannel,
} from "@/types/api";

import type { CashTransactionsQuery } from "../query";
import { CASH_TRANSACTION_KINDS, KIND_LABEL } from "../labels";

/** The lens: which way the money went. Outside the panel, applies on click. */
const DIRECTIONS: PillOption<CashTransactionDirection | "">[] = [
  { value: "", label: "Semua" },
  { value: "in", label: "Masuk" },
  { value: "out", label: "Keluar" },
];

/** The orderings the API names (`CASH_TRANSACTION_SORTS`), nothing more. */
const SORTS: FilterOption<CashTransactionSort>[] = [
  { value: "newest", label: "Tanggal terbaru" },
  { value: "oldest", label: "Tanggal terlama" },
  { value: "amountHighest", label: "Jumlah terbesar" },
  { value: "amountLowest", label: "Jumlah terkecil" },
];

const STATUS_OPTIONS: FilterOption<CashTransactionStatus | "">[] = withAll(
  [
    { value: "posted", label: "Tercatat" },
    { value: "void", label: "Dibatalkan" },
  ],
  "Semua status",
);

type PanelFilters = Pick<
  CashTransactionsQuery,
  "sort" | "dateFrom" | "dateTo" | "kinds" | "branchId" | "channelId" | "status"
>;

/**
 * What the panel's Reset returns to. The ordering is RESTORED, not cleared; the
 * direction pill and a deep-linked document are not the panel's to touch.
 */
const CLEARED: PanelFilters = {
  sort: "newest",
  dateFrom: "",
  dateTo: "",
  kinds: [],
  branchId: "",
  channelId: "",
  status: "",
};

/**
 * The Transaksi controls (§8): the Arah pill row on its own line, then search and
 * one `Filter (n)` button over Urutkan · Periode · Jenis · Cabang · Channel ·
 * Status.
 *
 * A PANEL, on both counts — six fields, and a date range and a multi-select that
 * each hold a draft. Arah stays outside as the page's lens, is not in the count,
 * and Reset leaves it alone: it is the one choice here nobody makes by accident.
 */
export function CashTransactionsToolbar({
  query,
  branches,
  channels,
  onChange,
}: {
  query: CashTransactionsQuery;
  branches: Branch[];
  channels: PaymentChannel[];
  onChange: (patch: Partial<CashTransactionsQuery>) => void;
}) {
  const chips: AppliedFilter[] = [];

  if (query.kinds.length > 0) {
    chips.push({
      key: "kinds",
      label: query.kinds.map((kind) => KIND_LABEL[kind] ?? kind).join(", "),
      onRemove: () => onChange({ kinds: [] }),
    });
  }
  if (query.dateFrom || query.dateTo) {
    chips.push({
      key: "period",
      label: `Tanggal ${formatRangeShort(query.dateFrom, query.dateTo)}`,
      onRemove: () => onChange({ dateFrom: "", dateTo: "" }),
    });
  }
  if (query.branchId) {
    chips.push({
      key: "branch",
      label:
        branches.find((branch) => branch._id === query.branchId)?.name ??
        "Cabang terpilih",
      onRemove: () => onChange({ branchId: "" }),
    });
  }
  if (query.channelId) {
    chips.push({
      key: "channel",
      label:
        channels.find((channel) => channel._id === query.channelId)?.name ??
        "Channel terpilih",
      onRemove: () => onChange({ channelId: "" }),
    });
  }
  if (query.status) {
    chips.push({
      key: "status",
      label: query.status === "void" ? "Dibatalkan" : "Tercatat",
      onRemove: () => onChange({ status: "" }),
    });
  }
  if (query.documentId) {
    // Only ever set by a link from a faktur. No control, so the chip is the way out.
    chips.push({
      key: "document",
      label: "Dokumen terpilih",
      onRemove: () => onChange({ documentId: "" }),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <FilterPills
        ariaLabel="Arah uang"
        value={query.direction}
        options={DIRECTIONS}
        onChange={(direction) => onChange({ direction })}
      />

      <FilterBar
        searchPlacement="leading"
        searchClassName="min-w-[12rem] flex-1"
        chips={chips}
        onClearAll={() =>
          onChange({
            kinds: [],
            dateFrom: "",
            dateTo: "",
            branchId: "",
            channelId: "",
            status: "",
            documentId: "",
          })
        }
        search={
          <FilterSearch
            value={query.search}
            onChange={(search) => onChange({ search })}
            placeholder="Cari nomor, pihak, referensi atau catatan…"
            ariaLabel="Cari transaksi"
            fill
          />
        }
      >
        <TransactionsFilterPanel
          applied={{
            sort: query.sort,
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
            kinds: query.kinds,
            branchId: query.branchId,
            channelId: query.channelId,
            status: query.status,
          }}
          branches={branches}
          channels={channels}
          onApply={(next) => {
            // Only what moved — setQuery re-queries on any new object.
            const patch: Partial<CashTransactionsQuery> = {};
            if (next.sort !== query.sort) patch.sort = next.sort;
            if (next.dateFrom !== query.dateFrom) patch.dateFrom = next.dateFrom;
            if (next.dateTo !== query.dateTo) patch.dateTo = next.dateTo;
            if (next.kinds.join(",") !== query.kinds.join(","))
              patch.kinds = next.kinds;
            if (next.branchId !== query.branchId) patch.branchId = next.branchId;
            if (next.channelId !== query.channelId)
              patch.channelId = next.channelId;
            if (next.status !== query.status) patch.status = next.status;
            if (Object.keys(patch).length > 0) onChange(patch);
          }}
        />
      </FilterBar>
    </div>
  );
}

function TransactionsFilterPanel({
  applied,
  branches,
  channels,
  onApply,
}: {
  applied: PanelFilters;
  branches: Branch[];
  channels: PaymentChannel[];
  onApply: (next: PanelFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  // Urutkan is never unset, so it is not counted (§8).
  const count = [
    applied.dateFrom !== "" || applied.dateTo !== "",
    applied.kinds.length > 0,
    applied.branchId !== "",
    applied.channelId !== "",
    applied.status !== "",
  ].filter(Boolean).length;

  function onOpenChange(next: boolean) {
    if (next) setDraft(applied);
    setOpen(next);
  }

  // A picked branch narrows the channels to its own and the tenant-wide ones —
  // the same rule the server uses to decide which channels a branch may use.
  const channelOptions = withAll(
    namedOptions(
      channels.filter(
        (channel) =>
          !draft.branchId ||
          !channel.branchId ||
          channel.branchId === draft.branchId,
      ),
    ),
    "Semua channel",
  );

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
          onApply(CLEARED);
          setOpen(false);
        }}
        onApply={() => {
          onApply(draft);
          setOpen(false);
        }}
      >
        <FilterSelect
          layout="field"
          label="Urutkan"
          ariaLabel="Urutkan"
          value={draft.sort}
          options={SORTS}
          unsetValue="newest"
          onChange={(sort) => setDraft((prev) => ({ ...prev, sort }))}
        />
        <FilterDateRange
          layout="field"
          label="Periode"
          ariaLabel="Periode"
          from={draft.dateFrom}
          to={draft.dateTo}
          onApply={({ from, to }) =>
            setDraft((prev) => ({ ...prev, dateFrom: from, dateTo: to }))
          }
        />
        <KindField
          selected={draft.kinds}
          onChange={(kinds) => setDraft((prev) => ({ ...prev, kinds }))}
        />
        <FilterSelect
          layout="field"
          label="Cabang"
          ariaLabel="Filter cabang"
          value={draft.branchId}
          options={withAll(namedOptions(branches), "Semua cabang")}
          onChange={(branchId) => setDraft((prev) => ({ ...prev, branchId }))}
        />
        <FilterSelect
          layout="field"
          label="Channel"
          ariaLabel="Filter channel"
          value={draft.channelId}
          options={channelOptions}
          onChange={(channelId) => setDraft((prev) => ({ ...prev, channelId }))}
        />
        <FilterSelect
          layout="field"
          label="Status"
          ariaLabel="Filter status"
          value={draft.status}
          options={STATUS_OPTIONS}
          onChange={(status) => setDraft((prev) => ({ ...prev, status }))}
        />
      </FilterPanel>
    </>
  );
}

/**
 * Jenis — several at once ("penerimaan piutang and pemasukan lain").
 *
 * NOT A FilterMultiSelect, for the reason ProductsToolbar's warehouse field
 * gives: that control carries its own Terapkan, and inside a panel that already
 * has one it would ask the same question twice. Same shell (FilterField +
 * FilterTrigger), so it sits in the panel like the selects around it. Nothing
 * ticked means every kind.
 */
function KindField({
  selected,
  onChange,
}: {
  selected: CashTransactionKind[];
  onChange: (kinds: CashTransactionKind[]) => void;
}) {
  const label =
    selected.length === 0
      ? "Semua jenis"
      : selected.length === 1
        ? KIND_LABEL[selected[0]]
        : `${selected.length} jenis`;

  function toggle(kind: CashTransactionKind) {
    onChange(
      selected.includes(kind)
        ? selected.filter((current) => current !== kind)
        : // Kept in the canonical order, so the chip reads the same every time.
          CASH_TRANSACTION_KINDS.filter(
            (current) => current === kind || selected.includes(current),
          ),
    );
  }

  return (
    <FilterField label="Jenis">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <FilterTrigger
            layout="field"
            label="Jenis"
            value={label}
            active={selected.length > 0}
            aria-label={`Jenis ${label}`}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuCheckboxItem
            checked={selected.length === 0}
            onCheckedChange={() => onChange([])}
          >
            Semua jenis
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {CASH_TRANSACTION_KINDS.map((kind) => (
            <DropdownMenuCheckboxItem
              key={kind}
              checked={selected.includes(kind)}
              onCheckedChange={() => toggle(kind)}
            >
              {KIND_LABEL[kind]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </FilterField>
  );
}
