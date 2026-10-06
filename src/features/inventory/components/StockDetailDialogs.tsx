"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  ProductBatch,
  ReferenceType,
  StockMovement,
} from "@/types/inventory";
import {
  absDecimal,
  formatMoney,
  formatQty,
  multiplyDecimals,
  toMinor,
} from "@/utils/decimal";

import { ExpiryBadge } from "./ExpiryBadge";
import { MovementBadge } from "./MovementBadge";

/**
 * The detail of one row of the stock card — a movement, or a lot.
 *
 * WHY A DIALOG AND NOT A PAGE. Everything here is already on the screen the row
 * was clicked on: the movement carries its own labels and the lot list is loaded
 * for the same warehouse. A route of its own would refetch what is in memory and
 * lose the reader's place in a long ledger (page, filters, tab) the moment they
 * come back. The documents a movement belongs to DO have pages, and are linked.
 *
 * NOTHING IS COMPUTED THAT THE LEDGER DOES NOT ALREADY SAY. The value of a
 * movement is `qty × hppAtTime`, shown as an aid to reading; `hppAtTime` is the
 * product's average at that moment, which is what the journal was posted at.
 */

/** Where a movement's document lives, for the kinds that have a page. */
export function referenceHref(
  type: ReferenceType,
  id: string | null,
): string | null {
  if (!id) return null;

  switch (type) {
    case "opening_balance":
      return `/dashboard/inventory/opening-stock/${id}`;
    case "manual_adjustment":
      return `/dashboard/inventory/adjustments/${id}`;
    case "stock_opname":
      return `/dashboard/inventory/opname/${id}`;
    case "transfer_manual":
      return `/dashboard/inventory/transfers/${id}`;
    case "customer_invoice":
    case "customer_invoice_void":
      return `/dashboard/sales/invoice/${id}`;
    case "goods_receipt":
      return `/dashboard/purchasing/receipts/${id}`;
    default:
      return null;
  }
}

const REFERENCE_NAMES: Record<ReferenceType, string> = {
  goods_receipt: "Penerimaan barang",
  pos_transaction: "Transaksi POS",
  customer_invoice: "Faktur penjualan",
  customer_invoice_void: "Pembatalan faktur",
  pos_void: "Pembatalan transaksi",
  stock_opname: "Stok opname",
  purchase_return: "Retur pembelian",
  customer_return: "Retur customer",
  transfer_manual: "Transfer manual",
  bundle_consume: "Penjualan bundle",
  manual_adjustment: "Penyesuaian manual",
  opening_balance: "Saldo awal persediaan",
};

const DATE_TIME = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as const;

const DATE_ONLY = {
  day: "2-digit",
  month: "long",
  year: "numeric",
} as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">
        {title}
      </h3>
      <Card className="py-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {children}
        </dl>
      </Card>
    </section>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", wide && "sm:col-span-2")}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

const NONE = <span className="text-muted">—</span>;

/** The lot a movement touched, from the loaded lot list or the movement's own labels. */
interface LotView {
  batchCode: string | null;
  supplierBatchCode: string | null;
  expiryDate: string | null;
  isConsignment: boolean | null;
  initialQty: string | null;
  qtyRemaining: string | null;
  costPerUnit: string | null;
}

function lotOf(movement: StockMovement, batch: ProductBatch | undefined): LotView {
  return {
    batchCode: batch?.batchCode ?? movement.batchCode,
    supplierBatchCode: batch?.supplierBatchCode ?? movement.supplierBatchCode,
    expiryDate: batch?.expiryDate ?? movement.batchExpiryDate,
    isConsignment: batch ? batch.isConsignment : null,
    initialQty: batch?.initialQty ?? null,
    qtyRemaining: batch?.qtyRemaining ?? null,
    costPerUnit: batch?.costPerUnit ?? null,
  };
}

