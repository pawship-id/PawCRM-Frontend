"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Button, Card, Spinner, TextField } from "@/components";
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
import { ApiError } from "@/services/api-error";
import { stockMovementService } from "@/services/stockMovement.service";
import {
  absDecimal,
  formatMoney,
  formatQty,
  isDecimal,
  isPositive,
  multiplyDecimals,
} from "@/utils/decimal";

import { useMovementPreview } from "../hooks/useMovementPreview";
import { useProductStock } from "../hooks/useProductStock";
import { useStockCardLookups } from "../hooks/useStockCardLookups";
import { newIdempotencyKey } from "../utils/idempotency";
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
 *
 * THE LOT PREVIEW IS FETCHED, NOT COMPUTED. `POST /stock-movements/preview` is
 * the posting path with the commit left off, so the pairs listed on the right
 * are the rows that will be written — including which lot each one carries. The
 * browser used to reimplement FEFO to draw this, which was a copy of a rule that
 * could go quietly out of date.
 */
export function StockTransferForm() {
  const lookups = useStockCardLookups();

  const [fromWarehouseId, setFrom] = useState("");
  const [toWarehouseId, setTo] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  /**
   * Minted once per INTENT, not per request: it survives a failed attempt — so a
   * retry of a save that may have landed replays instead of moving the stock
   * twice — and is replaced only after one succeeds.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  // ACTIVE only, both ends. The API refuses a movement at an inactive warehouse,
  // so offering one would produce a rejection after the form was filled in.
  const active = useMemo(
    () => lookups.warehouses.filter((warehouse) => warehouse.isActive),
    [lookups.warehouses],
  );

  useEffect(() => {
    if (fromWarehouseId || active.length === 0) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setFrom(active[0]._id);
    // The second warehouse, when there is one: defaulting both ends to the same
    // location would open the form in a state it refuses to submit.
    setTo(active[1]?._id ?? active[0]._id);
    setProductId((prev) => prev || (lookups.products[0]?._id ?? ""));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [active, lookups.products, fromWarehouseId]);

  const { product, qtyOnHand } = useProductStock(
    productId,
    fromWarehouseId,
    refreshKey,
  );

  const sameWarehouse = Boolean(
    fromWarehouseId && fromWarehouseId === toWarehouseId,
  );

  /**
   * The payload, built once and used for both the preview and the save.
   *
   * Identical on purpose: a preview of a DIFFERENT request is worse than no
   * preview, and this is the only place the two could diverge.
   */
  const payload = useMemo(
    () => ({
      operation: "transfer" as const,
      productId,
      fromWarehouseId,
      toWarehouseId,
      qty,
    }),
    [productId, fromWarehouseId, toWarehouseId, qty],
  );

  const preview = useMovementPreview(
    payload,
    Boolean(productId && !sameWarehouse && isPositive(qty)),
    refreshKey,
  );

  /**
   * The outbound half of each pair, which is what the list is about: one entry
   * per lot that leaves the source warehouse. The matching `transfer_in` is
   * rendered beside it, not as its own row.
   */
  const allocations = (preview.preview?.movements ?? []).filter(
    (row) => row.movementType === "transfer_out",
  );

  const fromName =
    lookups.warehouses.find((w) => w._id === fromWarehouseId)?.name ?? "";
  const toName =
    lookups.warehouses.find((w) => w._id === toWarehouseId)?.name ?? "";
  const movedValue =
    product?.hppAvg && isPositive(qty)
      ? multiplyDecimals(qty, product.hppAvg)
      : null;

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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setSaving(true);
    try {
      // The SAME payload the preview described, plus the retry token. Building a
      // second one here is how a form ends up saving something other than what
      // it showed.
      const written = await stockMovementService.create({
        ...payload,
        idempotencyKey,
      });

      setQty("");
      setFieldErrors({});
      setRefreshKey((key) => key + 1);
      // A new intent needs a new token; reusing this one would make the next
      // transfer look like a replay of this one and move nothing.
      setIdempotencyKey(newIdempotencyKey);

      // The row count is the server's. It writes a pair per lot, so an odd
      // number here would itself be worth noticing — which is why the message
      // reports rows and derives the lot count from them, rather than the other
      // way round.
      swalToast(
        `Transfer tersimpan — ${written.length} baris ditulis (${written.length / 2} lot berpindah).`,
      );
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.fullMessage
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (lookups.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat daftar produk dan gudang…
      </div>
    );
  }

  if (lookups.error) {
    return <Alert variant="error">{lookups.error}</Alert>;
  }

  if (active.length < 2) {
    return (
      <Alert variant="info">
        Transfer butuh <b>dua gudang aktif</b>. Tenant ini baru punya{" "}
        {active.length}. Tambahkan gudang lain di Master Data → Warehouse dulu.
      </Alert>
    );
  }

  if (!product) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface py-16 text-center">
        <p className="font-medium text-foreground">Pilih produk dulu</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          Transfer memindahkan satu produk dari satu gudang ke gudang lain.
        </p>
      </div>
    );
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
                      {/* The lookup already asked for `holdsStock` products, so
                          a parent or a bundle can never appear here. */}
                      {lookups.products.map((item) => (
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
                  hint={`Tersedia ${formatQty(qtyOnHand)} ${product.unit} di ${fromName}.`}
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
                    <b className="font-mono tabular-nums">
                      {formatMoney(movedValue)}
                    </b>
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
                {allocations.map((allocation, index) => {
                  // The API signs its quantities; both halves of the pair are
                  // drawn from the magnitude.
                  const moved = absDecimal(allocation.qty);

                  return (
                    <li key={allocation.batchId ?? index} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs">
                          {allocation.batchCode ?? "tanpa lot"}
                        </span>
                        {allocation.batchExpiryDate && (
                          <ExpiryBadge date={allocation.batchExpiryDate} />
                        )}
                        <span className="ml-auto font-mono text-sm font-semibold tabular-nums">
                          {formatQty(moved)}
                        </span>
                      </div>

                      {/* The pair. Showing both halves is the point: the lot is
                          not moved, it is closed here and re-opened there. */}
                      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px]">
                        <div className="rounded-md bg-danger/8 px-2 py-1.5">
                          <p className="font-mono text-danger">
                            −{formatQty(moved)}
                          </p>
                          <p className="truncate text-muted">{fromName}</p>
                        </div>
                        <span className="text-muted">→</span>
                        <div className="rounded-md bg-success/10 px-2 py-1.5">
                          <p className="font-mono text-success">
                            +{formatQty(moved)}
                          </p>
                          <p className="truncate text-muted">{toName}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
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
            Daftar lot di atas datang dari server — pembagian yang sama persis
            yang akan ditulis saat disimpan.
          </p>

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
