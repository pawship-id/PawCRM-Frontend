"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Card } from "@/components";
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
  isPositive,
  multiplyDecimals,
  sumDecimals,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";
import type { ReturnReason } from "@/types/purchasing";

import * as demo from "@/features/inventory/data/demoStore";
import { useInventoryDemo } from "@/features/inventory/hooks/useInventoryDemo";
import { JournalPreview } from "@/features/inventory/components/JournalPreview";

const REASONS: Array<{ value: ReturnReason; label: string }> = [
  { value: "rusak", label: "Rusak" },
  { value: "kadaluarsa", label: "Kadaluarsa" },
  { value: "salah kirim", label: "Salah kirim" },
  { value: "lainnya", label: "Lainnya" },
];

/**
 * Send goods back to the supplier.
 *
 * THE RETURN IS ALWAYS DRAWN FROM A RECEIPT, never entered free-hand, and that
 * constraint is the whole design. The receipt line carries the price ACTUALLY
 * PAID, and reversing the weighted average needs exactly that number — reversing
 * at today's running average would remove a different amount of value than was
 * ever put in, leaving the stock that stays behind valued at a price nobody paid.
 *
 * WHAT SURPRISES PEOPLE, and why the preview spells it out: returning goods that
 * were CHEAPER than the current average makes the remaining stock more
 * expensive. That is arithmetically right — the cheap units are the ones
 * leaving — but it looks like a bug the first time somebody watches HPP rise
 * after sending something back.
 *
 * Consignment lots are exempt. They carry the supplier's own cost and never
 * contributed to the average, so taking them back must not disturb it either.
 */
