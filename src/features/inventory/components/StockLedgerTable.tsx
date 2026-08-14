"use client";

import { Pagination } from "@/components";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, toMinor } from "@/utils/decimal";
import type { ReferenceType, StockMovement } from "@/types/inventory";

import { MovementBadge } from "./MovementBadge";

/**
 * The stock card itself: every movement of one product at one warehouse, newest
 * first, with the balance each one left behind.
 *
 * NEWEST FIRST IS NOT A SORT PREFERENCE. A stock card is read top-down to answer
 * "how did we get to this number", so the first row has to carry the current
 * balance.
 *
 * EVERY COLUMN NOW COMES FROM THE ROW. This table used to derive its balance
 * from a quantity fetched elsewhere, join its lot codes from the batch tab's
 * data, and have no author column at all, because the API returned ids and no
 * balance. It returns both (PawCRM-Backend 0.20.0), so this component renders
 * and computes nothing.
 *
 * **Referensi** NAMES THE DOCUMENT WHERE THERE IS ONE TO NAME. A row posted by a
 * stock opname shows that sheet's number (`referenceNo`, PawCRM-Backend 0.24.0)
 * above its type; every other kind still shows the type alone, because
 * `goodsreceipts` and `postransactions` are not collections yet and a manual
 * adjustment has no document at all. The fallback is the TYPE, never
 * `reference.id` — an ObjectId names nothing a human can look up.
 */
const REFERENCE_LABELS: Record<ReferenceType, string> = {
  goods_receipt: "Penerimaan barang",
  pos_transaction: "Transaksi POS",
  stock_opname: "Stok opname",
  purchase_return: "Retur pembelian",
  customer_return: "Retur customer",
  transfer_manual: "Transfer manual",
  bundle_consume: "Penjualan bundle",
  manual_adjustment: "Penyesuaian manual",
  // Has no document either, like a manual adjustment — but is worth naming
  // apart, because "what did this tenant start with" is a question the stock
  // card could not answer while the two shared one label.
  opening_balance: "Saldo awal persediaan",
};

export function StockLedgerTable({
  movements,
  unit,
  openingBalance,
  page,
  totalPages,
  total,
  filtered,
  onPageChange,
}: {
  movements: StockMovement[];
  unit: string;
  /** The balance before the oldest row on this page, or null when unanswerable. */
  openingBalance: string | null;
  page: number;
  totalPages: number;
  total: number;
  /** True when a type or date filter is narrowing the list — changes the empty copy. */
  filtered: boolean;
  onPageChange: (page: number) => void;
}) {
  if (movements.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface py-16 text-center">
        <p className="font-medium text-foreground">
          {filtered ? "Tidak ada pergerakan yang cocok" : "Belum ada pergerakan"}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          {filtered
            ? "Coba longgarkan filter tipe atau rentang tanggalnya."
            : "Kartu stok terisi setelah ada penerimaan, penjualan, penyesuaian, atau transfer di gudang ini."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Waktu</th>
              <th className="px-4 py-2.5 text-left font-medium">Tipe</th>
              <th className="px-4 py-2.5 text-left font-medium">Lot</th>
              <th className="px-4 py-2.5 text-right font-medium">
                Masuk / keluar
              </th>
              <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
              <th className="px-4 py-2.5 text-right font-medium">
                HPP saat itu
              </th>
              <th className="px-4 py-2.5 text-left font-medium">Referensi</th>
              <th className="px-4 py-2.5 text-left font-medium">
                Diinput oleh
              </th>
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => {
              const positive = (toMinor(movement.qty) ?? 0n) > 0n;

              return (
                <tr
                  key={movement._id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-xs text-muted">
                    {new Date(movement.createdAt).toLocaleString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    <MovementBadge type={movement.movementType} />
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-xs text-muted">
                    {/* A movement CAN legitimately have no lot: most stock is
                        not batch-tracked at all. */}
                    {movement.batchCode ?? "—"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular-nums text-sm font-semibold",
                      positive ? "text-success" : "text-danger",
                    )}
                  >
                    {positive ? "+" : ""}
                    {formatQty(movement.qty)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm">
                    {formatQty(movement.balanceAfter)}{" "}
                    <span className="text-xs text-muted">{unit}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted">
                    {movement.hppAtTime ? formatMoney(movement.hppAtTime) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">
                    {movement.referenceNo ? (
                      <>
                        <span className="block tabular-nums text-foreground">
                          {movement.referenceNo}
                        </span>
                        <span className="block text-[11px]">
                          {REFERENCE_LABELS[movement.reference.type]}
                        </span>
                      </>
                    ) : (
                      REFERENCE_LABELS[movement.reference.type]
                    )}

                    {/* WHY it happened, which no other column can say — and the
                        only thing a `manual_adjustment` or a `transfer_manual`
                        has instead of a document number.

                        Under the reference rather than in a column of its own:
                        this table is already eight columns wide, and a note is
                        read when a row looks surprising, not scanned down. Both
                        levels are shown — the transfer's own reason and the
                        product line's — because they answer different questions
                        and either may be absent. */}
                    {(movement.notes || movement.lineNotes) && (
                      <span className="mt-1 block max-w-56 text-[11px] italic">
                        {[movement.notes, movement.lineNotes]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">
                    {/* Null for movements a background process posted — the POS
                        sync, an opname's own difference rows. */}
                    {movement.createdByName ?? "sistem"}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {openingBalance !== null && (
            <tfoot>
              <tr className="border-t border-border bg-muted/5 text-xs">
                <td className="px-4 py-2.5 text-muted" colSpan={4}>
                  Saldo sebelum baris terakhir di halaman ini
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatQty(openingBalance)}{" "}
                  <span className="text-muted">{unit}</span>
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>

        <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
          Log ini <b>tidak bisa diubah</b>. Koreksi dilakukan dengan menambah
          baris baru, bukan mengedit yang lama — sehingga saldo di atas selalu
          bisa dihitung ulang dari nol dan dicocokkan.
        </p>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        unit="pergerakan"
        unitPlural="pergerakan"
        onPageChange={onPageChange}
      />
    </div>
  );
}
