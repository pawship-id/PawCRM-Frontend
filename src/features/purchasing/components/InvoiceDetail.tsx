"use client";

import { useState } from "react";

import { Alert, Button, Card, TextField } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button as UIButton } from "@/components/ui/button";
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
import { daysUntil } from "@/utils/date";
import {
  divideRound,
  formatMoney,
  formatQty,
  isDecimal,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";
import type { PaymentMethod } from "@/types/purchasing";

import * as demo from "@/features/inventory/data/demoStore";
import { useInventoryDemo } from "@/features/inventory/hooks/useInventoryDemo";
import { JournalPreview } from "@/features/inventory/components/JournalPreview";

const METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "transfer", label: "Transfer bank" },
  { value: "cash", label: "Tunai" },
  { value: "qris", label: "QRIS" },
  { value: "giro", label: "Giro" },
];

/**
 * One payable: what it is for, what has been paid, and the form to pay more.
 *
 * THE PAYMENT FORM LIVES HERE rather than on its own route because a payment
 * has no meaning apart from the invoice it clears — the amount is bounded by
 * what is outstanding, and the account it credits depends on how the money
 * left. Keeping them on one screen means the number being paid and the number
 * owed are never a navigation apart.
 *
 * The quick-amount buttons are not decoration: partial payment is the normal
 * case with suppliers on terms, and "half now" is a decision made far more often
 * than an arbitrary figure is typed.
 */
