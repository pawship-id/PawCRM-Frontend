"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";

import {
  Alert,
  FilterBar,
  FilterSelect,
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
import { formatMoney, formatMoneyPrecise, formatQty } from "@/utils/decimal";

import { useNegativeStock } from "../hooks/useNegativeStock";

/**
 * EVERY SHELF THAT OWES WHAT IT HAS ALREADY SOLD.
 *
 * WHAT THIS SCREEN IS ABOUT, and it is not the same thing as the other stock
 * lists. Those describe the room: how much is there, what is running out, what
 * is about to expire. This one describes the BOOKS being wrong — goods left that
 * the system never recorded arriving — so every figure derived from the balance,
 * the stock value on a report included, is wrong along with it. That is why it
 * leads the hub and why it earned a screen of its own once the card there ran
 * out of room.
 *
 * A ROW IS ONE PRODUCT AT ONE WAREHOUSE. A shortfall happens at a PLACE: the
 * same product can be three short in one shop and perfectly fine in the next,
 * and "you are three short somewhere" is not something anybody can act on. This
 * is the grain the restock list deliberately does NOT have — a minimum stock
 * threshold is a property of the product, so that list sums across locations.
 *
 * ONE FILTER, ON THE BAR. ui-rules §8 sets the floor plainly: a single field
 * behind a `Filter (1)` button is a button that hides one thing, which is worse
 * than showing it. Gudang applies on click, like Transfer Stok's.
 *
 * NO SORT CONTROL. The order is fixed at worst-first by VALUE — the −200 sacks
 * of feed matter and the −1 collar does not — and offering "by name" would be
 * offering a way to push the expensive rows below the fold.
 *
 * INACTIVE PRODUCTS ARE HERE, unlike on the restock list, and the chip says so.
 * A discontinued line is not something to reorder; a discontinued line sitting
 * at −3 is exactly the row somebody has to explain.
 */
/** Produk, Gudang, Stok, HPP, Nilai. */
const COLUMN_COUNT = 5;

export function NegativeStockScreen() {
  const {
    items,
    pagination,
    shortfall,
    warehouses,
    query,
    loading,
    error,
    setQuery,
    refetch,
  } = useNegativeStock();

  const warehouseName = warehouses.find(
    (warehouse) => warehouse._id === query.warehouseId,
  )?.name;
  /** " di Gudang Pusat", or nothing. Appended, never sentence-leading. */
  const scope = warehouseName ? ` di ${warehouseName}` : "";

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

      <FilterBar>
        {/* INACTIVE WAREHOUSES STAY IN THE LIST. This is a read, and a location
            closed last month can still hold a balance below zero — hiding it
            would hide the row somebody has to clear. */}
        {warehouses.length > 0 && (
          <FilterSelect
            label="Gudang"
            ariaLabel="Filter gudang"
            value={query.warehouseId}
            options={withAll(
              namedOptions(warehouses, (warehouse) =>
                warehouse.isActive
                  ? warehouse.name
                  : `${warehouse.name} (nonaktif)`,
              ),
              "Semua gudang",
            )}
            onChange={(warehouseId) => setQuery({ warehouseId })}
          />
        )}
      </FilterBar>

      {/*
        THE TOTAL, ABOVE THE TABLE. It is the WHOLE hole across every row in
        reach, not this page's worth of it — a figure that only added up the
        twenty rows on screen would read as the answer while being a fraction of
        it. Hidden entirely when there is nothing wrong: a standing "Rp 0" on a
        clean shop is a number that teaches people to ignore the row.
      */}
      {!loading && pagination.total > 0 && (
        <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-3">
          <p className="text-sm text-foreground">
            <strong className="tabular-nums">{pagination.total}</strong> baris
            stok minus{scope}
          </p>
          {shortfall && (
            <p className="text-sm text-muted">
              Total nilai:{" "}
              <strong className="tabular-nums text-danger">
                {formatMoney(shortfall)}
              </strong>
            </p>
          )}
        </div>
      )}

      {/*
        WHAT A NEGATIVE BALANCE MEANS, said once above the rows. Nobody reads
        "−3" as "a sale was recorded for goods the book did not have" on their
        own, and the wrong reading — "the system is broken" — sends somebody
        looking for a bug instead of for a delivery note.
      */}
      <p className="text-sm text-muted">
        Barang terjual saat stok tercatat habis, jadi saldonya jadi minus.
        Biasanya karena penerimaan barang belum dicatat — catat penerimaannya,
        atau perbaiki lewat{" "}
        <Link
          href="/dashboard/inventory/opname"
          className="font-medium text-primary hover:text-primary-hover"
        >
          opname
        </Link>
        . Nilainya dihitung dari HPP rata-rata terakhir: itu biaya yang sudah
        terlanjur dibebankan untuk barang yang tidak ada.
      </p>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produk</TableHead>
              <TableHead>Gudang</TableHead>
              <TableHead className="text-right">Stok</TableHead>
              <TableHead className="text-right">HPP rata-rata</TableHead>
              <TableHead className="text-right">Nilai</TableHead>
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

            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT}>
                  {/* THE GOOD OUTCOME, said as one. An empty state here is not
                      "no data yet" — it is the books agreeing with the room. */}
                  <div className="flex flex-col items-center gap-1 py-10 text-center">
                    <p className="font-medium text-foreground">
                      Tidak ada stok minus{scope}
                    </p>
                    <p className="max-w-md text-sm text-muted">
                      Semua saldo stok berada di nol atau di atasnya — catatan
                      dan barang di rak sedang cocok.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              items.map((row) => (
                <TableRow key={`${row.productId}-${row.warehouseId}`}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/inventory/products/${row.productId}`}
                        className="font-medium text-foreground hover:text-primary-hover"
                      >
                        {row.name}
                      </Link>
                      {!row.isActive && (
                        <Badge variant="outline">nonaktif</Badge>
                      )}
                    </div>
                    <span className="block tabular-nums text-xs text-muted">
                      {row.sku ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {/* Null only where the warehouse row has gone missing — the
                        shortfall is still real, so the row still shows. */}
                    {row.warehouseName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-danger">
                    {formatQty(row.qty)}
                    {row.unit ? ` ${row.unit}` : ""}
                  </TableCell>
                  {/*
                    UNCHANGED BY THE OVERSELL. Goods leave AT the average, so an
                    outbound movement cannot move it — the shelf still carries
                    what the shop last paid. Two decimals, because the next
                    receipt weights this negative balance against it and the sen
                    are what make the arithmetic check out.
                  */}
                  <TableCell className="text-right tabular-nums text-muted">
                    {formatMoneyPrecise(row.hppAvg)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-danger">
                    {formatMoney(row.value)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {pagination.totalPages > 1 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          unit="baris"
          unitPlural="baris"
          onPageChange={(page) => setQuery({ page })}
        />
      )}
    </div>
  );
}
