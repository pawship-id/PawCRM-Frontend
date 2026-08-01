"use client";

import { useMemo, useState } from "react";

import { Alert, Button, Card, TextField } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { swalToast } from "@/lib/swal";
import { formatMoney, formatQty, isDecimal, isPositive, multiplyDecimals } from "@/utils/decimal";

import * as demo from "../data/demoStore";
import { useInventoryDemo } from "../hooks/useInventoryDemo";
import { ExpiryBadge } from "./ExpiryBadge";
import { JournalPreview } from "./JournalPreview";

/**
 * Move stock between warehouses — the "siapkan barang untuk bazar" flow.
 *
 * WHAT THIS FORM HAS TO EXPLAIN, and why it is the most preview-heavy of the
 * three: a transfer looks like the simplest operation on the module and is
 * quietly the most surprising one underneath.
 *
 *   1. ONE REQUEST, MANY ROWS. The user types one quantity. FEFO decides which
 *      lots supply it, and every lot produces a PAIR of ledger rows — one out at
 *      the source, one in at the destination. "Pindahkan 10" can be four rows.
 *   2. LOTS TRAVEL. Each destination row re-creates the source lot with the same
 *      code, expiry and cost. Without that, transferring goods that expire would
 *      strip their expiry, and the receiving warehouse would hold stock FEFO
 *      could never order and the expiry report could never see.
 *   3. NO JOURNAL. Total inventory value does not change, so double-entry has
 *      nothing to record. Users who have just learned that every stock action
 *      posts to the books need to be told this one does not, or they go looking
 *      for the missing entry.
 *
 * The user never types a batch code here, deliberately: they move a QUANTITY and
 * the system decides which lots. Letting them retype the code would be an
 * invitation to move batch A and have it arrive labelled batch B.
 */