export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const {
    invoices,
    suppliers,
    receipts,
    receiptItems,
    products,
    payments,
    sync,
  } = useInventoryDemo();

  const invoice = invoices.find((i) => i._id === invoiceId);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [referenceNumber, setReferenceNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!invoice) {
    return (
      <Alert variant="error">
        Faktur tidak ditemukan. Mungkin data prototype sudah di-reset.
      </Alert>
    );
  }

  // Captured after the guard because `handlePay` is a hoisted declaration, and
  // TypeScript will not carry the narrowing into a function it has to analyse
  // before the guard has run.
  const active = invoice;

  const supplier = suppliers.find((s) => s._id === invoice.supplierId);
  const receipt = receipts.find((r) => r._id === invoice.goodsReceiptId);
  const items = receiptItems.filter(
    (item) => item.receiptId === invoice.goodsReceiptId,
  );
  const history = payments.filter(
    (payment) => payment.invoiceId === invoice._id,
  );

  const outstanding = demo.outstandingOf(invoice);
  const outstandingMinor = toMinor(outstanding) ?? 0n;
  const settled = invoice.status === "paid";
  const late = !settled && daysUntil(invoice.dueDate) < 0;

  const paidMinor = toMinor(invoice.paidAmount) ?? 0n;
  const totalMinor = toMinor(invoice.total) ?? 0n;
  const percent = totalMinor > 0n ? Number((paidMinor * 100n) / totalMinor) : 0;

  const journal = demo.previewPaymentJournal(
    isDecimal(amount) ? amount : "0",
    method,
  );

  /** A fraction of what is left, rounded to a whole rupiah. */
  function quickAmount(percentage: bigint) {
    setAmount(
      toDecimalString(divideRound(outstandingMinor * percentage, 100n)),
    );
  }

  function handlePay() {
    setError(null);

    if (!isDecimal(amount) || (toMinor(amount) ?? 0n) <= 0n) {
      setError("Jumlah pembayaran harus lebih dari nol.");
      return;
    }
    if ((toMinor(amount) ?? 0n) > outstandingMinor) {
      setError(`Jumlah melebihi sisa tagihan ${formatMoney(outstanding)}.`);
      return;
    }

    setSaving(true);
    try {
      demo.submitPayment({
        invoiceId: active._id,
        amount,
        method,
        paymentDate,
        referenceNumber,
      });
      sync();
      setAmount("");
      setReferenceNumber("");
      swalToast(`Pembayaran ${formatMoney(amount)} tercatat.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Terjadi kesalahan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-6 rounded-xl border border-border bg-surface p-4">
        <Field label="Faktur" value={invoice.invoiceNumber} mono />
        <Field label="Supplier" value={supplier?.name ?? "—"} />
        <Field label="Penerimaan" value={receipt?.receiptNumber ?? "—"} mono />
        <Field
          label="Jatuh tempo"
          value={new Date(invoice.dueDate).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
          tone={late ? "danger" : undefined}
        />
        <div className="ml-auto">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted">
            Status
          </p>
          <div className="mt-1">
            <Badge
              variant="outline"
              className={cn(
                "border-transparent",
                settled
                  ? "bg-success/12 text-success"
                  : invoice.status === "partial"
                    ? "bg-secondary/25 text-secondary-foreground"
                    : "bg-danger/10 text-danger",
              )}
            >
              {settled
                ? "lunas"
                : invoice.status === "partial"
                  ? "sebagian"
                  : "belum dibayar"}
            </Badge>
          </div>
        </div>
      </div>

      <Card title="Progres pembayaran">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap justify-between text-sm">
            <span className="text-muted">
              Terbayar {formatMoney(invoice.paidAmount)} dari{" "}
              {formatMoney(invoice.total)}
            </span>
            <b className="font-mono tabular-nums">{percent}%</b>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-accent">
            <div
              className="h-full bg-success transition-all"
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
          <p className="text-sm">
            Sisa tagihan{" "}
            <b
              className={cn(
                "font-mono tabular-nums",
                outstandingMinor > 0n && "text-danger",
              )}
            >
              {formatMoney(outstanding)}
            </b>
          </p>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Card title="Barang pada faktur ini">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
                  <th className="px-2 py-2 text-left font-medium">Produk</th>
                  <th className="px-2 py-2 text-right font-medium">Qty</th>
                  <th className="px-2 py-2 text-right font-medium">
                    Harga beli
                  </th>
                  <th className="px-2 py-2 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item._id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-2 py-2 text-xs">
                      {products.find((p) => p._id === item.productId)?.name ??
                        "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                      {formatQty(item.qty)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                      {formatMoney(item.costPerUnit)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                      {formatMoney(item.subtotal)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td
                    colSpan={3}
                    className="px-2 py-2 text-right text-xs font-semibold"
                  >
                    Total faktur
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-sm font-semibold tabular-nums">
                    {formatMoney(invoice.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* The invoice subtotal drifts BELOW the receipt total only when a
              return has clawed some of it back — which is worth saying, because
              otherwise the two documents appear to disagree. */}
          {(toMinor(invoice.subtotal) ?? 0n) <
            (toMinor(receipt?.totalAmount ?? invoice.subtotal) ?? 0n) && (
            <p className="mt-3 text-xs text-muted">
              Total faktur ini sudah <b>berkurang karena retur</b> — nilai
              barang yang dikembalikan dipotong otomatis dari utang.
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          {!settled ? (
            <Card title="Catat pembayaran">
              <div className="flex flex-col gap-4">
                {error && <Alert variant="error">{error}</Alert>}

                <div className="flex gap-1">
                  {([25n, 50n, 100n] as const).map((percentage) => (
                    <UIButton
                      key={String(percentage)}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => quickAmount(percentage)}
                    >
                      {percentage === 100n ? "Lunasi" : `${percentage}%`}
                    </UIButton>
                  ))}
                </div>

                <TextField
                  label="Jumlah dibayar"
                  name="amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  hint={`Maksimal ${formatMoney(outstanding)}`}
                />

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="method">Metode</Label>
                  <Select
                    value={method}
                    onValueChange={(value) => setMethod(value as PaymentMethod)}
                  >
                    <SelectTrigger id="method" aria-label="Metode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METHODS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted">
                    Tunai &amp; QRIS keluar dari Kas; transfer &amp; giro dari
                    Bank.
                  </p>
                </div>

                <TextField
                  label="Tanggal bayar"
                  name="paymentDate"
                  type="date"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                />

                <TextField
                  label="Nomor referensi"
                  name="referenceNumber"
                  value={referenceNumber}
                  onChange={(event) => setReferenceNumber(event.target.value)}
                  className="font-mono"
                  placeholder="opsional"
                />

                <Button type="button" onClick={handlePay} disabled={saving}>
                  {saving ? "Menyimpan…" : "Simpan pembayaran"}
                </Button>
              </div>
            </Card>
          ) : (
            <div className="rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm text-success">
              Faktur ini sudah lunas.
            </div>
          )}

          <JournalPreview
            lines={journal}
            emptyReason="Isi jumlah pembayaran untuk melihat jurnal yang akan dibuat."
          />
        </div>
      </div>

      <Card title="Riwayat pembayaran">
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Belum ada pembayaran untuk faktur ini.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {history.map((payment) => (
              <li
                key={payment._id}
                className="flex flex-wrap items-center gap-3 border-l-2 border-primary pl-3"
              >
                <b className="font-mono tabular-nums">
                  {formatMoney(payment.amount)}
                </b>
                <Badge variant="outline">{payment.method}</Badge>
                <span className="text-xs text-muted">
                  {new Date(payment.paymentDate).toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                  {payment.referenceNumber && ` · ${payment.referenceNumber}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "danger";
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-sm font-semibold",
          mono && "font-mono",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
    </div>
  );
}
