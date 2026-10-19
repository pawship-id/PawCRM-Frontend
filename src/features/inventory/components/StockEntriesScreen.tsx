"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, ListFilter, Plus, RotateCcw } from "lucide-react";

import {
  Alert,
  DataTable,
  FilterBar,
  HighlightText,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
  Pagination,
  namedOptions,
  withAll,
  type DataTableColumn,
  type SortOptions,
  RowLinkMenu,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type {
  StockEntry,
  StockEntryKind,
  StockEntrySort,
} from "@/types/inventory";
import type { Branch, Warehouse } from "@/types/api";

import { ownerBranchOf, warehousesUnder } from "../hooks/useBranchScope";
import { useStockEntries } from "../hooks/useStockEntries";
import { excerptAround } from "../utils/excerpt";

/**
 * The list of hand-typed stock documents — one kind per screen.
 *
 * WHY A LIST EXISTS AT ALL. Both of these screens used to open straight onto a
 * form, which meant a correction could be made and then never found again: the
 * movements landed in the stock card one product at a time, and one adjustment
 * fans out across every lot FEFO draws from, so nothing said how many
 * corrections a shop had made or why. A document with a number, listed, is what
 * an audit walks back through.
 *
 * ONE COMPONENT, TWO KINDS, because the two lists differ only in their words:
 * the columns, the filters, the paging and the empty state are the same table
 * over the same shape. The strings that DO differ are the ones a reader uses to
 * tell the screens apart, so they are named per kind rather than derived — a
 * label assembled from the kind would eventually read "Dokumen opening_balance
 * baru".
 *
 * WHAT THE ROW CARRIES. Seven columns: when, which document, where, how many
 * products, why, and the way in. The author is on the DETAIL — it is not what a
 * reader scans a list for.
 *
 * THE REASON IS CUT AROUND THE MATCH, not from the end. The server searches it
 * as well as the number, so a term matching deep in a long sentence would
 * otherwise return a row with nothing visible to explain why it is a result.
 * See `excerptAround`.
 *
 * THE MOVEMENT COUNT MOVED THERE TOO. It is the number that makes FEFO visible —
 * three rows under a one-line document is the document saying "this came out of
 * three lots" — but it only means anything next to the lines it is being
 * compared against, and those are on the detail.
 *
 * ONE WAY IN PER ROW. The number is plain text and Detail is the affordance:
 * two links to the same destination in one row is one of them for nothing.
 */

const COPY: Record<
  StockEntryKind,
  {
    newHref: string;
    newLabel: string;
    /** The tab's own grant (14 Oct 2026) — its create opens the button. */
    feature: "stockAdjustments" | "openingStock";
    empty: string;
    emptyHint: string;
  }
> = {
  adjustment: {
    newHref: "/dashboard/inventory/adjustments/new",
    newLabel: "Penyesuaian baru",
    feature: "stockAdjustments",
    empty: "Belum ada penyesuaian",
    emptyHint:
      "Koreksi satu barang atau beberapa sekaligus — rusak, hilang, atau terpakai sendiri.",
  },
  opening_balance: {
    newHref: "/dashboard/inventory/opening-stock/new",
    newLabel: "Stok awal baru",
    feature: "openingStock",
    empty: "Belum ada pencatatan stok awal",
    emptyHint:
      "Untuk produk yang sudah terdaftar tapi belum pernah punya stok di gudang itu.",
  },
};

/* WHAT THE `notes` COLUMN IS CALLED, on both kinds. Either document carries a
   free note its author writes for whoever audits it later, and calling that
   "Alasan" promised a reason from a fixed list neither form ever had. */
const NOTES_LABEL = "Catatan";

/** Where a row's Detail lands — each kind reads its own route. */
function detailHref(kind: StockEntryKind, id: string): string {
  const base =
    kind === "adjustment"
      ? "/dashboard/inventory/adjustments"
      : "/dashboard/inventory/opening-stock";

  return `${base}/${id}`;
}

/**
 * THE LIST SORTS FROM ITS COLUMN HEADERS (BO, 19 October 2026), on the server:
 * each sortable column maps to the two names ENTRY_SORTS knows for it, and a
 * click re-fetches page 1. Newest date and most products first; A first for a
 * number. Cabang, Gudang and Catatan are plain, on BO's call; Aksi is a way
 * in, not a value.
 */
const SORT_OPTIONS: SortOptions<StockEntrySort> = {
  date: { asc: "oldest", desc: "newest", first: "desc" },
  number: { asc: "numberAsc", desc: "numberDesc" },
  lineCount: { asc: "lineCountAsc", desc: "lineCountDesc", first: "desc" },
};

/**
 * Everything the panel edits, as one draft. The ordering is NOT here: it lives
 * on the headers, and a Reset inside a filter panel must not silently re-sort a
 * table somebody ordered from the headers it can see (docs/ui-rules.md §8).
 */
interface PanelFilters {
  branchId: string;
  warehouseId: string;
}

/** What Reset returns to — the query's own defaults, not "empty". */
const CLEARED: PanelFilters = {
  branchId: "",
  warehouseId: "",
};

/**
 * Tanggal, Nomor, Cabang, Gudang, Produk, Catatan, Aksi. A function of the kind
 * (Detail's route) and the live search term (the highlight).
 */
function entryColumns(
  kind: StockEntryKind,
  search: string,
): DataTableColumn<StockEntry>[] {
  return [
    {
      id: "date",
      header: "Tanggal",
      cellClassName: "tabular-nums whitespace-nowrap",
      cell: (entry) => formatDate(entry.entryDate),
    },
    {
      id: "number",
      header: "Nomor",
      cellClassName: "font-medium tabular-nums",
      /* THE MATCH, MARKED. The server searches the number and the note; the
         number is the only one of the two shown whole, so it is where a reader
         confirms the row in front of them is the one their term found.

         THE LIVE TERM, not the debounced one — the same term every other
         highlighted list in this repo passes. For the length of one debounce
         the marks describe what is being typed while the rows still answer the
         term before it; they agree again the moment the fetch lands. */
      cell: (entry) => (
        <HighlightText text={entry.entryNumber} query={search} />
      ),
    },
    {
      id: "branch",
      header: "Cabang",
      cellClassName: "text-muted",
      cell: (entry) =>
        (typeof entry.branchId === "string" ? null : entry.branchId)?.name ??
        "—",
    },
    {
      id: "warehouse",
      header: "Gudang",
      cell: (entry) =>
        (typeof entry.warehouseId === "string" ? null : entry.warehouseId)
          ?.name ?? "—",
    },
    {
      id: "lineCount",
      header: "Produk",
      align: "right",
      cell: (entry) => entry.lineCount,
    },
    {
      id: "notes",
      header: NOTES_LABEL,
      cellClassName: "max-w-xs text-muted",
      cell: (entry) =>
        entry.notes ? (
          <HighlightText
            text={excerptAround(entry.notes, search)}
            query={search}
          />
        ) : (
          "—"
        ),
    },
    {
      id: "actions",
      header: "Aksi",
      align: "right",
      // Behind the row's kebab, like every other Inventori list (BO, 19
      // October 2026).
      cell: (entry) => (
        <RowLinkMenu
          name={entry.entryNumber}
          links={[
            {
              href: detailHref(kind, entry._id),
              label: "Detail",
              icon: <Eye />,
            },
          ]}
        />
      ),
    },
  ];
}

export function StockEntriesScreen({ kind }: { kind: StockEntryKind }) {
  const {
    entries,
    pagination,
    branches,
    warehouses,
    query,
    loading,
    error,
    setQuery,
    refetch,
  } = useStockEntries(kind);

  const copy = COPY[kind];
  const columns = entryColumns(kind, query.search);
  const filtered =
    query.search.trim() !== "" ||
    query.branchId !== "" ||
    query.warehouseId !== "";

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="error">
          <span className="flex flex-wrap items-center gap-3">
            {error}
            <Button variant="secondary" size="sm" onClick={refetch}>
              <RotateCcw className="size-4" />
              Coba lagi
            </Button>
          </span>
        </Alert>
      )}

      <FilterBar
        searchPlacement="leading"
        searchClassName="min-w-[12rem] flex-1"
        search={
          <FilterSearch
            value={query.search}
            onChange={(search) => setQuery({ search })}
            // Names the two fields the server actually matches, so the box does
            // not promise a search over lines it never runs.
            placeholder={`Cari nomor atau ${NOTES_LABEL.toLowerCase()}…`}
            ariaLabel="Cari dokumen"
            fill
          />
        }
        actions={
          <Can feature={copy.feature} action="create">
            <Button asChild>
              <Link href={copy.newHref}>
                <Plus className="size-4" />
                {copy.newLabel}
              </Link>
            </Button>
          </Can>
        }
      >
        {/* BEHIND ONE BUTTON, like every other list in Inventory and
            Purchasing. On field count alone §8 would put these two on the bar
            and apply them on click — but these screens are read one after
            another by the same person in the same sitting, and a row that
            spells its filters out here while the four screens beside it hide
            theirs is one arrangement to relearn per screen. The count on the
            trigger is what makes hiding them safe.

            BOTH ARE OFFERED because branch and warehouse are not 1:1: a central
            warehouse can serve three branches, and a branch can hold two
            warehouses. Neither narrows to the other. */}
        <StockEntriesFilterPanel
          applied={{
            branchId: query.branchId,
            warehouseId: query.warehouseId,
          }}
          branches={branches}
          warehouses={warehouses}
          onApply={(next) => {
            // Only what actually moved: the list query is keyed on these, so
            // posting both back would re-fetch after a Terapkan that changed
            // nothing.
            const patch: Partial<typeof query> = {};
            if (next.branchId !== query.branchId)
              patch.branchId = next.branchId;
            if (next.warehouseId !== query.warehouseId)
              patch.warehouseId = next.warehouseId;
            if (Object.keys(patch).length > 0) setQuery(patch);
          }}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={entries}
        rowKey={(entry) => entry._id}
        sort={{
          value: query.sort,
          options: SORT_OPTIONS,
          onChange: (sort) => setQuery({ sort }),
        }}
        loading={loading}
        empty={
          <div className="flex flex-col items-center gap-1 py-10 text-center">
            <p className="font-medium text-foreground">
              {filtered ? "Tidak ada yang cocok dengan filter ini" : copy.empty}
            </p>
            <p className="max-w-md text-sm text-muted">
              {filtered
                ? "Coba ubah kata kunci, cabang, atau gudangnya."
                : copy.emptyHint}
            </p>
          </div>
        }
      />

      {pagination.totalPages > 1 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          unit="dokumen"
          unitPlural="dokumen"
          onPageChange={(page) => setQuery({ page })}
        />
      )}
    </div>
  );
}