export function PurchaseReturnForm({ receiptId }: { receiptId?: string }) {
  const router = useRouter();
  const {
    receipts,
    receiptItems,
    suppliers,
    products,
    batches,
    invoices,
    sync,
  } = useInventoryDemo();

  // Only outright purchases can be returned for credit: a consignment delivery
  // was never bought, so there is no debt to reduce.
  const returnable = receipts.filter(
    (receipt) => receipt.receiptType === "beli_putus",
  );

  const [selectedReceipt, setSelectedReceipt] = useState(
    receiptId ?? returnable[0]?._id ?? "",
  );
  const [returnDate, setReturnDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [drafts, setDrafts] = useState<
    Record<string, { qty: string; reason: ReturnReason }>
  >({});

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const lines = receiptItems.filter(
    (item) => item.receiptId === selectedReceipt,
  );

  const chosen = lines.filter((line) =>
    isPositive(drafts[line._id]?.qty ?? ""),
  );

  const total = sumDecimals(
    chosen.map((line) =>
      multiplyDecimals(drafts[line._id].qty, line.costPerUnit),
    ),
  );

  /**
   * Not memoized on purpose. `chosen` is a fresh array on every render, so a
   * `useMemo` keyed on it would recompute anyway while telling the React
   * Compiler it could not preserve the memoization. The work is a handful of
   * lookups over the lines of one receipt — cheaper than the bookkeeping.
   */
  const previews = chosen
    .map((line) => {
      const batch = line.batchId
        ? batches.find((b) => b._id === line.batchId)
        : undefined;
      return demo.previewReverseHpp(
        line.productId,
        drafts[line._id].qty,
        line.costPerUnit,
        batch?.isConsignment === true,
      );
    })
    .filter(Boolean);

  const invoice = invoices.find((i) => i.goodsReceiptId === selectedReceipt);
  const journal = demo.previewReturnJournal(total);

  function setDraft(
    lineId: string,
    patch: Partial<{ qty: string; reason: ReturnReason }>,
  ) {
    setDrafts((prev) => ({
      ...prev,
      // Defaults first, then whatever the row already held, then the patch —
      // spread order matters, and listing the literal keys alongside a spread
      // that also carries them is how a default silently wins over a real value.
      [lineId]: {
        qty: prev[lineId]?.qty ?? "",
        reason: prev[lineId]?.reason ?? "rusak",
        ...patch,
      },
    }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (chosen.length === 0) {
      setFormError("Pilih minimal satu barang untuk diretur.");
      return;
    }

    setSaving(true);
    try {
      const created = demo.submitPurchaseReturn({
        originalReceiptId: selectedReceipt,
        returnDate,
        items: chosen.map((line) => ({
          originalReceiptItemId: line._id,
          qty: drafts[line._id].qty,
          reason: drafts[line._id].reason,
        })),
      });

      sync();
      router.push("/dashboard/purchasing/returns");
      swalToast(
        `Retur ${created.returnNumber} tersimpan — HPP & utang diperbarui.`,
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

  if (returnable.length === 0) {
    return (
      <Alert variant="info">
        Belum ada penerimaan beli putus yang bisa diretur. Konsinyasi tidak bisa
        diretur lewat jalur ini — barangnya memang belum pernah dibeli.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      <Card title="Penerimaan asal">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt">Pilih penerimaan</Label>
            <Select
              value={selectedReceipt}
              onValueChange={(value) => {
                setSelectedReceipt(value);
                setDrafts({});
              }}
            >
              <SelectTrigger id="receipt" aria-label="Pilih penerimaan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {returnable.map((item) => (
                  <SelectItem key={item._id} value={item._id}>
                    {item.receiptNumber} ·{" "}
                    {suppliers.find((s) => s._id === item.supplierId)?.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted">
              Hanya beli putus — harga beli aslinya ikut terbawa dari sini.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="returnDate">Tanggal retur</Label>
            <Input
              id="returnDate"
              type="date"
              value={returnDate}
              onChange={(event) => setReturnDate(event.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card title="Barang yang dikembalikan">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
                <th className="px-2 py-2 text-left font-medium">Produk</th>
                <th className="px-2 py-2 text-right font-medium">Diterima</th>
                <th className="px-2 py-2 text-right font-medium">
                  Sudah diretur
                </th>
                <th className="px-2 py-2 text-right font-medium">Maks</th>
                <th className="px-2 py-2 text-right font-medium">
                  Harga beli asli
                </th>
                <th className="px-2 py-2 text-right font-medium">Qty retur</th>
                <th className="px-2 py-2 text-left font-medium">Alasan</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const product = products.find((p) => p._id === line.productId);
                const already = demo.returnedQtyOf(line._id);
                const max = toDecimalString(
                  (toMinor(line.qty) ?? 0n) - (toMinor(already) ?? 0n),
                );
                const exhausted = (toMinor(max) ?? 0n) <= 0n;
                const draft = drafts[line._id];
                const active = isPositive(draft?.qty ?? "");

                return (
                  <tr
                    key={line._id}
                    className={cn(
                      "border-b border-border/60 last:border-0",
                      active && "bg-primary/5",
                    )}
                  >
                    <td className="px-2 py-2">
                      <p className="text-sm font-medium">
                        {product?.name ?? "—"}
                      </p>
                      <p className="font-mono text-xs text-muted">
                        {product?.sku}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-muted">
                      {formatQty(line.qty)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-muted">
                      {(toMinor(already) ?? 0n) > 0n ? formatQty(already) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs font-semibold tabular-nums">
                      {formatQty(max)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                      {formatMoney(line.costPerUnit)}
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        aria-label={`Qty retur ${product?.name ?? ""}`}
                        inputMode="decimal"
                        placeholder="0"
                        disabled={exhausted}
                        value={draft?.qty ?? ""}
                        onChange={(event) =>
                          setDraft(line._id, { qty: event.target.value })
                        }
                        className="ml-auto max-w-20 text-right font-mono"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Select
                        value={draft?.reason ?? "rusak"}
                        onValueChange={(value) =>
                          setDraft(line._id, { reason: value as ReturnReason })
                        }
                      >
                        <SelectTrigger
                          aria-label={`Alasan ${product?.name ?? ""}`}
                          className="w-36"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REASONS.map((reason) => (
                            <SelectItem key={reason.value} value={reason.value}>
                              {reason.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ------------------------------------------- reverse weighted HPP */}
      {previews.length > 0 && (
        <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-primary-hover">
            HPP dihitung ulang dengan HARGA BELI ASLI, bukan HPP berjalan
          </p>
          <div className="mt-2 flex flex-col gap-1 overflow-x-auto">
            {previews.map((preview, index) => (
              <p
                key={index}
                className="whitespace-nowrap font-mono text-[13px] leading-7"
              >
                {preview!.productName} <span className="text-muted">→</span>{" "}
                {preview!.skipped ? (
                  <span className="text-muted">
                    lot konsinyasi — HPP tidak dihitung ulang
                  </span>
                ) : preview!.hppAfter === null ? (
                  <>
                    stok habis <span className="text-muted">→</span>{" "}
                    <b className="text-primary-hover">HPP direset (null)</b>
                  </>
                ) : (
                  <>
                    (({formatQty(preview!.qtyBefore)}{" "}
                    <span className="text-muted">×</span>{" "}
                    {formatMoney(preview!.hppBefore)}){" "}
                    <span className="text-muted">−</span> (
                    {formatQty(preview!.qtyReturned)}{" "}
                    <span className="text-muted">×</span>{" "}
                    {formatMoney(preview!.originalCost)})){" "}
                    <span className="text-muted">÷</span>{" "}
                    {formatQty(preview!.qtyAfter)}{" "}
                    <span className="text-muted">=</span>{" "}
                    <b className="text-primary-hover">
                      {formatMoneyPrecise(preview!.hppAfter)}
                    </b>
                  </>
                )}
              </p>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Kalau barang yang dikembalikan <b>lebih murah</b> dari rata-rata,
            HPP sisa stok justru <b>naik</b>. Itu benar secara hitungan — unit
            murahnya yang pergi — dan inilah yang menjaga nilai persediaan tetap
            sama dengan uang yang benar-benar keluar.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <JournalPreview
          lines={journal}
          emptyReason="Isi qty retur untuk melihat jurnal yang akan dibuat."
        />

        <Card title="Ringkasan">
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Baris diretur</span>
              <b className="font-mono tabular-nums">{chosen.length}</b>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <b>Nilai retur</b>
              <b className="font-mono text-base tabular-nums">
                {formatMoney(total)}
              </b>
            </div>
            {invoice && (toMinor(total) ?? 0n) > 0n && (
              <p className="mt-1 text-xs text-muted">
                Faktur <b className="font-mono">{invoice.invoiceNumber}</b>{" "}
                otomatis berkurang {formatMoney(total)} — supaya utang dan stok
                tetap sepakat.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || chosen.length === 0}>
          {saving ? "Menyimpan…" : "Simpan retur"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/dashboard/purchasing/returns")}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}
