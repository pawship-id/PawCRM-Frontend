"use client";

import { useMemo, useState } from "react";

import { Alert, Button, Card, TextField } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, isDecimal, isPositive } from "@/utils/decimal";

import * as demo from "../data/demoStore";
import { useInventoryDemo } from "../hooks/useInventoryDemo";
import { FefoPreview } from "./FefoPreview";
import { HppStrip } from "./HppStrip";
import { JournalPreview } from "./JournalPreview";
import { WarehouseProductPicker } from "./WarehouseProductPicker";

/**
 * Manual stock adjustment — and, on the way in, how a tenant enters its OPENING
 * STOCK before the purchasing module exists.
 *
 * ONE FORM, TWO DIRECTIONS, and the direction is a first-class control rather
 * than a minus sign the user has to remember to type. The API takes a signed
 * quantity (`"-3"` writes stock off), but asking a shop owner to type a negative
 * number to record breakage is how you get "-3" entered as "3" on a Monday
 * morning. The toggle owns the sign; the field only ever holds a magnitude.
 *
 * The two directions are genuinely different operations underneath, which is
 * why the form changes shape:
 *
 *   MASUK  — acquires stock, so it moves the weighted average and, for goods
 *            that expire, creates a lot. Shows the HPP strip and asks for the
 *            batch details the backend requires.
 *   KELUAR — draws from existing lots, so it moves no cost and creates nothing.
 *            Shows the FEFO allocation instead: which lots, and how many ledger
 *            rows the one request will actually write.
 */
