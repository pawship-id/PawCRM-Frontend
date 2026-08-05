import { Badge } from "@/components/ui/badge";
import { absDecimal, formatQty } from "@/utils/decimal";
import type { PreviewMovementRow } from "@/types/inventory";

import { ExpiryBadge } from "./ExpiryBadge";

/**
 * Which lots a withdrawal will draw from, shown BEFORE it is submitted.
 *
 * THIS IS THE SCREEN'S REASON TO EXIST. Everything else on a stock form is
 * predictable from what the user typed; this is not. "Keluarkan 10" can become
 * three ledger rows, and which lots they come from decides what the customer
 * physically receives — the bag expiring in three weeks or the one expiring next
 * year. FEFO makes that choice automatically and correctly, but a user who
 * cannot see it has no way to notice when the answer is surprising, and no way
 * to explain the resulting stock card to anyone else.
 *
 * The short-pick row is the other half. The backend does not refuse a
 * withdrawal the lots cannot cover — the goods left the shelf, and a system that
 * declined to record that would produce books disagreeing with reality AND a
 * cashier who cannot finish a sale. It drives the last lot negative instead. A
 * negative lot is a visible discrepancy; an unrecorded sale is an invisible one.
 * So it is flagged here, in amber, rather than blocking the form.
 *
 * THE ROWS COME STRAIGHT FROM THE SERVER'S PREVIEW. This component used to be
 * handed an allocation the browser had computed by reimplementing FEFO; it now
 * renders `POST /stock-movements/preview`, which is the posting path with the
 * commit left off. What is drawn is what will be written.
 */
export function FefoPreview({
  rows,
  /** Label for the rows — "movement" on an adjustment, "pasangan" on a transfer. */
  rowNoun = "baris movement",
}: {
  /** The outbound rows of a preview, in the order FEFO would consume them. */
  rows: PreviewMovementRow[];
  rowNoun?: string;
}) {
  if (rows.length === 0) return null;

  const short = rows.some((row) => row.short);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
          Alokasi FEFO — paling dekat kedaluwarsa keluar duluan
        </p>
        <Badge variant="outline" className="ml-auto">
          {rows.length} {rowNoun}
        </Badge>
      </div>

      <ul className="divide-y divide-border/60">
        {rows.map((row, index) => (
          <li
            key={row.batchId ?? `unbatched-${index}`}
            className="flex flex-wrap items-center gap-3 px-4 py-2.5"
          >
            <span className="flex size-5 items-center justify-center rounded-full bg-accent font-mono text-[10px] text-muted">
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              {row.batchCode ? (
                <p className="truncate font-mono text-xs text-foreground">
                  {row.batchCode}
                </p>
              ) : (
                <p className="text-xs text-muted">
                  Tanpa lot — produk ini tidak melacak batch
                </p>
              )}
            </div>

            {row.batchExpiryDate && <ExpiryBadge date={row.batchExpiryDate} />}

            {/* The API signs its quantities; the minus here is typographic, so
                a magnitude is what gets formatted. */}
            <span className="font-mono text-sm font-semibold tabular-nums text-danger">
              −{formatQty(absDecimal(row.qty))}
            </span>
          </li>
        ))}
      </ul>

      {short && (
        <p className="border-t border-border bg-secondary/15 px-4 py-2.5 text-xs text-secondary-foreground">
          <b>Stok lot tidak mencukupi.</b> Kekurangannya dibebankan ke lot
          terakhir sehingga sisanya menjadi minus. Transaksi tetap dicatat —
          barangnya memang sudah keluar dari rak, dan selisih yang terlihat lebih
          baik daripada penjualan yang tidak tercatat. Selesaikan lewat opname.
        </p>
      )}
    </div>
  );
}
