"use client";

import { useState, type ReactNode } from "react";
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
import type { ChartOfAccount } from "@/types/accounting";
import type {
  CashTransactionDirection,
  CashTransactionStatus,
} from "@/types/api";

import {
  DEFAULT_CASH_TRANSACTION_STATUS,
  type CashTransactionsQuery,
} from "../query";
import {
  CASH_TRANSACTION_SOURCES,
  DIRECTION_TITLE,
  sourceFilterLabel,
  type CashTransactionSource,
} from "../labels";

/**
 * TIPE — which way the money went.
 *
 * IT WAS A PILL ROW ABOVE THE TABLE and moved INTO the panel on 20 September
 * 2026, on request, so the toolbar is one line. §8 calls a pill row the page's
 * lens and keeps it outside a panel; the reason it lost that argument here is
 * that the row carried no visible caption — `FilterPills` announces its name
 * only to a screen reader — so three unlabelled pills sat above the table and
 * nothing on screen said they were "Tipe". A labelled field in the panel says
 * what it is.
 *
 * TWO CONSEQUENCES, both load-bearing. It is COUNTED on `Filter (n)` now: §8
 * exempts a pill row because a row of pills with one filled in conceals
 * nothing, and the moment it went behind a button that stopped being true. And
 * Reset clears it, for the same reason — Reset clears what the control it
 * belongs to conceals.
 *
 * The labels come from `DIRECTION_TITLE`, the same two words as the cards above
 * this table, the toggle on Tambah transaksi and a transaction's own heading —
 * not a third spelling written out here.
 */
const DIRECTION_OPTIONS: FilterOption<CashTransactionDirection | "">[] =
  withAll(
    (["in", "out"] as const).map((direction) => ({
      value: direction,
      label: DIRECTION_TITLE[direction],
    })),
    "Semua tipe",
  );

/** SUMBER — one at a time, and the same vocabulary as the table's column. */
const SOURCE_OPTIONS: FilterOption<CashTransactionSource | "">[] = withAll(
  CASH_TRANSACTION_SOURCES.map((source) => ({
    value: source,
    label: sourceFilterLabel(source),
  })),
  "Semua sumber",
);

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
  | "dateFrom"
  | "dateTo"
  | "direction"
  | "source"
  | "branchId"
  | "accountId"
  | "status"
>;

/**
 * What the panel's Reset returns to.
 *
 * THE ORDERING IS NOT IN HERE ANY MORE. It moved onto the column headers on
 * 20 September 2026, and a Reset inside a filter panel must not silently
 * re-sort a table somebody ordered from the headers they can see — the same
 * rule Daftar Akun's Reset follows (§8). A deep-linked document is likewise not
 * the panel's to touch — it has no control here, and its chip is how it comes
 * off. TIPE IS IN HERE, unlike the pill row it replaced: a field the panel
 * conceals is a field the panel's Reset owns.
 */
const CLEARED: PanelFilters = {
  dateFrom: "",
  dateTo: "",
  direction: "",
  source: "",
  branchId: "",
  accountId: "",
  // BACK TO "TERCATAT", not to "". Reset returns the panel to the state it
  // opens the screen in, and hiding the cancelled rows IS that state.
  status: DEFAULT_CASH_TRANSACTION_STATUS,
};

/**
 * The Transaksi controls (§8): ONE LINE — search, then a single `Filter (n)`
 * button over Tipe · Sumber · Akun Kas & Bank · Status, then the actions.
 * Periode and Cabang are the page's context bar, and the ORDERING is on the
 * column headers.
 *
 * NOTHING SITS OUTSIDE THE BUTTON ANY MORE. Tipe was a pill row above the table
 * until 20 September 2026; see `DIRECTION_OPTIONS` for why it moved and what
 * followed from it. Every one of the four is counted on the trigger, which is
 * what makes a collapsed bar safe (§8): a filter somebody forgot is on is a
 * table they read the wrong numbers off.
 */
export function CashTransactionsToolbar({
  query,
  cashAccounts,
  onChange,
  actions,
  className,
}: {
  query: CashTransactionsQuery;
  cashAccounts: ChartOfAccount[];
  onChange: (patch: Partial<CashTransactionsQuery>) => void;
  /**
   * "Tambah transaksi", already permission-wrapped by the caller — it rides the
   * bar's own `actions` slot so it lands on the SEARCH ROW, level with
   * `Filter (n)`, rather than on the Tipe pills above it (20 September 2026, on
   * request). A `ReactNode` and not a `{label, href}` for `FilterBar`'s own
   * reason: the node is inside a `<Can>`, and permissions stay with the caller.
   */
  actions?: ReactNode;
  className?: string;
}) {
  const chips: AppliedFilter[] = [];

  if (query.direction) {
    chips.push({
      key: "direction",
      label: DIRECTION_TITLE[query.direction],
      onRemove: () => onChange({ direction: "" }),
    });
  }
  if (query.source) {
    chips.push({
      key: "source",
      label: sourceFilterLabel(query.source),
      onRemove: () => onChange({ source: "" }),
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
    <FilterBar
      className={className}
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      actions={actions}
      chips={chips}
      /*
          CLEARS WHAT THIS BAR OWNS, and not the context bar's period or branch.
          Reset clears what the control it belongs to conceals (§8); reaching up
          and throwing the whole page back to "Semua" would undo a choice this
          button does not appear to be about.
        */
      onClearAll={() =>
        onChange({
          direction: "",
          source: "",
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
          direction: query.direction,
          source: query.source,
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
          if (next.direction !== query.direction)
            patch.direction = next.direction;
          if (next.source !== query.source) patch.source = next.source;
          if (next.branchId !== query.branchId) patch.branchId = next.branchId;
          if (next.accountId !== query.accountId)
            patch.accountId = next.accountId;
          if (next.status !== query.status) patch.status = next.status;
          if (Object.keys(patch).length > 0) onChange(patch);
        }}
      />
    </FilterBar>
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

    TIPE IS COUNTED, and was not while it was a pill row: §8 exempts a pill row
    because a row of pills with one filled in, sitting in plain sight, conceals
    nothing. Behind this button it conceals everything, and a Tipe somebody
    forgot is on is half a cash book quietly missing.
  */
  const count = [
    applied.direction !== "",
    applied.source !== "",
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
        {/*
          TIPE FIRST, then SUMBER. Coarsest question first: "which way did the
          money go" halves the list before "what produced it" narrows it, and
          that is the order somebody scanning a cash book asks them in. Sumber
          leads over Akun and Status because it is the one of the three the
          table already shows a column for.
        */}
        <FilterSelect
          layout="field"
          label="Tipe"
          ariaLabel="Filter tipe"
          value={draft.direction}
          options={DIRECTION_OPTIONS}
          onChange={(direction) => setDraft((prev) => ({ ...prev, direction }))}
        />
        <FilterSelect
          layout="field"
          label="Sumber"
          ariaLabel="Filter sumber"
          value={draft.source}
          options={SOURCE_OPTIONS}
          onChange={(source) => setDraft((prev) => ({ ...prev, source }))}
        />
        <FilterSelect
          layout="field"
          label="Akun Kas & Bank"
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
