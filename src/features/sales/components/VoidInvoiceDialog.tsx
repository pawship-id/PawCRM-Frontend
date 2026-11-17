"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { TextareaField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { formatMoney } from "@/utils/decimal";
import type { CustomerInvoiceDetail, TillCorrectionStatus } from "@/types/api";
import { toMinor } from "@/utils/decimal";

import { paymentChannelLabel } from "../paymentLabels";
import { SettlementAccountFields, todayIso } from "./SettlementAccountFields";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * VOID A WHOLE INVOICE — PCR-031, and a bigger act than cancelling one payment.
 *
 * WHAT IT ACTUALLY DOES, said here rather than discovered afterwards: the goods
 * go back on the shelf and BOTH journal entries are reversed — the issuance and
 * the cost. The invoice is not deleted and its number is not reused, so it stays
 * in the list marked `void`. A user expecting the row to disappear and finding it
 * still there assumes the click failed and does it again.
 *
 * THE NUMBER IS SPELLED OUT IN THE CONFIRMATION, not a generic "this invoice".
 * Somebody with three tabs open is about to unwind a document that moved stock
 * and posted two entries; the one thing that stops them unwinding the wrong one
 * is seeing its number before they type.
 *
 * THE REASON IS REQUIRED and checked here before a round trip as well as on the
 * server. Six months later, a pair of reversals in the ledger with no sentence
 * attached is a correction nobody can account for.
 *
 * WHILE MONEY IS ON THE INVOICE, IT OPENS ON THE WAY FORWARD instead of the
 * form. The server refuses a void while any payment still counts (409) — money
 * that arrived did arrive — and the menu used to be drawn disabled then, which
 * read as broken: a pale row that did nothing, on exactly the invoice somebody
 * was trying to cancel. Now the dialog names every active payment, each a link
 * to the page where it is cancelled. Once none is left, the same menu opens the
 * form below.
 *
 * REFUSALS ARE TOASTS, the same deliberate departure from `docs/ui-rules.md` §9
 * the rest of this module makes. Server refusals get 8 seconds; they carry an
 * instruction.
 */