export function StockAdjustmentForm() {
  const { products, warehouses, sync } = useInventoryDemo();

  const [warehouseId, setWarehouseId] = useState(warehouses[0]._id);
  const [productId, setProductId] = useState(demo.firstStockProduct(products)!._id);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [qty, setQty] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [isConsignment, setIsConsignment] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const product = products.find((p) => p._id === productId)!;
  const onHand = demo.qtyOnHand(productId, warehouseId);
  const inbound = direction === "in";

  /**
   * A lot is required when the goods expire — the promise `hasExpiry` makes and
   * the one the backend finally enforces — or when they arrive on consignment,
   * which carries its own hand-entered cost.
   */
  const needsBatch = inbound && (product.hasExpiry || isConsignment);

  const hppPreview = useMemo(
    () =>
      inbound && isPositive(qty)
        ? demo.previewHpp(productId, qty, costPerUnit || null)
        : null,
    [inbound, qty, productId, costPerUnit],
  );

  const fefo = useMemo(
    () => (!inbound && isPositive(qty) ? demo.previewFefo(productId, warehouseId, qty) : []),
    [inbound, qty, productId, warehouseId],
  );

  const journal = useMemo(() => {
    if (!isPositive(qty)) return [];
    const signed = inbound ? qty : `-${qty}`;
    return demo.previewJournal("adjustment", signed, hppPreview?.after ?? product.hppAvg);
  }, [qty, inbound, hppPreview, product.hppAvg]);

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (qty.trim() === "") next.qty = "Jumlah wajib diisi.";
    else if (!isDecimal(qty)) next.qty = "Gunakan angka, maksimal 4 desimal.";
    else if (!isPositive(qty)) next.qty = "Jumlah harus lebih dari nol.";

    if (needsBatch && batchCode.trim() === "") {
      next.batchCode = "Produk ini melacak batch — kode batch wajib diisi.";
    }
    if (inbound && product.hasExpiry && expiryDate === "") {
      next.expiryDate = "Produk ini punya masa kedaluwarsa — tanggal wajib diisi.";
    }
    if (costPerUnit.trim() !== "" && !isDecimal(costPerUnit)) {
      next.costPerUnit = "Gunakan angka, maksimal 4 desimal.";
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
      const written = demo.postAdjustment({
        operation: "adjustment",
        productId,
        warehouseId,
        // The toggle owns the sign — see the header.
        qty: inbound ? qty : `-${qty}`,
        batchCode: needsBatch ? batchCode.trim() : undefined,
        expiryDate: inbound && expiryDate ? expiryDate : undefined,
        costPerUnit: inbound && costPerUnit.trim() !== "" ? costPerUnit : undefined,
        isConsignment: inbound ? isConsignment : undefined,
      });

      sync();
      setQty("");
      setBatchCode("");
      setExpiryDate("");
      setCostPerUnit("");
      setIsConsignment(false);
      setFieldErrors({});
      swalToast(
        written.length === 1
          ? "Penyesuaian tersimpan — 1 baris ditulis ke kartu stok."
          : `Penyesuaian tersimpan — ${written.length} baris ditulis (FEFO memecah ke ${written.length} lot).`,
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* ---------------------------------------------------------- input */}
        <div className="flex flex-col gap-6">
          <Card title="Barang & lokasi">
            <div className="flex flex-col gap-4">
              <WarehouseProductPicker
                warehouses={warehouses}
                products={products}
                warehouseId={warehouseId}
                productId={productId}
                onWarehouseChange={setWarehouseId}
                onProductChange={setProductId}
              />

              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent/60 px-3 py-2 text-sm">
                <span className="text-muted">Stok saat ini</span>
                <b className="font-mono tabular-nums">
                  {formatQty(onHand)} {product.unit}
                </b>
                <span className="text-muted">·</span>
                <span className="text-muted">HPP</span>
                <b className="font-mono tabular-nums">
                  {product.hppAvg ? formatMoney(product.hppAvg) : "belum terbentuk"}
                </b>
                {product.hasExpiry && (
                  <Badge variant="outline" className="ml-auto border-secondary text-secondary-foreground">
                    melacak kedaluwarsa
                  </Badge>
                )}
              </div>
            </div>
          </Card>

          <Card title="Penyesuaian">
            <div className="flex flex-col gap-4">
              <div>
                <Label className="mb-1.5 block">Arah penyesuaian</Label>
                <div className="inline-flex rounded-lg bg-accent p-1">
                  {(
                    [
                      ["in", "Barang masuk (+)"],
                      ["out", "Barang keluar (−)"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDirection(value)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition",
                        direction === value
                          ? "bg-surface text-foreground shadow-sm"
                          : "text-muted hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {inbound
                    ? "Menambah stok — juga dipakai untuk input stok awal saat pertama memakai PawCRM."
                    : "Mengurangi stok — barang rusak, hilang, atau terpakai sendiri."}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label={`Jumlah (${product.unit})`}
                  name="qty"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  error={fieldErrors.qty}
                  hint="Isi angka positif. Arahnya ditentukan tombol di atas."
                  placeholder="mis. 12 atau 2,5 → tulis 2.5"
                  required
                />

                {inbound && (
                  <TextField
                    label="Harga beli per unit"
                    name="costPerUnit"
                    inputMode="decimal"
                    value={costPerUnit}
                    onChange={(e) => setCostPerUnit(e.target.value)}
                    error={fieldErrors.costPerUnit}
                    hint={
                      isConsignment
                        ? "Wajib untuk konsinyasi — tidak ada pembelian yang bisa jadi acuan."
                        : "Kosongkan bila barang masuk pada HPP rata-rata yang berlaku."
                    }
                    placeholder={product.hppAvg ? formatMoney(product.hppAvg) : "mis. 118500"}
                  />
                )}
              </div>

              {inbound && (
                <>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="isConsignment"
                      checked={isConsignment}
                      onCheckedChange={(checked) => setIsConsignment(checked === true)}
                    />
                    <div>
                      <Label htmlFor="isConsignment">Barang konsinyasi (titipan)</Label>
                      <p className="text-xs text-muted">
                        Barang milik supplier sampai laku. Dibuatkan lot sendiri
                        supaya harga titipannya tidak tercampur.
                      </p>
                    </div>
                  </div>

                  {needsBatch && (
                    <div className="grid gap-4 rounded-lg border border-secondary/40 bg-secondary/10 p-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <p className="text-xs font-medium text-secondary-foreground">
                          {product.hasExpiry
                            ? "Produk ini punya masa kedaluwarsa — batch dan tanggal wajib diisi."
                            : "Konsinyasi selalu dibuatkan lot tersendiri."}
                        </p>
                      </div>
                      <TextField
                        label="Kode batch"
                        name="batchCode"
                        value={batchCode}
                        onChange={(e) => setBatchCode(e.target.value)}
                        error={fieldErrors.batchCode}
                        placeholder="mis. WSK-B26-0640"
                        required
                      />
                      <TextField
                        label="Tanggal kedaluwarsa"
                        name="expiryDate"
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        error={fieldErrors.expiryDate}
                        required={product.hasExpiry}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>

        {/* -------------------------------------------------------- preview */}
        <div className="flex flex-col gap-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            Yang akan terjadi
          </p>

          {inbound ? (
            <HppStrip preview={hppPreview} />
          ) : (
            <FefoPreview allocations={fefo} />
          )}

          <JournalPreview
            lines={journal}
            emptyReason={
              isPositive(qty)
                ? "Barang ini belum punya HPP, jadi belum ada nilai untuk dijurnal. Yang berpindah baru kuantitasnya."
                : "Isi jumlah untuk melihat jurnal yang akan dibuat."
            }
          />

          {!inbound && fefo.length > 1 && (
            <div className="rounded-lg border border-border bg-accent/50 px-4 py-3 text-xs text-muted">
              Satu permintaan ini akan menulis <b>{fefo.length} baris</b> di kartu
              stok — satu per lot. Itu disengaja: enam bulan lagi, pertanyaan
              &ldquo;batch mana yang keluar&rdquo; masih bisa dijawab dari
              catatan, bukan dikira-kira.
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan penyesuaian"}
            </Button>
          </div>

          <p className="text-xs text-muted">
            Kartu stok bersifat <b>append-only</b>. Penyesuaian tidak mengubah
            baris lama — ia menambah baris baru, sehingga koreksi dan kesalahannya
            sama-sama tetap terlihat.
          </p>
        </div>
      </div>
    </form>
  );
}
