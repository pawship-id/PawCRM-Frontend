"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Card, TextField } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button as UIButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  formatMoneyPrecise,
  formatQty,
  isDecimal,
  isPositive,
  multiplyDecimals,
  sumDecimals,
  toDecimalString,
  toMinor,
  weightedAverage,
} from "@/utils/decimal";
import type { ReceiptType } from "@/types/purchasing";

import * as demo from "@/features/inventory/data/demoStore";
import { useInventoryDemo } from "@/features/inventory/hooks/useInventoryDemo";
import { JournalPreview } from "@/features/inventory/components/JournalPreview";

interface LineDraft {
  productId: string;
  qty: string;
  costPerUnit: string;
  batchCode: string;
  expiryDate: string;
}

/**
 * Record goods arriving from a supplier.
 *
 * THIS FORM IS WHERE HPP IS BORN. Every other screen reads the weighted average;
 * this is the one that moves it. That is why the calculation is shown per line
 * as arithmetic rather than as a result — the shop owner holding the supplier's
 * invoice can check the new average against the price on the paper in their
 * hand, which is the only moment anybody ever can.
 *
 * THE SIMULATION IS SEQUENTIAL, and that detail matters. Two lines of the same
 * product compound: the second is averaged against the result of the first, not
 * against the stored value. Previewing them independently would show two numbers
 * that neither matches what gets saved.
 *
 * BELI PUTUS vs KONSINYASI changes what the form even means. Outright, the goods
 * become the tenant's and a payable is created. Consigned, they sit in the
 * warehouse belonging to the supplier — stock rises, but nothing is owed and
 * nothing is journalled, because nothing has been bought.
 */
