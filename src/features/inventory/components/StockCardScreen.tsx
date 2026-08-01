"use client";

import { useMemo, useState } from "react";

import { Card } from "@/components";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  formatQty,
  multiplyDecimals,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";
import type { ProductBatch, StockMovement } from "@/types/inventory";

import * as demo from "../data/demoStore";
import { useInventoryDemo } from "../hooks/useInventoryDemo";
import { ExpiryBadge } from "./ExpiryBadge";
import { MovementBadge } from "./MovementBadge";
import { WarehouseProductPicker } from "./WarehouseProductPicker";

type Tab = "ledger" | "batches";

/**
 * The stock card and the lot list for one product at one warehouse.
 *
 * TWO VIEWS OF ONE TRUTH, which is why they share a screen rather than sitting
 * on separate pages. The ledger says what happened; the lots say what is on the
 * shelf right now. Both are derived from the same movements — the lot balances
 * are a cache the ledger can rebuild — so a discrepancy between the two tabs is
 * itself the useful signal, and putting them a click apart is what lets anyone
 * notice one.
 *
 * The running balance is computed from the OLDEST row forward and then shown
 * newest-first. That ordering is deliberate: a stock card is read top-down to
 * answer "how did we get to this number", so the newest row has to carry the
 * current balance, not the first movement ever recorded.
 */
/** One ledger row plus the balance it left behind. */
interface LedgerRow {
  movement: StockMovement;
  balance: string;
}