export function VoidInvoiceDialog({
  invoice,
  till = null,
  open,
  onOpenChange,
  onVoided,
}: {
  invoice: CustomerInvoiceDetail;
  /** The server's reading of a TILL-BORN faktur (17 November 2026); null otherwise. */
  till?: Extract<TillCorrectionStatus, { tillBorn: true }> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoided: (updated: CustomerInvoiceDetail) => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [refundAccountId, setRefundAccountId] = useState("");
  const [refundAt, setRefundAt] = useState(todayIso());

  const tillBorn =
    invoice.source === "pos_bridge" || Boolean(invoice.posTransactionId);

  /*
    ACTIVE ONLY. A cancelled payment has already posted its own reversal and taken
    its money back out, so it must not block a void — the server's own definition.

    A TILL-BORN FAKTUR IS NOT BLOCKED BY ITS PAYMENTS (17 November 2026): the
    sale is cancelled with it and the money goes back as a refund — see below.
  */
  const activePayments = (invoice.payments ?? []).filter(
    (payment) => !payment.isVoided,
  );
  const blocked = !tillBorn && activePayments.length > 0;
  const tillRefusal = tillBorn
    ? till
      ? till.canVoid
        ? null
        : till.voidBlockedReason
      : "Memeriksa transaksi kasirnya…"
    : null;
  const refundNeeded =
    tillBorn && till?.mode === "late" && (toMinor(till.paidAmount) ?? 0n) > 0n;

  async function handleVoid() {
    const trimmed = reason.trim();

    if (!trimmed) {
      swalToast("Alasan pembatalan wajib diisi.", "error");
      return;
    }

    if (refundNeeded && !refundAccountId) {
      swalToast("Pilih akun asal uang dikembalikan ke pelanggan.", "error");
      return;
    }

    setSaving(true);

    try {
      const updated = await customerInvoiceService.voidInvoice(
        invoice._id,
        trimmed,
        refundNeeded
          ? {
              refundAccountId,
              refundAt: new Date(`${refundAt}T12:00:00`).toISOString(),
            }
          : undefined,
      );

      // Released before the parent re-renders: a button locked forever is worse
      // than the error that locked it.
      setSaving(false);
      setReason("");
      onOpenChange(false);
      onVoided(updated);
      swalToast(`${invoice.invoiceNumber} sudah dibatalkan.`);
    } catch (error) {
      swalToast(
        error instanceof ApiError
          ? error.message
          : "Terjadi kesalahan. Coba lagi.",
        "error",
        8000,
      );
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {tillRefusal ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {invoice.invoiceNumber} belum bisa dibatalkan
              </DialogTitle>
              <DialogDescription>{tillRefusal}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Kembali
              </Button>
            </DialogFooter>
          </>
        ) : blocked ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {invoice.invoiceNumber} belum bisa dibatalkan
              </DialogTitle>
              <DialogDescription>
                Masih ada {activePayments.length} pembayaran aktif sebesar{" "}
                <strong className="tabular-nums">
                  {formatMoney(invoice.paidAmount)}
                </strong>
                . Batalkan pembayarannya dulu satu per satu — masing-masing
                memposting jurnal pembaliknya sendiri. Setelah tidak ada yang
                aktif, faktur bisa dibatalkan dari menu yang sama.
              </DialogDescription>
            </DialogHeader>

            <ul className="flex flex-col rounded-lg border border-border">
              {activePayments.map((payment) => (
                <li
                  key={payment.paymentId}
                  className="border-b border-border last:border-b-0"
                >
                  <Link
                    href={`/dashboard/sales/invoice/${invoice._id}/payments/${payment.paymentId}`}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-surface-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold tabular-nums">
                        {payment.paymentNumber ?? "Pembayaran"}
                      </span>
                      <span className="block text-xs text-muted">
                        <span className="tabular-nums">
                          {formatDate(payment.at)}
                        </span>{" "}
                        · {paymentChannelLabel(payment)}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(payment.amount)}
                    </span>
                    <ChevronRight
                      aria-hidden
                      className="size-4 shrink-0 text-muted"
                    />
                  </Link>
                </li>
              ))}
            </ul>

            <DialogFooter>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Kembali
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Batalkan {invoice.invoiceNumber}?</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>
                    Tagihan <strong>{formatMoney(invoice.total)}</strong> atas{" "}
                    {invoice.customerName ?? "pelanggan terhapus"} akan
                    dibatalkan.
                  </p>
                  {/* Said plainly, because none of it is guessable from the button */}
                  {tillBorn && till ? (
                    <ul className="list-disc space-y-1 pl-5 text-muted">
                      <li>
                        Transaksi kasir{" "}
                        <strong className="tabular-nums">
                          {till.transactionNumber ?? ""}
                        </strong>{" "}
                        ikut dibatalkan.
                      </li>
                      <li>
                        Barangnya kembali ke stok, dan jurnal penjualan serta
                        HPP-nya dibalik di tanggal transaksi.
                      </li>
                      {till.mode === "till_void" ? (
                        <li>
                          Shift kasirnya masih buka: pembayaran kasirnya ikut
                          dibatalkan dan uangnya dikembalikan dari laci shift itu.
                        </li>
                      ) : refundNeeded ? (
                        <li>
                          Uang <strong>{formatMoney(till.paidAmount)}</strong>{" "}
                          dicatat keluar di tanggal yang Anda pilih (bukti kas
                          keluar baru). Laporan shift yang sudah ditutup tidak
                          berubah.
                        </li>
                      ) : (
                        <li>Belum ada uang yang diterima — tidak ada refund.</li>
                      )}
                      <li>
                        Booking dan antar-jemputnya bisa ditarik lagi ke faktur
                        lain.
                      </li>
                      <li>
                        Fakturnya <strong>tidak dihapus</strong>: tetap ada di
                        daftar bertanda batal.
                      </li>
                    </ul>
                  ) : (
                    <ul className="list-disc space-y-1 pl-5 text-muted">
                      <li>Barangnya kembali ke stok gudang.</li>
                      <li>
                        Dua jurnal pembalik diposting — penerbitan dan HPP-nya.
                      </li>
                      <li>
                        Fakturnya <strong>tidak dihapus</strong>: tetap ada di
                        daftar bertanda batal, dan nomornya tidak dipakai ulang.
                      </li>
                    </ul>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>

            <TextareaField
              label="Alasan pembatalan"
              name="voidReason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              hint="Wajib. Enam bulan lagi ini satu-satunya yang menjelaskan sepasang jurnal pembalik di buku besar."
              placeholder="mis. Salah pelanggan — sudah diterbitkan ulang di INV/CBS/2608/0007"
              disabled={saving}
              required
            />

            {refundNeeded && (
              <SettlementAccountFields
                label="Uang dikembalikan dari"
                accountId={refundAccountId}
                onAccountChange={setRefundAccountId}
                date={refundAt}
                onDateChange={setRefundAt}
                disabled={saving}
              />
            )}

            <DialogFooter>
              {/*
                "KEMBALI", NOT "BATAL". The module's word for cancelling an invoice
                is "batal" (decided 11 Sep 2026), so a "Batal" button beside
                "Batalkan faktur" would be two buttons that sound like the same act
                and do opposite things.
              */}
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Kembali
              </Button>
              <Button
                variant="destructive"
                onClick={handleVoid}
                disabled={
                  saving || reason.trim() === "" || (refundNeeded && !refundAccountId)
                }
              >
                {saving ? "Memproses…" : "Batalkan faktur"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