export function ReceiptForm({ supplierId }: { supplierId?: string }) {
  const router = useRouter();
  const { suppliers, warehouses, products, sync } = useInventoryDemo();

  const sellable = products.filter(demo.canHoldStock);
  const activeSuppliers = suppliers.filter((supplier) => supplier.isActive);

  const [supplier, setSupplier] = useState(
    supplierId ?? activeSuppliers[0]?._id ?? "",
  );
  const [warehouseId, setWarehouseId] = useState(warehouses[0]._id);
  const [receiptType, setReceiptType] = useState<ReceiptType>("beli_putus");
  const [receiptDate, setReceiptDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const consignment = receiptType === "konsinyasi";
  const currentSupplier = suppliers.find((s) => s._id === supplier);

  const subtotal = sumDecimals(
    lines.map((line) =>
      isDecimal(line.qty) && isDecimal(line.costPerUnit)
        ? multiplyDecimals(line.qty, line.costPerUnit)
        : "0",
    ),
  );
  const total = consignment
    ? subtotal
    : sumDecimals([subtotal, isDecimal(taxAmount) ? taxAmount : "0"]);

  const dueDate = useMemo(() => {
    const due = new Date(receiptDate);
    due.setDate(due.getDate() + (currentSupplier?.paymentTermDays ?? 0));
    return due.toISOString().slice(0, 10);
  }, [receiptDate, currentSupplier]);

  /**
   * The new average per line, simulated in ORDER so repeated products compound
   * exactly as the save will compute them.
   */
  const simulation = useMemo(() => {
    const runningQty = new Map<string, bigint>();
    const runningAvg = new Map<string, bigint>();

    return lines.map((line) => {
      const product = products.find((p) => p._id === line.productId);
      if (!product || !isPositive(line.qty) || !isDecimal(line.costPerUnit)) {
        return null;
      }

      const key = line.productId;
      const qtyBefore =
        runningQty.get(key) ?? toMinor(demo.totalQty(key)) ?? 0n;
      const avgBefore =
        runningAvg.get(key) ?? toMinor(product.hppAvg ?? "0") ?? 0n;
      const qtyIn = toMinor(line.qty) ?? 0n;
      const cost = toMinor(line.costPerUnit) ?? 0n;

      const after = weightedAverage(avgBefore, qtyBefore, cost, qtyIn);
      runningQty.set(key, (qtyBefore > 0n ? qtyBefore : 0n) + qtyIn);
      runningAvg.set(key, after);

      return {
        name: product.name,
        first: product.hppAvg === null && qtyBefore <= 0n,
        qtyBefore: toDecimalString(qtyBefore),
        avgBefore: toDecimalString(avgBefore),
        qtyIn: toDecimalString(qtyIn),
        cost: toDecimalString(cost),
        after: toDecimalString(after),
        rose: after > avgBefore,
        delta: toDecimalString(
          after > avgBefore ? after - avgBefore : avgBefore - after,
        ),
      };
    });
  }, [lines, products]);

  const journal = demo.previewReceiptJournal(
    subtotal,
    isDecimal(taxAmount) ? taxAmount : "0",
    consignment,
  );

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function addLine(productId: string) {
    const product = products.find((p) => p._id === productId);
    setLines((prev) => [
      ...prev,
      {
        productId,
        qty: "1",
        // Seeded with the current average so a re-order at the same price is one
        // keystroke, and a price CHANGE is visible as a change.
        costPerUnit: product?.hppAvg ?? "",
        batchCode: "",
        expiryDate: "",
      },
    ]);
  }

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!supplier) next.supplier = "Pilih supplier.";
    if (lines.length === 0) next.lines = "Tambahkan minimal satu barang.";

    for (const [index, line] of lines.entries()) {
      const product = products.find((p) => p._id === line.productId);
      const label = product?.name ?? `Baris ${index + 1}`;

      if (!isPositive(line.qty)) {
        next.lines = `${label}: qty harus lebih dari nol.`;
        break;
      }
      if (!isDecimal(line.costPerUnit) || !isPositive(line.costPerUnit)) {
        next.lines = consignment
          ? `${label}: HPP manual wajib diisi untuk barang konsinyasi.`
          : `${label}: harga beli wajib diisi.`;
        break;
      }
      if (product?.hasExpiry && line.batchCode.trim() === "") {
        next.lines = `${label}: produk ini melacak batch — kode batch wajib diisi.`;
        break;
      }
      if (product?.hasExpiry && line.expiryDate === "") {
        next.lines = `${label}: tanggal kedaluwarsa wajib diisi.`;
        break;
      }
    }

    if (!consignment && taxAmount.trim() !== "" && !isDecimal(taxAmount)) {
      next.taxAmount = "Gunakan angka, maksimal 4 desimal.";
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
      const receipt = demo.submitReceipt({
        supplierId: supplier,
        warehouseId,
        receiptType,
        receiptDate,
        invoiceNumber: invoiceNumber.trim() || undefined,
        taxAmount: consignment ? "0" : taxAmount.trim() || "0",
        notes,
        items: lines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
          costPerUnit: line.costPerUnit,
          batchCode: line.batchCode.trim() || undefined,
          expiryDate: line.expiryDate || undefined,
        })),
      });

      sync();
      router.push(`/dashboard/purchasing/receipts/${receipt._id}`);
      swalToast(
        consignment
          ? `${receipt.receiptNumber} tersimpan — stok naik, belum ada utang.`
          : `${receipt.receiptNumber} tersimpan — HPP & faktur diperbarui.`,
      );
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan. Coba lagi.",
      );
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      <div>
        <div className="inline-flex rounded-lg bg-accent p-1">
          {(
            [
              ["beli_putus", "Beli putus"],
              ["konsinyasi", "Konsinyasi (titipan)"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setReceiptType(value)}
              className={cn(
                "rounded-md px-3.5 py-2 text-sm font-medium transition",
                receiptType === value
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {consignment
            ? "Barang masuk gudang tapi masih milik supplier — tidak membuat faktur utang dan tidak menjurnal. HPP diisi manual per barang."
            : "Barang jadi milik toko saat diterima — faktur utang dibuat otomatis dan jurnal diposting."}
        </p>
      </div>

      <Card title="Dokumen">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier">Supplier</Label>
              <Select value={supplier} onValueChange={setSupplier}>
                <SelectTrigger id="supplier" aria-label="Supplier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeSuppliers.map((item) => (
                    <SelectItem key={item._id} value={item._id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.supplier && (
                <p role="alert" className="text-xs text-danger">
                  {fieldErrors.supplier}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="warehouse">Masuk ke gudang</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="warehouse" aria-label="Masuk ke gudang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {warehouses
                    .filter((warehouse) => warehouse.isActive)
                    .map((warehouse) => (
                      <SelectItem key={warehouse._id} value={warehouse._id}>
                        {warehouse.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <TextField
              label="Tanggal terima"
              name="receiptDate"
              type="date"
              value={receiptDate}
              onChange={(event) => setReceiptDate(event.target.value)}
            />
          </div>

          {!consignment && (
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField
                label="Nomor faktur supplier"
                name="invoiceNumber"
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                hint="Boleh dikosongkan — sistem membuat nomornya sendiri."
                className="font-mono"
                placeholder="INV/SPS/2026/0455"
              />
              <TextField
                label="PPN"
                name="taxAmount"
                inputMode="decimal"
                value={taxAmount}
                onChange={(event) => setTaxAmount(event.target.value)}
                error={fieldErrors.taxAmount}
                hint="Masuk ke akun 1301, bukan ke nilai persediaan."
                placeholder="0"
              />
              <div className="flex flex-col gap-1.5">
                <Label>Jatuh tempo</Label>
                <div className="flex h-9 items-center rounded-md border border-input bg-accent/40 px-3 text-sm">
                  {new Date(dueDate).toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
                <p className="text-xs text-muted">
                  Termin {currentSupplier?.paymentTermDays ?? 0} hari
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            Barang diterima
            <Badge variant="outline">{lines.length} baris</Badge>
            <span className="ml-auto w-64 font-normal">
              <Select value="" onValueChange={addLine}>
                <SelectTrigger aria-label="Tambah barang">
                  <SelectValue placeholder="+ Tambah barang…" />
                </SelectTrigger>
                <SelectContent>
                  {sellable.map((product) => (
                    <SelectItem key={product._id} value={product._id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </span>
          </span>
        }
      >
        {lines.length === 0 ? (
          <div className="py-10 text-center">
            <p className="font-medium">Belum ada barang</p>
            <p className="mt-1 text-sm text-muted">
              Pilih produk yang diterima dari supplier ini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
                  <th className="px-2 py-2 text-left font-medium">Produk</th>
                  <th className="px-2 py-2 text-right font-medium">Qty</th>
                  <th className="px-2 py-2 text-right font-medium">
                    {consignment ? "HPP manual" : "Harga beli"}
                  </th>
                  <th className="px-2 py-2 text-left font-medium">Batch</th>
                  <th className="px-2 py-2 text-left font-medium">Expired</th>
                  <th className="px-2 py-2 text-right font-medium">Subtotal</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const product = products.find(
                    (p) => p._id === line.productId,
                  );
                  return (
                    <tr
                      key={`${line.productId}-${index}`}
                      className="border-b border-border/60"
                    >
                      <td className="px-2 py-2">
                        <p className="font-medium">{product?.name}</p>
                        <p className="font-mono text-xs text-muted">
                          {product?.sku} · stok{" "}
                          {formatQty(
                            demo.qtyOnHand(line.productId, warehouseId),
                          )}
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          aria-label={`Qty ${product?.name ?? ""}`}
                          inputMode="decimal"
                          value={line.qty}
                          onChange={(event) =>
                            updateLine(index, { qty: event.target.value })
                          }
                          className="ml-auto max-w-20 text-right font-mono"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          aria-label={`Harga ${product?.name ?? ""}`}
                          inputMode="decimal"
                          value={line.costPerUnit}
                          onChange={(event) =>
                            updateLine(index, {
                              costPerUnit: event.target.value,
                            })
                          }
                          className="ml-auto max-w-28 text-right font-mono"
                        />
                      </td>
                      <td className="px-2 py-2">
                        {product?.hasExpiry ? (
                          <Input
                            aria-label={`Batch ${product.name}`}
                            value={line.batchCode}
                            onChange={(event) =>
                              updateLine(index, {
                                batchCode: event.target.value,
                              })
                            }
                            placeholder="wajib"
                            className="max-w-32 font-mono text-xs"
                          />
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {product?.hasExpiry ? (
                          <Input
                            aria-label={`Expired ${product.name}`}
                            type="date"
                            value={line.expiryDate}
                            onChange={(event) =>
                              updateLine(index, {
                                expiryDate: event.target.value,
                              })
                            }
                            className="max-w-36 text-xs"
                          />
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                        {isDecimal(line.qty) && isDecimal(line.costPerUnit)
                          ? formatMoney(
                              multiplyDecimals(line.qty, line.costPerUnit),
                            )
                          : "—"}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <UIButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-danger"
                          onClick={() =>
                            setLines((prev) =>
                              prev.filter((_, i) => i !== index),
                            )
                          }
                        >
                          Hapus
                        </UIButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {fieldErrors.lines && (
          <p role="alert" className="mt-3 text-xs text-danger">
            {fieldErrors.lines}
          </p>
        )}
      </Card>

      {/* ------------------------------------------------------- HPP preview */}
      {simulation.some(Boolean) && (
        <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-primary-hover">
            Perhitungan HPP rata-rata tertimbang
          </p>
          <div className="mt-2 flex flex-col gap-1 overflow-x-auto">
            {simulation.filter(Boolean).map((row, index) => (
              <p
                key={index}
                className="whitespace-nowrap font-mono text-[13px] leading-7"
              >
                {row!.name} <span className="text-muted">→</span>{" "}
                {row!.first ? (
                  <>
                    HPP pertama <span className="text-muted">=</span>{" "}
                    <b className="text-primary-hover">
                      {formatMoneyPrecise(row!.after)}
                    </b>
                  </>
                ) : (
                  <>
                    (({formatQty(row!.qtyBefore)}{" "}
                    <span className="text-muted">×</span>{" "}
                    {formatMoney(row!.avgBefore)}){" "}
                    <span className="text-muted">+</span> (
                    {formatQty(row!.qtyIn)}{" "}
                    <span className="text-muted">×</span>{" "}
                    {formatMoney(row!.cost)})){" "}
                    <span className="text-muted">÷</span>{" "}
                    {formatQty(
                      toDecimalString(
                        (toMinor(row!.qtyBefore) ?? 0n) +
                          (toMinor(row!.qtyIn) ?? 0n),
                      ),
                    )}{" "}
                    <span className="text-muted">=</span>{" "}
                    <b className="text-primary-hover">
                      {formatMoneyPrecise(row!.after)}
                    </b>{" "}
                    <span
                      className={row!.rose ? "text-danger" : "text-success"}
                    >
                      ({row!.rose ? "▲" : "▼"} {formatMoney(row!.delta)})
                    </span>
                  </>
                )}
              </p>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Angka inilah yang dipakai setiap penjualan berikutnya untuk
            menghitung HPP dan margin. Cocokkan dengan faktur supplier di
            tangan.
          </p>
        </div>
      )}

      {/* ------------------------------------------------ journal + totals */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <JournalPreview
          lines={journal}
          emptyReason={
            consignment
              ? "Konsinyasi tidak menjurnal — barang belum menjadi milik toko, jadi belum ada utang yang tercatat."
              : "Tambahkan barang untuk melihat jurnal yang akan dibuat."
          }
        />

        <Card title="Ringkasan">
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Subtotal</span>
              <b className="font-mono tabular-nums">{formatMoney(subtotal)}</b>
            </div>
            {!consignment && (
              <div className="flex justify-between">
                <span className="text-muted">PPN</span>
                <b className="font-mono tabular-nums">
                  {formatMoney(isDecimal(taxAmount) ? taxAmount : "0")}
                </b>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-border pt-2">
              <b>Total</b>
              <b className="font-mono text-base tabular-nums">
                {formatMoney(total)}
              </b>
            </div>
            {consignment && (
              <p className="mt-1 text-xs text-muted">
                Nilai titipan — belum menjadi utang.
              </p>
            )}
          </div>
        </Card>
      </div>

      <TextField
        label="Catatan"
        name="notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="opsional"
        className="max-w-xl"
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || lines.length === 0}>
          {saving ? "Menyimpan…" : "Simpan & terima barang"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/dashboard/purchasing/receipts")}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}
