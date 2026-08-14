"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, multiplyDecimals, toMinor } from "@/utils/decimal";
import type { ProductBatch } from "@/types/inventory";

import { partitionBatches } from "../utils/ledger";
import { ExpiryBadge } from "./ExpiryBadge";

/**
 * The lots of one product at one warehouse, in the order FEFO will consume them.
 *
 * THE OTHER HALF OF THE STOCK CARD, not a separate report. The ledger says what
 * happened; the lots say what is on the shelf right now. Both are derived from
 * the same movements — a lot's `qtyRemaining` is a cache the ledger could
 * rebuild — so a disagreement between the two tabs is itself the useful signal,
 * and putting them a click apart is what lets anyone notice one.
 *
 * The API already returns them closest-to-expiring first, so nothing here
 * re-sorts by expiry. What it does do is float the LIVE lots above the exhausted
 * ones, which is a display choice: spent rows are history, not queue.
 */
export function BatchLotTable({
  batches,
  total,
  hasExpiry,
}: {
  batches: ProductBatch[];
  /** How many lots exist server-side — larger than the array means it was cut. */
  total: number;
  hasExpiry: boolean;
}) {
  if (batches.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface py-16 text-center">
        <p className="font-medium text-foreground">
          Tidak ada lot di gudang ini
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          {hasExpiry
            ? "Lot dibuat otomatis saat barang diterima."
            : "Lot hanya dibuat untuk barang yang punya masa kedaluwarsa atau datang sebagai konsinyasi — produk ini tidak melacak lot."}
        </p>
      </div>
    );
  }

  const { live, spent } = partitionBatches(batches);

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

      {batches.length < total && (
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
          Menampilkan {batches.length} lot pertama dari {total}.
        </p>
      )}

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
  const spent = remaining === 0n;

  return (
    <tr
      className={cn("border-b border-border/60 last:border-0", spent && "opacity-55")}
    >
      <td className="px-4 py-2.5">
        {order ? (
          <span className="flex size-6 items-center justify-center rounded-full bg-primary/12 tabular-nums text-xs font-semibold text-primary-hover">
            {order}
          </span>
        ) : (
          <span className="text-xs text-muted">{negative ? "minus" : "habis"}</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className="tabular-nums text-xs">{batch.batchCode}</span>
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
          "px-4 py-2.5 text-right tabular-nums text-sm",
          negative && "font-semibold text-danger",
        )}
      >
        {formatQty(batch.qtyRemaining)}
        <span className="text-xs text-muted"> / {formatQty(batch.initialQty)}</span>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted">
        {formatMoney(batch.costPerUnit)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-xs">
        {spent
          ? "—"
          : formatMoney(multiplyDecimals(batch.qtyRemaining, batch.costPerUnit))}
      </td>
    </tr>
  );
}
