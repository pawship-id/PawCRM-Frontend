"use client";

import Link from "next/link";
import { ArrowRight, Plus, RotateCcw } from "lucide-react";

import {
  Alert,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Pagination,
  Spinner,
  namedOptions,
  withAll,
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

import { useStockTransfers } from "../hooks/useStockTransfers";

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
        {/* ON THE BAR, NOT BEHIND A BUTTON, unlike the two stock-entry lists
            beside it — §8 draws the line at two fields, and one filter behind a
            `Filter (1)` button is a button that hides one thing.

            A single select standing on a bar applies ON CLICK, so there is no
            Terapkan and no draft to abandon.

            ONE FIELD FOR BOTH ENDS, because the server matches either: somebody
            asking what passed through Gudang Bazar rarely knows, or cares, which
            end theirs was. Two fields would mostly be filled in wrongly.

            INACTIVE WAREHOUSES STAY. This is a READ, and a location closed last
            month still owns the transfers written there. The FORM takes the
            opposite view and offers active warehouses only — it has to, because
            the API refuses a movement at a closed one. */}
        <FilterSelect
          label="Gudang"
          ariaLabel="Filter gudang — asal maupun tujuan"
          value={query.warehouseId}
          options={withAll(namedOptions(warehouses), "Semua gudang")}
          onChange={(warehouseId) => setQuery({ warehouseId })}
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
                    <span className="flex items-center gap-1.5">
                      {/* The arrow is decorative — the two columns already say
                          which way the goods went, and a reader who cannot see
                          it loses nothing. */}
                      <ArrowRight
                        aria-hidden
                        className="size-3.5 shrink-0 text-primary"
                      />
                      {transfer.toWarehouseName ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {transfer.productCount}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted">
                    {transfer.notes ?? "—"}
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

/** "19 Agu 2026" — the format every other inventory list uses. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
