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
import type {
  StockTransferSort,
  StockTransferStatus,
} from "@/types/inventory";
import type { Warehouse } from "@/types/api";

import { useStockTransfers } from "../hooks/useStockTransfers";
import { excerptAround } from "../utils/excerpt";
import { StockTransferStatusBadge } from "./StockTransferStatusBadge";

/**
 * The list of stock transfers — the screen this route opens on.
 *
 * A TRANSFER IS A NUMBERED DOCUMENT NOW, with a status: "Belum diterima" while
 * the goods are on the road and can still be corrected, "Diterima" once they
 * have landed, "Dibatalkan" when it was undone first. The list leads with that
 * number and that status because they are what a storekeeper looks a transfer up
 * by — the number is the one printed on the surat jalan in the driver's hand.
 *
 * "Belum diterima" IS A LENS AS WELL AS A LABEL. The status filter is what turns
 * this list into the receiving warehouse's to-do: what has been sent to me and
 * is not here yet.
 *
 * ONE COUNT ON THE ROW, NOT TWO. "Produk" is what somebody typed. How many lots
 * FEFO drew from to satisfy it is a fact about the allocation rather than about
 * the transfer, and it lives on the detail, beside the lots it counts.
 *
 * NO "Nilai" COLUMN. A transfer's worth is a dozen products at their own
 * averages; one figure in a cell can neither be checked nor traced to a product
 * without opening the row anyway, so it lives on the detail, a line at a time —
 * with the sentence that keeps it from being read as a journal figure.
 */

/**
 * The orderings the API names, and only those. A transfer is an event, so the
 * axis is time; ranking by how much moved is a report, not this list.
 */
const SORTS: FilterOption<StockTransferSort>[] = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "numberDesc", label: "No. transfer, terbesar dulu" },
  { value: "numberAsc", label: "No. transfer, terkecil dulu" },
];

/**
 * Where the goods are. "Belum diterima" leads the list of states, because it is
 * the one a person opens this screen to find.
 */
const STATUSES: FilterOption<StockTransferStatus>[] = [
  { value: "in_transit", label: "Belum diterima" },
  { value: "received", label: "Diterima" },
  { value: "cancelled", label: "Dibatalkan" },
];

/** Everything the panel edits, as one draft. */
interface PanelFilters {
  sort: StockTransferSort;
  warehouseId: string;
  status: StockTransferStatus | "";
}

/**
 * What Reset returns to — the query's own defaults, not "empty". The ordering
 * goes back to `newest` rather than being cleared: a list with no ordering is
 * not a thing, and Reset means "back to how this screen opens".
 */
const CLEARED: PanelFilters = { sort: "newest", warehouseId: "", status: "" };

/** No. transfer, Tanggal, Dari, Ke, Produk, Status, Catatan, Aksi. */
const COLUMN_COUNT = 8;

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

  const filtered =
    query.search.trim() !== "" ||
    query.warehouseId !== "" ||
    query.status !== "";

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
            // Names the two fields the server actually matches.
            placeholder="Cari no. transfer atau catatan…"
            ariaLabel="Cari transfer"
            fill
          />
        }
        actions={
          <Can feature="stockTransfers" action="create">
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
          applied={{
            sort: query.sort,
            warehouseId: query.warehouseId,
            status: query.status,
          }}
          warehouses={warehouses}
          onApply={(next) => {
            // Only what actually moved: the list query is keyed on these, so
            // posting all back would re-fetch after a Terapkan that changed
            // nothing.
            const patch: Partial<typeof query> = {};
            if (next.sort !== query.sort) patch.sort = next.sort;
            if (next.warehouseId !== query.warehouseId)
              patch.warehouseId = next.warehouseId;
            if (next.status !== query.status) patch.status = next.status;
            if (Object.keys(patch).length > 0) setQuery(patch);
          }}
        />
      </FilterBar>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No. transfer</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Dari</TableHead>
              <TableHead>Ke</TableHead>
              <TableHead className="text-right">Produk</TableHead>
              <TableHead>Status</TableHead>
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
                        ? "Coba ubah kata kunci, gudang, atau statusnya."
                        : "Pindahkan barang antar gudang — misalnya menyiapkan stok untuk bazar. Satu transfer boleh membawa beberapa produk sekaligus."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              transfers.map((transfer) => (
                <TableRow key={transfer._id}>
                  <TableCell className="whitespace-nowrap font-medium tabular-nums">
                    <Link
                      href={`/dashboard/inventory/transfers/${transfer._id}`}
                      className="text-primary hover:underline"
                    >
                      <HighlightText
                        text={transfer.transferNumber}
                        query={query.search}
                      />
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {formatDate(transfer.transferDate)}
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
                  <TableCell>
                    <StockTransferStatusBadge status={transfer.status} />
                  </TableCell>
                  {/* THE MATCH, MARKED — and the cut follows it. The note is one
                      of the two things the server searches, so a row on screen
                      is a row this cell may explain. CSS truncation cuts from
                      the end regardless of where the term is, which would answer
                      a search for a word in the middle of a long note with
                      sixty characters that do not contain it. */}
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
                    {/* A NAMED ACTION as well as the number: it says where it
                        goes without the reader having to try the number. */}
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        href={`/dashboard/inventory/transfers/${transfer._id}`}
                        aria-label={`Detail transfer ${transfer.transferNumber}`}
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

      {/* WHAT THIS LIST DOES NOT CARRY, and why: the value. See the header. */}
      <p className="text-xs text-muted">
        Buka Detail untuk melihat barang apa saja yang pindah, dari batch mana,
        berapa nilainya, dan untuk mencetak surat jalan.
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
  const count =
    (applied.warehouseId !== "" ? 1 : 0) + (applied.status !== "" ? 1 : 0);
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
          label="Status"
          ariaLabel="Filter status transfer"
          value={draft.status}
          options={withAll(STATUSES, "Semua status")}
          onChange={(status) => setDraft((prev) => ({ ...prev, status }))}
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