export function MovementDetailDialog({
  movement,
  unit,
  productName,
  warehouseName,
  branchName,
  batch,
  onClose,
  onShowLot,
}: {
  movement: StockMovement | null;
  unit: string;
  productName: string | null;
  /** The warehouse the card is open on. */
  warehouseName: string | null;
  /** The books the movement posted against, named — null when unreadable. */
  branchName: string | null;
  /** The lot behind the movement, when the lot list is loaded and holds it. */
  batch: ProductBatch | undefined;
  onClose: () => void;
  /** Opens the lot's own detail. Absent when the lot list is not readable. */
  onShowLot?: (batch: ProductBatch) => void;
}) {
  const positive = movement ? (toMinor(movement.qty) ?? 0n) > 0n : true;
  const lot = movement ? lotOf(movement, batch) : null;
  const href = movement
    ? referenceHref(movement.reference.type, movement.reference.id)
    : null;
  const value =
    movement && movement.hppAtTime
      ? multiplyDecimals(absDecimal(movement.qty), movement.hppAtTime)
      : null;

  return (
    <Dialog open={movement !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {movement && lot && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                Detail pergerakan stok
                <MovementBadge type={movement.movementType} />
              </DialogTitle>
              <DialogDescription>
                {productName ?? "Produk"} ·{" "}
                {new Date(movement.createdAt).toLocaleString("id-ID", DATE_TIME)}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <Section title="Jumlah">
                <Field label="Masuk / keluar">
                  <span
                    className={cn(
                      "text-base font-semibold tabular-nums",
                      positive ? "text-success" : "text-danger",
                    )}
                  >
                    {positive ? "+" : ""}
                    {formatQty(movement.qty)} {unit}
                  </span>
                </Field>
                <Field label="Saldo setelah pergerakan">
                  <span className="tabular-nums">
                    {movement.balanceAfter !== null
                      ? `${formatQty(movement.balanceAfter)} ${unit}`
                      : "—"}
                  </span>
                </Field>
                <Field label="HPP saat itu">
                  {movement.hppAtTime ? formatMoney(movement.hppAtTime) : NONE}
                </Field>
                <Field label="Nilai pergerakan">
                  {value ? formatMoney(value) : NONE}
                </Field>
              </Section>

              <Section title="Lokasi">
                <Field label="Gudang">{movement.warehouseName ?? warehouseName ?? NONE}</Field>
                <Field label="Cabang (pembukuan)">{branchName ?? NONE}</Field>
                {movement.destinationWarehouseName && (
                  <Field label="Gudang tujuan" wide>
                    {movement.destinationWarehouseName}
                  </Field>
                )}
              </Section>

              <Section title="Batch / kedaluwarsa">
                {lot.batchCode ? (
                  <>
                    <Field label="Kode batch internal">
                      <span className="tabular-nums">{lot.batchCode}</span>
                      {lot.isConsignment && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-transparent bg-secondary/25 text-secondary-foreground"
                        >
                          konsinyasi
                        </Badge>
                      )}
                    </Field>
                    <Field label="Kode batch pemasok">
                      {lot.supplierBatchCode ? (
                        <span className="tabular-nums">{lot.supplierBatchCode}</span>
                      ) : (
                        NONE
                      )}
                    </Field>
                    <Field label="Kedaluwarsa">
                      {lot.expiryDate ? (
                        <span className="flex flex-wrap items-center gap-2">
                          {new Date(lot.expiryDate).toLocaleDateString("id-ID", DATE_ONLY)}
                          <ExpiryBadge date={lot.expiryDate} />
                        </span>
                      ) : (
                        <span className="text-muted">tanpa expiry</span>
                      )}
                    </Field>
                    <Field label="Sisa stok batch ini">
                      {lot.qtyRemaining !== null ? (
                        <span className="tabular-nums">
                          {formatQty(lot.qtyRemaining)} {unit}
                          {lot.initialQty !== null && (
                            <span className="text-muted">
                              {" "}
                              dari {formatQty(lot.initialQty)}
                            </span>
                          )}
                        </span>
                      ) : (
                        NONE
                      )}
                    </Field>
                    <Field label="Harga beli batch">
                      {lot.costPerUnit !== null ? formatMoney(lot.costPerUnit) : NONE}
                    </Field>
                    {batch && onShowLot && (
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onShowLot(batch)}
                        >
                          Lihat detail batch
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <Field label="Batch" wide>
                    <span className="text-muted">
                      Pergerakan ini tidak memakai batch — produk tidak melacak
                      kedaluwarsa dan barangnya milik sendiri.
                    </span>
                  </Field>
                )}
              </Section>

              <Section title="Dokumen dan catatan">
                <Field label="Referensi">
                  <span className="block">
                    {REFERENCE_NAMES[movement.reference.type] ?? movement.reference.type}
                  </span>
                  {movement.referenceNo && (
                    <span className="block tabular-nums text-muted">
                      {movement.referenceNo}
                    </span>
                  )}
                  {href && (
                    <Link
                      href={href}
                      className="mt-1 inline-block text-primary-hover underline-offset-2 hover:underline"
                    >
                      Buka dokumen
                    </Link>
                  )}
                </Field>
                <Field label="Diinput oleh">{movement.createdByName ?? "sistem"}</Field>
                {(movement.notes || movement.lineNotes) && (
                  <Field label="Catatan" wide>
                    {[movement.notes, movement.lineNotes].filter(Boolean).join(" · ")}
                  </Field>
                )}
                <Field label="Dicatat pada">
                  {new Date(movement.createdAt).toLocaleString("id-ID", DATE_TIME)}
                </Field>
                <Field label="ID pergerakan">
                  <span className="break-all text-xs tabular-nums text-muted">
                    {movement._id}
                  </span>
                </Field>
              </Section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function BatchDetailDialog({
  batch,
  productName,
  branchName,
  onClose,
  onShowMovements,
  movementsLabel = "Lihat pergerakan batch ini",
}: {
  batch: ProductBatch | null;
  productName: string | null;
  /** The cabang the batch's warehouse belongs to, named — null when unreadable. */
  branchName: string | null;
  onClose: () => void;
  /** Takes the reader to this lot's history — see `movementsLabel`. */
  onShowMovements?: (batch: ProductBatch) => void;
  /** What the history button says — it goes to different places on different screens. */
  movementsLabel?: string;
}) {
  const remaining = batch ? (toMinor(batch.qtyRemaining) ?? 0n) : 0n;
  const unit = batch?.productUnit ?? "";
  const valueLeft =
    batch && remaining > 0n
      ? multiplyDecimals(batch.qtyRemaining, batch.costPerUnit)
      : null;

  return (
    <Dialog open={batch !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {batch && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                Detail batch
                <span className="tabular-nums text-base">{batch.batchCode}</span>
                {batch.isConsignment && (
                  <Badge
                    variant="outline"
                    className="border-transparent bg-secondary/25 text-secondary-foreground"
                  >
                    konsinyasi
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {productName ?? batch.productName ?? "Produk"}
                {batch.productSku ? ` · ${batch.productSku}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <Section title="Kedaluwarsa">
                <Field label="Tanggal kedaluwarsa">
                  {batch.expiryDate ? (
                    new Date(batch.expiryDate).toLocaleDateString("id-ID", DATE_ONLY)
                  ) : (
                    <span className="text-muted">tanpa expiry</span>
                  )}
                </Field>
                <Field label="Sisa waktu">
                  {batch.expiryDate ? <ExpiryBadge date={batch.expiryDate} /> : NONE}
                </Field>
                <Field label="Kode batch internal">
                  <span className="tabular-nums">{batch.batchCode}</span>
                </Field>
                <Field label="Kode batch pemasok">
                  {batch.supplierBatchCode ? (
                    <span className="tabular-nums">{batch.supplierBatchCode}</span>
                  ) : (
                    NONE
                  )}
                </Field>
              </Section>

              <Section title="Stok dan nilai">
                <Field label="Jumlah awal">
                  <span className="tabular-nums">
                    {formatQty(batch.initialQty)} {unit}
                  </span>
                </Field>
                <Field label="Sisa stok">
                  <span
                    className={cn(
                      "tabular-nums font-semibold",
                      remaining < 0n && "text-danger",
                    )}
                  >
                    {formatQty(batch.qtyRemaining)} {unit}
                  </span>
                </Field>
                <Field label="Harga beli batch">{formatMoney(batch.costPerUnit)}</Field>
                <Field label="Nilai sisa">{valueLeft ? formatMoney(valueLeft) : NONE}</Field>
              </Section>

              <Section title="Lokasi dan asal">
                <Field label="Gudang">{batch.warehouseName ?? NONE}</Field>
                <Field label="Cabang">{branchName ?? NONE}</Field>
                <Field label="Asal">
                  {batch.receiptId ? (
                    <Link
                      href={`/dashboard/purchasing/receipts/${batch.receiptId}`}
                      className="text-primary-hover underline-offset-2 hover:underline"
                    >
                      Penerimaan barang
                    </Link>
                  ) : (
                    <span>Saldo awal / penyesuaian</span>
                  )}
                </Field>
                <Field label="Dibuat pada">
                  {new Date(batch.createdAt).toLocaleString("id-ID", DATE_TIME)}
                </Field>
              </Section>

              {onShowMovements && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onShowMovements(batch)}
                  >
                    {movementsLabel}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
