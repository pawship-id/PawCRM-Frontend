"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Alert, Button, Card, Spinner, TextField } from "@/components";
// Only for the empty-state link — the project Button has no `asChild`.
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
import { ApiError } from "@/services/api-error";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import { formatMoney } from "@/utils/decimal";
import type { GoodsReceiptListRow } from "@/types/api";

import { useUninvoicedReceipts } from "../hooks/useUninvoicedReceipts";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** `yyyy-mm-dd` for today, as a date input holds it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * File the supplier's bill against a delivery — POST /purchase-invoices.
 *
 * WHAT THIS DOES NOT DO IS CREATE THE DEBT, and the heading says so. A
 * `beli_putus` receipt credited `2101 Utang Supplier` the moment it posted, so
 * this writes no journal entry at all. What it adds is the vendor's own invoice
 * number, the date they issued it, and the due date the server derives from
 * their payment terms — the three things the payable was missing.
 *
 * THE AMOUNTS ARE PREFILLED FROM THE RECEIPT AND READ-ONLY. They MUST match it
 * to the minor unit or the API refuses the whole request, because the payable is
 * already on the books at the receipt's numbers and a difference would be a price
 * variance nothing posted. Offering editable boxes would be offering a way to
 * fail: the only thing a clerk could do with them is retype the same figures, and
 * the only outcome of getting it wrong is a 400. A bill that genuinely disagrees
 * with the delivery is not something this form can express — the honest fix is a
 * purchase return or a corrected delivery, and the note says so.
 *
 * THE SUPPLIER IS NOT PICKED EITHER. It is the vendor that delivered the goods;
 * billing one vendor for another's delivery pays the wrong company and leaves the
 * right one still owed, so the API refuses a mismatch and this form never
 * constructs one.
 *
 * `receiptId` PRESELECTS, so "Buat faktur" from a receipt's detail screen lands
 * here with the delivery already chosen. It arrives as a prop read from
 * `searchParams` by the server page rather than through `useSearchParams` —
 * matching the returns form, and sparing this component the Suspense boundary
 * the hook would require.
 */