export function StockCardScreen() {
  const {
    products,
    warehouses,
    movements: allMovements,
    batches: allBatches,
  } = useInventoryDemo();

  const [warehouseId, setWarehouseId] = useState(warehouses[0]._id);
  const [productId, setProductId] = useState(demo.firstStockProduct(products)!._id);
  const [tab, setTab] = useState<Tab>("ledger");

  const product = products.find((p) => p._id === productId)!;

  /**
   * The ledger with a running balance.
   *
   * Accumulated with `reduce` rather than a `let` the map closes over: a
   * mutable variable declared in a component body is reassigned across renders,
   * which React's rules forbid for good reason — a re-render mid-list would
   * continue from the previous total. The reduce carries the running sum in its
   * accumulator, so the calculation cannot survive its own render.
   *
   * Oldest-first to accumulate, then reversed for display: a stock card is read
   * top-down to answer "how did we get to this number", so the newest row has to
   * carry the current balance.
   */
  const rows = useMemo(() => {
    const oldestFirst = allMovements
      .filter((m) => m.productId === productId && m.warehouseId === warehouseId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return oldestFirst
      .reduce<{ running: bigint; out: LedgerRow[] }>(
        (acc, movement) => {
          const running = acc.running + (toMinor(movement.qty) ?? 0n);
          acc.out.push({ movement, balance: toDecimalString(running) });
          return { running, out: acc.out };
        },
        { running: 0n, out: [] },
      )
      .out.reverse();
  }, [allMovements, productId, warehouseId]);

  const batches = useMemo(
    () =>
      allBatches
        .filter((b) => b.productId === productId && b.warehouseId === warehouseId)
        .sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? "")),
    [allBatches, productId, warehouseId],
  );

  const onHand = demo.qtyOnHand(productId, warehouseId);
  const stockValue = product.hppAvg
    ? multiplyDecimals(onHand, product.hppAvg)
    : null;
  const low = (toMinor(onHand) ?? 0n) <= BigInt(product.minStock) * 10_000n;

  return (
    <div className="flex flex-col gap-6">
      <Card title="Pilih barang">
        <WarehouseProductPicker
          warehouses={warehouses}
          products={products}
          warehouseId={warehouseId}
          productId={productId}
          onWarehouseChange={setWarehouseId}
          onProductChange={setProductId}
        />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Stok di gudang ini"
          value={`${formatQty(onHand)} ${product.unit}`}
          tone={low ? "danger" : "default"}
          note={low ? `di bawah minimum (${product.minStock})` : `minimum ${product.minStock}`}
        />
        <Stat
          label="HPP rata-rata"
          value={product.hppAvg ? formatMoney(product.hppAvg) : "—"}
          note={product.hppAvg ? "per unit" : "belum ada penerimaan bernilai"}
        />
        <Stat
          label="Nilai persediaan"
          value={stockValue ? formatMoney(stockValue) : "—"}
          note="stok × HPP"
        />
        <Stat
          label="Lot aktif"
          value={String(
            batches.filter((b) => (toMinor(b.qtyRemaining) ?? 0n) > 0n).length,
          )}
          note={product.hasExpiry ? "melacak kedaluwarsa" : "tidak melacak batch"}
        />
      </div>

      <div>
        <div className="flex gap-1 border-b border-border">
          {(
            [
              ["ledger", `Kartu stok (${rows.length})`],
              ["batches", `Batch / FEFO (${batches.length})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition",
                tab === value
                  ? "border-primary text-primary-hover"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="pt-4">
          {tab === "ledger" ? (
            <LedgerTable rows={rows} unit={product.unit} />
          ) : (
            <BatchTable batches={batches} hasExpiry={product.hasExpiry} />
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-surface p-4",
        tone === "danger" ? "border-danger/40 bg-danger/5" : "border-border",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-mono text-xl font-semibold tabular-nums",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

function LedgerTable({
  rows,
  unit,
}: {
  rows: LedgerRow[];
  unit: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface py-16 text-center">
        <p className="font-medium text-foreground">Belum ada pergerakan</p>
        <p className="mt-1 text-sm text-muted">
          Kartu stok terisi setelah ada penerimaan, penjualan, penyesuaian, atau
          transfer di gudang ini.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
            <th className="px-4 py-2.5 text-left font-medium">Waktu</th>
            <th className="px-4 py-2.5 text-left font-medium">Tipe</th>
            <th className="px-4 py-2.5 text-left font-medium">Lot</th>
            <th className="px-4 py-2.5 text-right font-medium">Masuk / keluar</th>
            <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
            <th className="px-4 py-2.5 text-right font-medium">HPP saat itu</th>
            <th className="px-4 py-2.5 text-left font-medium">Referensi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ movement, balance }) => {
            const positive = (toMinor(movement.qty) ?? 0n) > 0n;
            return (
              <tr key={movement._id} className="border-b border-border/60 last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted">
                  {new Date(movement.createdAt).toLocaleString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-2.5">
                  <MovementBadge type={movement.movementType} />
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">
                  {movement.batchId ? movement.batchId.replace("bt_", "") : "—"}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right font-mono text-sm font-semibold tabular-nums",
                    positive ? "text-success" : "text-danger",
                  )}
                >
                  {positive ? "+" : ""}
                  {formatQty(movement.qty)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums">
                  {formatQty(balance)} <span className="text-xs text-muted">{unit}</span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-muted">
                  {movement.hppAtTime ? formatMoney(movement.hppAtTime) : "—"}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">
                  {movement.reference.type}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
        Log ini <b>tidak bisa diubah</b>. Koreksi dilakukan dengan menambah baris
        baru, bukan mengedit yang lama — sehingga saldo di atas selalu bisa
        dihitung ulang dari nol dan dicocokkan.
      </p>
    </div>
  );
}

function BatchTable({
  batches,
  hasExpiry,
}: {
  batches: ProductBatch[];
  hasExpiry: boolean;
}) {
  if (batches.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface py-16 text-center">
        <p className="font-medium text-foreground">Produk ini tidak melacak lot</p>
        <p className="mt-1 text-sm text-muted">
          {hasExpiry
            ? "Lot dibuat otomatis saat barang diterima."
            : "Lot hanya dibuat untuk barang yang punya masa kedaluwarsa atau datang sebagai konsinyasi."}
        </p>
      </div>
    );
  }

  // Live lots first, in FEFO order; exhausted ones drop to the bottom as history.
  const live = batches.filter((b) => (toMinor(b.qtyRemaining) ?? 0n) > 0n);
  const spent = batches.filter((b) => (toMinor(b.qtyRemaining) ?? 0n) <= 0n);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
            <th className="px-4 py-2.5 text-left font-medium">Urutan FEFO</th>
            <th className="px-4 py-2.5 text-left font-medium">Kode batch</th>
            <th className="px-4 py-2.5 text-left font-medium">Kedaluwarsa</th>
            <th className="px-4 py-2.5 text-right font-medium">Sisa / awal</th>
            <th className="px-4 py-2.5 text-right font-medium">Harga beli lot</th>
            <th className="px-4 py-2.5 text-right font-medium">Nilai sisa</th>
          </tr>
        </thead>
        <tbody>
          {live.map((batch, index) => (
            <BatchRow key={batch._id} batch={batch} order={index + 1} />
          ))}
          {spent.map((batch) => (
            <BatchRow key={batch._id} batch={batch} order={null} />
          ))}
        </tbody>
      </table>

      <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
        Urutan di kolom pertama adalah urutan pengambilan: <b>yang paling dekat
        kedaluwarsa keluar duluan</b>. Lot yang sudah habis tetap ditampilkan di
        bawah sebagai riwayat — kuantitas tidak pernah dihapus, hanya menjadi nol.
      </p>
    </div>
  );
}

function BatchRow({
  batch,
  order,
}: {
  batch: ProductBatch;
  order: number | null;
}) {
  const remaining = toMinor(batch.qtyRemaining) ?? 0n;
  const negative = remaining < 0n;
  const spent = remaining <= 0n;

  return (
    <tr className={cn("border-b border-border/60 last:border-0", spent && "opacity-55")}>
      <td className="px-4 py-2.5">
        {order ? (
          <span className="flex size-6 items-center justify-center rounded-full bg-primary/12 font-mono text-xs font-semibold text-primary-hover">
            {order}
          </span>
        ) : (
          <span className="text-xs text-muted">habis</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className="font-mono text-xs">{batch.batchCode}</span>
        {batch.isConsignment && (
          <Badge
            variant="outline"
            className="ml-2 border-transparent bg-secondary/25 text-secondary-foreground"
          >
            konsinyasi
          </Badge>
        )}
      </td>
      <td className="px-4 py-2.5">
        {batch.expiryDate ? (
          <ExpiryBadge date={batch.expiryDate} />
        ) : (
          <span className="text-xs text-muted">tanpa expiry</span>
        )}
      </td>
      <td
        className={cn(
          "px-4 py-2.5 text-right font-mono text-sm tabular-nums",
          negative && "font-semibold text-danger",
        )}
      >
        {formatQty(batch.qtyRemaining)}
        <span className="text-xs text-muted"> / {formatQty(batch.initialQty)}</span>
      </td>
      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-muted">
        {formatMoney(batch.costPerUnit)}
      </td>
      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
        {spent
          ? "—"
          : formatMoney(multiplyDecimals(batch.qtyRemaining, batch.costPerUnit))}
      </td>
    </tr>
  );
}
