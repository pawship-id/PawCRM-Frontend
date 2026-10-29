"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { MarketplaceOrderRecord } from "@/types/marketplace";

import { formatDateTime, formatRupiah } from "../labels";

type HeldLine = NonNullable<MarketplaceOrderRecord["lines"]>[number];

/** Shopee's Harga Awal — older held rows may lack it, so fall back to the paid price. */
const unitPrice = (line: HeldLine) => line.originalPrice ?? line.subtotal / line.qty;

/**
 * Lihat pesanan — a held order as the mockup draws it: the order's facts, each
 * line with whether its SKU is bound (and Ikat SKU when it is not), then what
 * the invoice will be once every line is bound. Nothing here writes.
 */
export function HeldOrderDialog({
  order,
  storeLabel,
  onBind,
  onClose,
}: {
  order: MarketplaceOrderRecord;
  storeLabel: string;
  onBind: (sku: string) => void;
  onClose: () => void;
}) {
  const unbound = new Set(order.unboundSkus ?? []);
  const lines = order.lines ?? [];
  const gross = lines.reduce((sum, line) => sum + unitPrice(line) * line.qty, 0);
  const discount = lines.reduce((sum, line) => sum + (line.sellerDiscount ?? 0), 0);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Pesanan tertahan</DialogTitle>
        </DialogHeader>

        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-surface-hover p-4 text-sm">
          <dt className="text-muted">No. pesanan</dt>
          <dd className="font-semibold tabular-nums text-foreground">{order.orderNo}</dd>
          <dt className="text-muted">Toko</dt>
          <dd className="text-foreground">{storeLabel}</dd>
          <dt className="text-muted">Tanggal</dt>
          <dd className="tabular-nums text-foreground">{formatDateTime(order.paidAt ?? order.orderedAt)}</dd>
          <dt className="text-muted">Status Shopee</dt>
          <dd className="text-foreground">{order.shopeeStatus ?? "—"}</dd>
          <dt className="text-muted">Pembeli</dt>
          <dd className="text-foreground">{order.buyerUsername ?? "—"}</dd>
          <dt className="text-muted">Diimpor dari</dt>
          <dd className="break-all text-foreground">{order.sourceFileName ?? "—"}</dd>
        </dl>

        <section className="space-y-1">
          <h3 className="text-xs font-semibold tracking-wide text-muted">Barang</h3>
          <ul className="divide-y divide-border">
            {lines.map((line, index) => {
              const isUnbound = !line.sku || unbound.has(line.sku);
              return (
                <li key={`${line.sku}-${index}`} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-semibold text-foreground">{line.productName}</p>
                    <p className="text-sm text-muted">
                      {line.variationName ? `${line.variationName} · ` : ""}
                      <span className="tabular-nums text-primary">{line.sku ?? "Tanpa SKU"}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          isUnbound ? "bg-tint-warning text-warning" : "bg-tint-success text-success",
                        )}
                      >
                        {isUnbound ? "Belum terikat" : "Terikat"}
                      </span>
                      {isUnbound && line.sku ? (
                        <Button type="button" size="sm" onClick={() => onBind(line.sku as string)}>
                          Ikat SKU
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex-none text-right">
                    <p className="text-sm tabular-nums text-muted">
                      {line.qty} × {formatRupiah(unitPrice(line))}
                    </p>
                    <p className="flex items-baseline justify-end gap-2 tabular-nums">
                      {line.sellerDiscount ? (
                        <span className="text-sm text-muted line-through">
                          {formatRupiah(unitPrice(line) * line.qty)}
                        </span>
                      ) : null}
                      <span className="font-semibold text-foreground">{formatRupiah(line.subtotal)}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted">Rincian</h3>
          <dl className="divide-y divide-border rounded-xl border border-border text-sm">
            {[
              ["Harga awal", formatRupiah(gross)],
              ["Harga coret (diskon penjual)", formatRupiah(-discount)],
              ["Voucher penjual", formatRupiah(-(order.sellerVoucher ?? 0))],
              ["Nilai faktur nanti", formatRupiah(order.total)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 px-4 py-2.5">
                <dt className="text-muted">{label}</dt>
                <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