export function FileInvoiceForm({ receiptId: initialId }: { receiptId?: string }) {
  const router = useRouter();

  const { receipts, loading, error: loadError, truncated } =
    useUninvoicedReceipts();

  const [receiptId, setReceiptId] = useState(initialId ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selected: GoodsReceiptListRow | undefined = receipts.find(
    (receipt) => receipt._id === receiptId,
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    if (!selected) {
      setFieldErrors({ receiptId: "Pilih penerimaan yang ditagih." });
      return;
    }
    if (!invoiceNumber.trim()) {
      setFieldErrors({ invoiceNumber: "Nomor faktur supplier wajib diisi." });
      return;
    }

    setSaving(true);
    try {
      const created = await purchaseInvoiceService.create({
        supplierId: selected.supplierId,
        goodsReceiptId: selected._id,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        // Copied from the delivery, never retyped — see the header. `total` is
        // the receipt's EX-TAX value, which is exactly what `subtotal` means on
        // an invoice.
        subtotal: selected.total,
        taxAmount: selected.taxAmount,
        notes: notes.trim() || undefined,
      });

      router.push(`/dashboard/purchasing/payables/${created._id}`);
      swalToast(`Faktur ${created.invoiceNumber} dicatat.`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = caught.fieldErrors;
        // A 409 (this delivery is already billed / this vendor already issued
        // this number) and the reconcile 400 both carry actionable text; neither
        // maps onto a box the user can fix, so they belong in the banner.
        if (Object.keys(fields).length > 0) setFieldErrors(fields);
        else setFormError(caught.fullMessage);
      } else {
        setFormError("Gagal mencatat faktur. Coba lagi.");
      }
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat penerimaan yang belum difakturkan…
      </div>
    );
  }

  if (loadError) {
    return <Alert variant="error">{loadError}</Alert>;
  }

  if (receipts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <p className="font-medium text-foreground">
          Tidak ada penerimaan yang menunggu faktur.
        </p>
        <p className="max-w-md text-sm text-muted">
          Semua penerimaan beli putus sudah difakturkan. Konsinyasi tidak muncul
          di sini — barangnya masih milik supplier sampai laku, jadi belum ada
          yang ditagih.
        </p>
        <UIButton variant="secondary" asChild>
          <Link href="/dashboard/purchasing/receipts">
            Lihat semua penerimaan
          </Link>
        </UIButton>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      {truncated && (
        <Alert variant="info">
          Hanya {receipts.length} penerimaan pertama yang ditampilkan. Kalau
          penerimaan yang dicari tidak ada, buka detailnya dari daftar
          penerimaan.
        </Alert>
      )}

      <Card title="Penerimaan yang ditagih">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt">Penerimaan</Label>
            <Select
              value={receiptId}
              disabled={saving}
              onValueChange={setReceiptId}
            >
              <SelectTrigger id="receipt" aria-label="Penerimaan">
                <SelectValue placeholder="Pilih penerimaan…" />
              </SelectTrigger>
              <SelectContent>
                {receipts.map((receipt) => (
                  <SelectItem key={receipt._id} value={receipt._id}>
                    {receipt.receiptNumber} · {receipt.supplierName ?? "—"} ·{" "}
                    {formatDate(receipt.receiptDate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.receiptId ? (
              <p role="alert" className="text-xs text-danger">
                {fieldErrors.receiptId}
              </p>
            ) : (
              <p className="text-xs text-muted">
                Hanya penerimaan beli putus yang belum difakturkan.
              </p>
            )}
          </div>

          {selected && (
            <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-accent/30 p-3 text-sm sm:grid-cols-4">
              <Summary label="Supplier" value={selected.supplierName ?? "—"} />
              <Summary
                label="Nilai barang"
                value={formatMoney(selected.total)}
                mono
              />
              <Summary label="PPN" value={formatMoney(selected.taxAmount)} mono />
              <Summary
                label="Total ditagih"
                value={formatMoney(selected.grandTotal)}
                mono
                strong
              />
            </dl>
          )}
        </div>
      </Card>

      <Card title="Dokumen dari supplier">
        <div className="flex flex-col gap-4">
          <TextField
            label="Nomor faktur supplier"
            name="invoiceNumber"
            required
            value={invoiceNumber}
            disabled={saving}
            error={fieldErrors.invoiceNumber}
            onChange={(event) => setInvoiceNumber(event.target.value)}
            className="font-mono"
            placeholder="INV/2026/VIII/0142"
            // The one numbered field in the system a client chooses, because it
            // is not ours to allocate: it is printed on the vendor's paper and is
            // what they will quote when they chase payment.
            hint="Salin persis dari dokumen supplier — nomor ini yang mereka pakai saat menagih."
          />

          <TextField
            label="Tanggal faktur"
            name="invoiceDate"
            type="date"
            value={invoiceDate}
            disabled={saving}
            error={fieldErrors.invoiceDate}
            onChange={(event) => setInvoiceDate(event.target.value)}
            hint="Tanggal supplier menerbitkan tagihan. Jatuh tempo dihitung dari sini memakai termin supplier."
          />

          <TextField
            label="Catatan"
            name="notes"
            value={notes}
            disabled={saving}
            error={fieldErrors.notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="opsional — mis. faktur pajak menyusul"
          />
        </div>
      </Card>

      <p className="text-xs text-muted">
        Nilai faktur mengikuti penerimaannya dan tidak bisa diubah di sini —
        utangnya sudah diposting ke buku besar memakai angka penerimaan, jadi
        selisih apa pun akan ditolak. Kalau tagihan supplier memang berbeda,
        selesaikan lewat retur pembelian.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || !selected}>
          {saving ? "Menyimpan…" : "Catat faktur"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={() => router.push("/dashboard/purchasing/payables")}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}

function Summary({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium tracking-widest text-muted uppercase">
        {label}
      </dt>
      <dd
        className={
          mono
            ? `mt-0.5 font-mono text-sm tabular-nums${strong ? " font-semibold" : ""}`
            : "mt-0.5 text-sm font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}
