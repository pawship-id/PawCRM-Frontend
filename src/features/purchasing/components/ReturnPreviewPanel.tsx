"use client";

import { Alert, Card } from "@/components";
import { JournalPreview } from "@/features/inventory/components/JournalPreview";
import { formatMoney, formatMoneyPrecise, formatQty } from "@/utils/decimal";
import type { PurchaseReturnPreview } from "@/types/api";

/**
 * What submitting a return would do to the stock, the cost basis and the books.
 *
 * THE HPP BLOCK IS WHY THIS PANEL EXISTS. Everything else here could be inferred
 * from the document; the new weighted average cannot, and it is the number the
 * submit changes permanently for every unit still on the shelf.
 *
 * WHAT SURPRISES PEOPLE, and why the working is spelled out rather than just the
 * result: returning goods that were CHEAPER than the current average makes the
 * remaining stock more expensive. That is arithmetically right — the cheap units
 * are the ones leaving — but it looks like a bug the first time somebody watches
 * HPP rise after sending something back, and a bare "after" figure gives them
 * nothing to check it against.
 *
 * THE ARITHMETIC IS THE SERVER'S, SHOWN — not recomputed here. `before`, `after`,
 * `qtyBefore`, `qtyIn` and `unitCost` all arrive from the preview endpoint, which
 * runs the same code the submit runs. The version of this screen that computed
 * its own simulation is exactly what this replaced: a local copy does not fail
 * loudly when it disagrees, it renders a confident wrong number that a user then
 * approves.
 */
export function ReturnPreviewPanel({
  preview,
  consignment,
}: {
  preview: PurchaseReturnPreview;
  /** Consignment goods were never bought, so no debt is discharged. */
  consignment: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {preview.hppAvg.length > 0 && (
        <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4">
          <p className="text-[10px] font-medium tracking-widest text-primary-hover uppercase">
            HPP dihitung ulang dengan HARGA BELI ASLI, bukan HPP berjalan
          </p>

          <div className="mt-2 flex flex-col gap-1 overflow-x-auto">
            {preview.hppAvg.map((row) => (
              <p
                key={row.productId}
                className="tabular-nums text-[13px] leading-7 whitespace-nowrap"
              >
                {/* `qtyIn` is NEGATIVE on a return — the goods are leaving — so
                    it reads as a subtraction without being flipped here. */}
                ({formatQty(row.qtyBefore)}{" "}
                <span className="text-muted">×</span> {formatMoney(row.before)}){" "}
                <span className="text-muted">+</span> ({formatQty(row.qtyIn)}{" "}
                <span className="text-muted">×</span>{" "}
                {formatMoney(row.unitCost)}) <span className="text-muted">→</span>{" "}
                <b className="text-primary-hover">
                  {formatMoneyPrecise(row.after)}
                </b>
              </p>
            ))}
          </div>

          <p className="mt-2 text-xs text-muted">
            Kalau barang yang dikembalikan <b>lebih murah</b> dari rata-rata, HPP
            sisa stok justru <b>naik</b>. Itu benar secara hitungan — unit
            murahnya yang pergi — dan inilah yang menjaga nilai persediaan tetap
            sama dengan uang yang benar-benar keluar.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <JournalPreview
          lines={preview.journal}
          emptyReason={
            consignment
              ? "Konsinyasi tidak menjurnal — barangnya memang belum pernah dibeli, jadi tidak ada utang yang perlu dikurangi."
              : "Nilai retur nol, jadi tidak ada jurnal yang dibuat."
          }
        />

        <Card title="Yang akan terjadi">
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Baris kartu stok</span>
              <b className="tabular-nums">
                {preview.movements.length}
              </b>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Produk terdampak HPP</span>
              <b className="tabular-nums">{preview.hppAvg.length}</b>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <b>Nilai retur</b>
              <b className="tabular-nums text-base text-danger">
                {formatMoney(preview.totalAmount)}
              </b>
            </div>

            {consignment ? (
              <p className="mt-1 text-xs text-muted">
                Utang supplier <b>tidak berubah</b> — konsinyasi belum pernah
                menimbulkan utang.
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Utang supplier berkurang {formatMoney(preview.totalAmount)},
                supaya utang dan stok tetap sepakat.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* A documented backend limitation, surfaced rather than left to be
          discovered during a tax reconciliation. See purchaseReturn.model.js. */}
      {!consignment && (
        <Alert variant="info">
          PPN Masukan <b>tidak ikut dibalik</b> oleh retur ini. Kalau
          penerimaannya memungut PPN, sisa PPN Masukan yang bisa dikreditkan
          perlu dikoreksi terpisah.
        </Alert>
      )}

      {/* A short row is one that would drive a lot below zero. The posting still
          happens — the goods left the shelf — so this is a warning, not a
          blocker: a negative lot is a visible discrepancy, an unrecorded
          withdrawal is an invisible one. */}
      {preview.movements.some((movement) => movement.short) && (
        <Alert variant="error">
          Sebagian barang yang diretur <b>sudah tidak ada di lot asalnya</b> —
          kemungkinan sudah terjual atau dipindah. Retur tetap bisa disubmit,
          tapi lot terkait akan minus dan perlu ditelusuri.
        </Alert>
      )}
    </div>
  );
}
