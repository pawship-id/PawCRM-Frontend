"use client";

import { useState } from "react";
import Link from "next/link";
import { ListFilter, Plus, RotateCcw } from "lucide-react";

import {
  Alert,
  FilterBar,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
  Pagination,
  Spinner,
  namedOptions,
  withAll,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can } from "@/features/permissions";
import type { StockEntryKind } from "@/types/inventory";
import type { Branch, Warehouse } from "@/types/api";

import { useStockEntries } from "../hooks/useStockEntries";

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
 * THE MOVEMENT COUNT IS A COLUMN, and it is the one number here that does not
 * appear on any other screen: three rows under a one-line document is the
 * document saying "this came out of three lots". A reader who expects one row
 * per line learns FEFO exists by seeing it.
 */

const COPY: Record<
  StockEntryKind,
  {
    newHref: string;
    newLabel: string;
    feature: "stockMovements" | "products";
    empty: string;
    emptyHint: string;
  }
> = {
  adjustment: {
    newHref: "/dashboard/inventory/adjustments/new",
    newLabel: "Penyesuaian baru",
    feature: "stockMovements",
    empty: "Belum ada penyesuaian",
    emptyHint:
      "Koreksi satu barang atau beberapa sekaligus — rusak, hilang, atau terpakai sendiri.",
  },
  opening_balance: {
    newHref: "/dashboard/inventory/opening-stock/new",
    newLabel: "Stok awal baru",
    feature: "products",
    empty: "Belum ada pencatatan stok awal",
    emptyHint:
      "Untuk produk yang sudah terdaftar tapi belum pernah punya stok di gudang itu.",
  },
};

/** Tanggal, Nomor, Cabang, Gudang, Baris, Pergerakan, Alasan, Oleh. */
const COLUMN_COUNT = 8;

/** Everything the panel edits, as one draft. */
interface PanelFilters {
  branchId: string;
  warehouseId: string;
}

/** What Reset returns to — the query's own defaults, not "empty". */
const CLEARED: PanelFilters = { branchId: "", warehouseId: "" };

/**
 * The warehouses a chosen branch may have posted at: its own, plus the shared
 * central one (`defaultBranchId: null`, which belongs to no branch and serves
 * all of them). A warehouse pinned to another branch is dropped — that pair
 * describes no document, so offering it would only produce an empty table.
 *
 * UNDER "Semua cabang" THE WHOLE LIST STANDS. This is the mirror image of
 * `warehousesForBranch`, which the create forms use and which returns NOTHING
 * before a branch is named: there, an unscoped warehouse could be chosen and
 * then silently invalidated by the branch picked after it. A filter has no such
 * risk and the opposite default — "no branch chosen" means every branch, so it
 * must mean every warehouse too.
 *
 * INACTIVE WAREHOUSES STAY. This is a READ: a location closed last month still
 * owns the documents written there, and a filter that could not reach them would
 * hide that history from the audit that went looking for it.
 */
function warehousesUnder(branchId: string, warehouses: Warehouse[]) {
  if (branchId === "") return warehouses;

  return warehouses.filter(
    (warehouse) =>
      warehouse.defaultBranchId === branchId ||
      warehouse.defaultBranchId === null,
  );
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
            placeholder="Cari nomor atau alasan…"
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
          applied={{ branchId: query.branchId, warehouseId: query.warehouseId }}
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

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Nomor</TableHead>
              <TableHead>Cabang</TableHead>
              <TableHead>Gudang</TableHead>
              <TableHead className="text-right">Baris</TableHead>
              <TableHead className="text-right">Pergerakan</TableHead>
              <TableHead>Alasan</TableHead>
              <TableHead>Oleh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT}>
                  <span className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
                    <Spinner /> Memuat…
                  </span>
                </TableCell>
              </TableRow>
            )}

            {!loading && entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT}>
                  <div className="flex flex-col items-center gap-1 py-10 text-center">
                    <p className="font-medium text-foreground">
                      {filtered
                        ? "Tidak ada yang cocok dengan filter ini"
                        : copy.empty}
                    </p>
                    <p className="max-w-md text-sm text-muted">
                      {filtered
                        ? "Coba ubah kata kunci, cabang, atau gudangnya."
                        : copy.emptyHint}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              entries.map((entry) => {
                const branch =
                  typeof entry.branchId === "string" ? null : entry.branchId;
                const warehouse =
                  typeof entry.warehouseId === "string"
                    ? null
                    : entry.warehouseId;
                const author =
                  typeof entry.createdBy === "string" ||
                  entry.createdBy === null
                    ? null
                    : entry.createdBy;

                return (
                  <TableRow key={entry._id}>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {formatDate(entry.entryDate)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`${
                          kind === "adjustment"
                            ? "/dashboard/inventory/adjustments"
                            : "/dashboard/inventory/opening-stock"
                        }/${entry._id}`}
                        className="font-medium tabular-nums text-primary hover:underline"
                      >
                        {entry.entryNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted">
                      {branch?.name ?? "—"}
                    </TableCell>
                    <TableCell>{warehouse?.name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.lineCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* FEFO made visible: more rows than lines means the
                          withdrawal was drawn from several lots. */}
                      <Badge variant="outline">
                        {entry.movementIds?.length ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted">
                      {entry.notes ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted">
                      {author?.name ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

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
   * How many filters are narrowing the list. The search is not counted — it is
   * on the bar with its own text visible, and a badge exists to pay back what
   * the panel CONCEALS.
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
   * A warehouse pinned to one branch ANSWERS the branch question — "documents at
   * Gudang Timur" and "documents at Gudang Timur under any branch" are the same
   * set — so the field above fills itself in rather than sitting on "Semua
   * cabang" while the reader wonders whether it is still open.
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
    const owner =
      warehouses.find((warehouse) => warehouse._id === warehouseId)
        ?.defaultBranchId ?? null;

    setDraft((prev) => ({
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
