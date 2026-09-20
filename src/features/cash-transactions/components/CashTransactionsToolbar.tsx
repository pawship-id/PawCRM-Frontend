"use client";

import { useState } from "react";
import { ListFilter } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  FilterBar,
  FilterField,
  FilterPanel,
  FilterPills,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
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
import type { ChartOfAccount } from "@/types/accounting";
import type {
  CashTransactionDirection,
  CashTransactionKind,
  CashTransactionStatus,
} from "@/types/api";

import {
  DEFAULT_CASH_TRANSACTION_STATUS,
  type CashTransactionsQuery,
} from "../query";
import { CASH_TRANSACTION_KINDS, KIND_LABEL } from "../labels";

/** The lens: which way the money went. Outside the panel, applies on click. */
const DIRECTIONS: PillOption<CashTransactionDirection | "">[] = [
  { value: "", label: "Semua" },
  { value: "in", label: "Masuk" },
  { value: "out", label: "Keluar" },
];


const STATUS_OPTIONS: FilterOption<CashTransactionStatus | "">[] = withAll(
  [
    { value: "posted", label: "Tercatat" },
    { value: "void", label: "Dibatalkan" },
  ],
  // "Termasuk dibatalkan", not "Semua status": this option is the one that puts
  // cancelled rows back on the screen, and the label should say what it does.
  "Termasuk dibatalkan",
);

type PanelFilters = Pick<
  CashTransactionsQuery,
  "dateFrom" | "dateTo" | "kinds" | "branchId" | "accountId" | "status"
>;

/**
 * What the panel's Reset returns to.
 *
 * THE ORDERING IS NOT IN HERE ANY MORE. It moved onto the column headers on
 * 20 September 2026, and a Reset inside a filter panel must not silently
 * re-sort a table somebody ordered from the headers they can see — the same
 * rule Daftar Akun's Reset follows (§8). The direction pill and a deep-linked
 * document are likewise not the panel's to touch.
 */
const CLEARED: PanelFilters = {
  dateFrom: "",
  dateTo: "",
  kinds: [],
  branchId: "",
  accountId: "",
  // BACK TO "TERCATAT", not to "". Reset returns the panel to the state it
  // opens the screen in, and hiding the cancelled rows IS that state.
  status: DEFAULT_CASH_TRANSACTION_STATUS,
};

/**
 * The Transaksi controls (§8): the Arah pill row on its own line, then search and
 * one `Filter (n)` button over Jenis · Akun Kas/Bank · Status. Periode and
 * Cabang are the page's context bar, and the ORDERING is on the column headers.
 *
 * A PANEL, on both counts — six fields, and a date range and a multi-select that
 * each hold a draft. Arah stays outside as the page's lens, is not in the count,
 * and Reset leaves it alone: it is the one choice here nobody makes by accident.
 */
export function CashTransactionsToolbar({
  query,
  cashAccounts,
  onChange,
  className,
}: {
  query: CashTransactionsQuery;
  cashAccounts: ChartOfAccount[];
  onChange: (patch: Partial<CashTransactionsQuery>) => void;
  className?: string;
}) {
  const chips: AppliedFilter[] = [];

  if (query.kinds.length > 0) {
    chips.push({
      key: "kinds",
      label: query.kinds.map((kind) => KIND_LABEL[kind] ?? kind).join(", "),
      onRemove: () => onChange({ kinds: [] }),
    });
  }
  if (query.accountId) {
    const account = cashAccounts.find((row) => row._id === query.accountId);
    chips.push({
      key: "account",
      label: account
        ? `${account.code} · ${account.name}`
        : "Akun kas/bank terpilih",
      onRemove: () => onChange({ accountId: "" }),
    });
  }
  /*
    ONLY WHEN IT IS NOT THE DEFAULT. "Tercatat" is how the list always opens, and
    a chip that never comes off says nothing — but "Dibatalkan" and "Semua
    status" both put cancelled rows on screen, which is worth a chip saying so.
  */
  if (query.status !== DEFAULT_CASH_TRANSACTION_STATUS) {
    chips.push({
      key: "status",
      label: query.status === "void" ? "Dibatalkan" : "Termasuk dibatalkan",
      onRemove: () => onChange({ status: DEFAULT_CASH_TRANSACTION_STATUS }),
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
    <div className={cn("flex flex-col gap-3", className)}>
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
        /*
          CLEARS WHAT THIS BAR OWNS, and not the context bar's period or branch.
          Reset clears what the control it belongs to conceals (§8); reaching up
          and throwing the whole page back to "Semua" would undo a choice this
          button does not appear to be about.
        */
        onClearAll={() =>
          onChange({
            kinds: [],
            accountId: "",
            status: DEFAULT_CASH_TRANSACTION_STATUS,
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
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
            kinds: query.kinds,
            branchId: query.branchId,
            accountId: query.accountId,
            status: query.status,
          }}
          cashAccounts={cashAccounts}
          onApply={(next) => {
            // Only what moved — setQuery re-queries on any new object.
            const patch: Partial<CashTransactionsQuery> = {};
            if (next.dateFrom !== query.dateFrom) patch.dateFrom = next.dateFrom;
            if (next.dateTo !== query.dateTo) patch.dateTo = next.dateTo;
            if (next.kinds.join(",") !== query.kinds.join(","))
              patch.kinds = next.kinds;
            if (next.branchId !== query.branchId) patch.branchId = next.branchId;
            if (next.accountId !== query.accountId)
              patch.accountId = next.accountId;
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
  cashAccounts,
  onApply,
}: {
  applied: PanelFilters;
  cashAccounts: ChartOfAccount[];
  onApply: (next: PanelFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /*
    PERIODE AND CABANG are not counted: they moved to the context bar above,
    where they are visible on the row — and the badge exists to pay back what a
    panel CONCEALS. The ordering is not counted either, and is no longer even
    here: it is on the column headers.
  */
  const count = [
    applied.kinds.length > 0,
    applied.accountId !== "",
    applied.status !== DEFAULT_CASH_TRANSACTION_STATUS,
  ].filter(Boolean).length;

  function onOpenChange(next: boolean) {
    if (next) setDraft(applied);
    setOpen(next);
  }

  /*
    NOT NARROWED BY THE BRANCH, unlike the channel list it replaced. A channel
    belongs to a till and a branch may be barred from it; an ACCOUNT belongs to
    the company — the same bank account pays the landlord whichever branch signed
    the lease — so filtering it by branch would hide rows that genuinely exist.
  */
  const accountOptions = withAll(
    cashAccounts.map((account) => ({
      value: account._id,
      label: `${account.code} · ${account.name}`,
    })),
    "Semua akun",
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
        <KindField
          selected={draft.kinds}
          onChange={(kinds) => setDraft((prev) => ({ ...prev, kinds }))}
        />
        <FilterSelect
          layout="field"
          label="Akun Kas/Bank"
          ariaLabel="Filter akun kas/bank"
          value={draft.accountId}
          options={accountOptions}
          searchable
          onChange={(accountId) => setDraft((prev) => ({ ...prev, accountId }))}
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
