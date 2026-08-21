"use client";

import { useState } from "react";
import Link from "next/link";
import { ListFilter, Plus, RotateCcw } from "lucide-react";

import {
  Alert,
  FilterBar,
  HighlightText,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
  Pagination,
  Spinner,
  namedOptions,
  withAll,
  type FilterOption,
} from "@/components";
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
import type { StockTransferSort } from "@/types/inventory";
import type { Warehouse } from "@/types/api";

import { useStockTransfers } from "../hooks/useStockTransfers";
import { excerptAround } from "../utils/excerpt";

/**
 * The list of stock transfers — the screen this route opens on.
 *
 * WHY A LIST EXISTS AT ALL. This route used to open straight onto the form, the
 * same way the adjustment route once did, and a transfer is the posting that
 * suffers most from it: it writes no journal and mints no document number, so
 * once the form was cleared the only trace was a pair of rows on two different
 * stock cards. "Apa saja yang dibawa ke bazar Sabtu lalu" was a question the
 * module could not answer, even though it had deliberately written the whole
 * thing as ONE posting under one correlation id precisely so that it could.
 *
 * THE GROUPING IS THE SERVER'S — `GET /stock-movements/transfers`, not the
 * ledger filtered to `transfer_manual`. A transfer has no document to page, so
 * paging its rows would put one transfer on two pages, each showing half its
 * lots. See `useStockTransfers`.
 *
 * ONE COUNT ON THE ROW, NOT TWO. "Produk" is what somebody typed. How many lots
 * FEFO drew from to satisfy it is a fact about the allocation rather than about
 * the transfer, and it was answering a question nobody asks from a list — it now
 * lives on the detail, beside the lots it counts.
 *
 * "Nilai" IS NOT A JOURNAL FIGURE, and the footnote under the table says so. A
 * transfer moves goods the tenant already owns, so total inventory value does
 * not change and double-entry has nothing to record. The number answers "berapa
 * nilai barang yang saya kirim ke sana", which is what somebody loading a van
 * actually wants to know.
 */

/**
 * The orderings the API names, and only those. A transfer is an event, so the
 * axis is time; ranking by how much moved is a report, not this list.
 */
const SORTS: FilterOption<StockTransferSort>[] = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
];

/** Everything the panel edits, as one draft. */
interface PanelFilters {
  sort: StockTransferSort;
  warehouseId: string;
}

/**
 * What Reset returns to — the query's own defaults, not "empty". The ordering
 * goes back to `newest` rather than being cleared: a list with no ordering is
 * not a thing, and Reset means "back to how this screen opens".
 */
const CLEARED: PanelFilters = { sort: "newest", warehouseId: "" };

/** Tanggal, Dari, Ke, Produk, Catatan, Aksi. */
const COLUMN_COUNT = 6;