export function StockTransferForm() {
  const { products, warehouses, sync } = useInventoryDemo();

  const active = warehouses.filter((warehouse) => warehouse.isActive);

  const [fromWarehouseId, setFrom] = useState(active[0]._id);
  const [toWarehouseId, setTo] = useState(active[1]?._id ?? active[0]._id);
  const [productId, setProductId] = useState(demo.firstStockProduct(products)!._id);
  const [qty, setQty] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const product = products.find((p) => p._id === productId)!;
  const available = demo.qtyOnHand(productId, fromWarehouseId);
  const sameWarehouse = fromWarehouseId === toWarehouseId;

  const allocations = useMemo(
    () =>
      !sameWarehouse && isPositive(qty)
        ? demo.previewFefo(productId, fromWarehouseId, qty)
        : [],
    [sameWarehouse, qty, productId, fromWarehouseId],
  );

  const fromName = warehouses.find((w) => w._id === fromWarehouseId)?.name ?? "";
  const toName = warehouses.find((w) => w._id === toWarehouseId)?.name ?? "";
  const movedValue =
    product.hppAvg && isPositive(qty) ? multiplyDecimals(qty, product.hppAvg) : null;

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (sameWarehouse) {
      next.toWarehouseId = "Gudang asal dan tujuan harus berbeda.";
    }
    if (qty.trim() === "") next.qty = "Jumlah wajib diisi.";
    else if (!isDecimal(qty)) next.qty = "Gunakan angka, maksimal 4 desimal.";
    else if (!isPositive(qty)) {
      // "Pindahkan -5 dari A ke B" adalah transfer arah sebaliknya yang ditulis
      // supaya setiap laporan terbaca terbalik. Arah datang dari dua gudangnya.
      next.qty = "Jumlah harus positif — arah ditentukan gudang asal dan tujuan.";
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setSaving(true);
    try {
      const written = demo.postTransfer({
        operation: "transfer",
        productId,
        fromWarehouseId,
        toWarehouseId,
        qty,
      });

      sync();
      setQty("");
      setFieldErrors({});
      swalToast(
        `Transfer tersimpan — ${written.length} baris ditulis (${written.length / 2} lot berpindah).`,
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="flex flex-col gap-6">
          <Card title="Perpindahan">
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="from">Dari gudang</Label>
                  <Select value={fromWarehouseId} onValueChange={setFrom}>
                    <SelectTrigger id="from" aria-label="Dari gudang">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {active.map((warehouse) => (
                        <SelectItem key={warehouse._id} value={warehouse._id}>
                          {warehouse.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="to">Ke gudang</Label>
                  <Select value={toWarehouseId} onValueChange={setTo}>
                    <SelectTrigger
                      id="to"
                      aria-label="Ke gudang"
                      aria-invalid={sameWarehouse || undefined}
                      className={sameWarehouse ? "border-danger" : undefined}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {active.map((warehouse) => (
                        <SelectItem key={warehouse._id} value={warehouse._id}>
                          {warehouse.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.toWarehouseId && (
                    <p role="alert" className="text-xs text-danger">
                      {fieldErrors.toWarehouseId}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="transferProduct">Produk</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger id="transferProduct" aria-label="Produk">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Only what can hold stock — a parent's quantity is its
                          variants' and a bundle consumes its components. */}
                      {products.filter(demo.canHoldStock).map((item) => (
                        <SelectItem key={item._id} value={item._id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <TextField
                  label={`Jumlah (${product.unit})`}
                  name="qty"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  error={fieldErrors.qty}
                  hint={`Tersedia ${formatQty(available)} ${product.unit} di ${fromName}.`}
                  required
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent/60 px-3 py-2 text-sm">
                <span className="font-medium">{fromName}</span>
                <span className="text-primary">→</span>
                <span className="font-medium">{toName}</span>
                {movedValue && (
                  <>
                    <span className="text-muted">·</span>
                    <span className="text-muted">nilai berpindah</span>
                    <b className="font-mono tabular-nums">{formatMoney(movedValue)}</b>
                  </>
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            Yang akan terjadi
          </p>

          {allocations.length > 0 ? (
            <div className="rounded-lg border border-border bg-surface">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                  Lot yang berpindah
                </p>
                <Badge variant="outline" className="ml-auto">
                  {allocations.length * 2} baris movement
                </Badge>
              </div>

              <ul className="divide-y divide-border/60">
                {allocations.map((allocation, index) => (
                  <li key={allocation.batch?._id ?? index} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">
                        {allocation.batch?.batchCode ?? "tanpa lot"}
                      </span>
                      {allocation.batch?.expiryDate && (
                        <ExpiryBadge date={allocation.batch.expiryDate} />
                      )}
                      <span className="ml-auto font-mono text-sm font-semibold tabular-nums">
                        {formatQty(allocation.qty)}
                      </span>
                    </div>

                    {/* The pair. Showing both halves is the point: the lot is not
                        moved, it is closed here and re-opened there. */}
                    <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px]">
                      <div className="rounded-md bg-danger/8 px-2 py-1.5">
                        <p className="font-mono text-danger">
                          −{formatQty(allocation.qty)}
                        </p>
                        <p className="truncate text-muted">{fromName}</p>
                      </div>
                      <span className="text-muted">→</span>
                      <div className="rounded-md bg-success/10 px-2 py-1.5">
                        <p className="font-mono text-success">
                          +{formatQty(allocation.qty)}
                        </p>
                        <p className="truncate text-muted">{toName}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
                Setiap lot dibuat ulang di gudang tujuan dengan <b>kode, tanggal
                kedaluwarsa, dan harga beli yang sama</b>. Tanpa itu, memindahkan
                barang berkedaluwarsa akan menghapus tanggalnya — dan gudang
                tujuan menyimpan stok yang tidak bisa diurutkan FEFO.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted">
              Isi jumlah untuk melihat lot mana yang akan dipindahkan.
            </div>
          )}

          <JournalPreview
            lines={[]}
            emptyReason="Transfer TIDAK membuat jurnal. Barang masih milik tenant yang sama — hanya lokasinya yang berubah, jadi nilai persediaan sebelum dan sesudah sama persis."
          />

          <Button type="submit" disabled={saving || sameWarehouse}>
            {saving ? "Menyimpan…" : "Simpan transfer"}
          </Button>

          <p className="text-xs text-muted">
            Catatan desain: bila kedua gudang berada di <b>cabang berbeda</b>,
            nilai persediaan sebenarnya berpindah antar dua pembukuan. Itu dicatat
            sebagai keputusan yang diketahui dan akan ditinjau ulang saat laporan
            keuangan per cabang dibangun.
          </p>
        </div>
      </div>
    </form>
  );
}