/**
 * Cabang and Gudang, behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8) — while Reset
 * clears and re-queries in the same click, because a Reset that needed a second
 * confirmation is a button that appears not to work.
 */
function StockEntriesFilterPanel({
  applied,
  branches,
  warehouses,
  onApply,
}: {
  applied: PanelFilters;
  branches: Branch[];
  warehouses: Warehouse[];
  onApply: (next: PanelFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list.
   *
   * THE SEARCH IS NOT COUNTED — it is on the bar with its own text visible, and
   * a badge exists to pay back what the panel CONCEALS.
   *
   * The ordering is not in the panel at all — it is on the column headers.
   */
  const count = [applied.branchId !== "", applied.warehouseId !== ""].filter(
    Boolean,
  ).length;

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft.
    if (next) setDraft(applied);
    setOpen(next);
  }

  const scoped = warehousesUnder(draft.branchId, warehouses);

  /**
   * THE OTHER DIRECTION, and it is not symmetrical.
   *
   * A warehouse pinned to one branch ANSWERS the branch question — see
   * `ownerBranchOf`, which the opname filter reads the same way.
   *
   * THE SHARED WAREHOUSE CHANGES NOTHING. It serves every branch, so there is no
   * single answer to fill in; guessing one would narrow the list to a third of
   * what was asked for. The branch stays where the user left it until the user
   * moves it.
   *
   * "Semua gudang" also lands here and is left alone for the same reason: it
   * names no owner, so it has no branch to volunteer.
   */
  function pickWarehouse(warehouseId: string) {
    const owner = ownerBranchOf(warehouseId, warehouses);

    setDraft((prev) => ({
      ...prev,
      warehouseId,
      branchId: owner ?? prev.branchId,
    }));
  }

  /**
   * A branch narrows the field below it, so the warehouse already chosen has to
   * be re-checked against the new list — a value the picker no longer offers
   * would sit on the trigger as a raw id and send the pair no document matches.
   * Kept when it survives, because the central warehouse serves every branch and
   * losing it on each branch change would be a choice undone for nothing.
   */
  function pickBranch(branchId: string) {
    setDraft((prev) => ({
      ...prev,
      branchId,
      warehouseId: warehousesUnder(branchId, warehouses).some(
        (warehouse) => warehouse._id === prev.warehouseId,
      )
        ? prev.warehouseId
        : "",
    }));
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
          label="Cabang"
          ariaLabel="Filter cabang"
          value={draft.branchId}
          options={withAll(namedOptions(branches), "Semua cabang")}
          onChange={pickBranch}
        />
        <FilterSelect
          layout="field"
          label="Gudang"
          ariaLabel="Filter gudang"
          value={draft.warehouseId}
          options={withAll(namedOptions(scoped), "Semua gudang")}
          onChange={pickWarehouse}
        />
      </FilterPanel>
    </>
  );
}

/** "19 Agu 2026" — the format every other inventory list uses. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