export function StockTransfersScreen() {
  const {
    transfers,
    pagination,
    warehouses,
    query,
    loading,
    error,
    setQuery,
    refetch,
  } = useStockTransfers();

  const filtered = query.search.trim() !== "" || query.warehouseId !== "";

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
            // Names the one field the server actually matches: a transfer has no
            // document number to look for, because it has no document.
            placeholder="Cari catatan transfer…"
            ariaLabel="Cari transfer"
            fill
          />
        }
        actions={
          <Can feature="stockMovements" action="create">
            <Button asChild>
              <Link href="/dashboard/inventory/transfers/new">
                <Plus className="size-4" />
                Transfer baru
              </Link>
            </Button>
          </Can>
        }
      >
        {/* BEHIND ONE BUTTON, like every other list in Inventory. This filter
            used to stand on the bar and apply on click, which §8 allows while
            there is only one of it — the ordering makes two, and two combined
            fields are what a panel is for. The count on the trigger is what
            makes hiding them safe.

            ONE FIELD FOR BOTH ENDS, because the server matches either: somebody
            asking what passed through Gudang Bazar rarely knows, or cares, which
            end theirs was. Two fields would mostly be filled in wrongly.

            INACTIVE WAREHOUSES STAY. This is a READ, and a location closed last
            month still owns the transfers written there. The FORM takes the
            opposite view and offers active warehouses only — it has to, because
            the API refuses a movement at a closed one. */}
        <TransfersFilterPanel
          applied={{ sort: query.sort, warehouseId: query.warehouseId }}
          warehouses={warehouses}
          onApply={(next) => {
            // Only what actually moved: the list query is keyed on these, so
            // posting both back would re-fetch after a Terapkan that changed
            // nothing.
            const patch: Partial<typeof query> = {};
            if (next.sort !== query.sort) patch.sort = next.sort;
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
              <TableHead>Dari</TableHead>
              <TableHead>Ke</TableHead>
              <TableHead className="text-right">Produk</TableHead>
              <TableHead>Catatan</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
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

            {!loading && transfers.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT}>
                  <div className="flex flex-col items-center gap-1 py-10 text-center">
                    <p className="font-medium text-foreground">
                      {filtered
                        ? "Tidak ada yang cocok dengan filter ini"
                        : "Belum ada transfer"}
                    </p>
                    <p className="max-w-md text-sm text-muted">
                      {filtered
                        ? "Coba ubah kata kunci atau gudangnya."
                        : "Pindahkan barang antar gudang — misalnya menyiapkan stok untuk bazar. Satu transfer boleh membawa beberapa produk sekaligus."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              transfers.map((transfer) => (
                <TableRow key={transfer.transferId}>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {formatDate(transfer.transferredAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {transfer.fromWarehouseName ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {transfer.toWarehouseName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {transfer.productCount}
                  </TableCell>
                  {/* THE MATCH, MARKED — and the cut follows it.
                      `notes` is the ONLY thing the server searches here, so a
                      row on screen is a row this cell explains. CSS truncation
                      cuts from the end regardless of where the term is, which
                      would answer a search for a word in the middle of a long
                      note with sixty characters that do not contain it. */}
                  <TableCell className="max-w-xs text-muted">
                    {transfer.notes ? (
                      <HighlightText
                        text={excerptAround(transfer.notes, query.search)}
                        query={query.search}
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* THE ONLY WAY IN, like the stock-entry list beside it. The
                        date used to carry the link because a transfer has no
                        number to link from; a named action says where it goes
                        without the reader having to try the date to find out. */}
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        href={`/dashboard/inventory/transfers/${transfer.transferId}`}
                        aria-label={`Detail transfer ${formatDate(transfer.transferredAt)}`}
                      >
                        Detail
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* WHAT THIS LIST DOES NOT CARRY, and why. A transfer's worth is a
          dozen products at their own averages; one figure in a cell can neither
          be checked nor traced to a product without opening the row anyway. The
          value moved to the detail, a line at a time — and the sentence that
          keeps it from being read as a journal figure went with it. */}
      <p className="text-xs text-muted">
        Buka Detail untuk melihat barang apa saja yang pindah, dari batch mana,
        berapa nilainya, dan siapa yang mencatatnya.
      </p>

      {pagination.totalPages > 1 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          unit="transfer"
          unitPlural="transfer"
          onPageChange={(page) => setQuery({ page })}
        />
      )}
    </div>
  );
}

/**
 * Urutkan and Gudang, behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8) — while Reset
 * clears and re-queries in the same click, because a Reset that needed a second
 * confirmation is a button that appears not to work.
 */
function TransfersFilterPanel({
  applied,
  warehouses,
  onApply,
}: {
  applied: PanelFilters;
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
   * NEITHER IS THE ORDERING, per docs/ui-rules.md §8. Every list has one, so
   * counting it would put a standing number over an unnarrowed list and teach
   * people to ignore the badge — the one thing that makes a collapsed filter
   * safe. It changes what the top of the list is, not what is in it.
   */
  const count = applied.warehouseId !== "" ? 1 : 0;
  const label = count === 0 ? "Filter" : `Filter (${count})`;

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft.
    if (next) setDraft(applied);
    setOpen(next);
  }

  return (
    <>
      {/* THE ACCESSIBLE NAME CARRIES THE COUNT TOO. The badge is what pays back
          what the button conceals, and a trigger whose visible text says
          "Filter (1)" while its name says "Filter" pays it back to sighted
          readers only — the collapsed filter is exactly as easy to forget
          either way. */}
      <FilterTrigger
        label={label}
        active={count > 0}
        icon={<ListFilter className="size-4" />}
        aria-label={label}
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
        {/* LEADS THE STACK: it is the one field always set, and the only one
            that changes what the top of the list is rather than what is in it. */}
        <FilterSelect
          layout="field"
          label="Urutkan"
          ariaLabel="Urutkan"
          value={draft.sort}
          options={SORTS}
          unsetValue="newest"
          onChange={(sort) => setDraft((prev) => ({ ...prev, sort }))}
        />

        <FilterSelect
          layout="field"
          label="Gudang"
          ariaLabel="Filter gudang — asal maupun tujuan"
          value={draft.warehouseId}
          options={withAll(namedOptions(warehouses), "Semua gudang")}
          onChange={(warehouseId) =>
            setDraft((prev) => ({ ...prev, warehouseId }))
          }
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
