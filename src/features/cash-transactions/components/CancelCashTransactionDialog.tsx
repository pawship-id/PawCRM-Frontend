"use client";

import { useState } from "react";

import { Alert, TextareaField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SettlementAccountFields,
  todayIso,
} from "@/features/sales/components/SettlementAccountFields";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { cashTransactionService } from "@/services/cashTransaction.service";
import type { CashTransaction } from "@/types/api";
import { formatMoney } from "@/utils/decimal";

import { cashTransactionTitle } from "../labels";

/** The server's cap (`REASON_MAX_LENGTH`). */
const REASON_MAX_LENGTH = 200;

/**
 * Cancel one transaction — with the reason that will be the only record of why.
 *
 * SAID BEFORE THE CLICK: nothing is deleted. A reversing entry is posted and the
 * row stays, marked dibatalkan — a user expecting it to disappear would assume
 * the click failed and try again.
 *
 * "KEMBALI", NOT "BATAL", beside "Batalkan transaksi": the two would sound like
 * one act and do opposite things. The rule VoidPaymentDialog follows.
 *
 * The server's refusals (already cancelled, a closed shift, an invoice that
 * cannot take the money back) stay on screen in the dialog, not in a toast —
 * they are instructions somebody has to read.
 */
export function CancelCashTransactionDialog({
  transaction,
  onClose,
  onCancelled,
}: {
  /** The transaction to cancel, or null while the dialog is closed. */
  transaction: CashTransaction | null;
  onClose: () => void;
  /** Handed the cancelled transaction the write returned. */
  onCancelled: (updated: CashTransaction) => void;
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /*
    A TILL PAYMENT WHOSE SHIFT IS CLOSED (BO, 18 November 2026) — the same
    question Batalkan pembayaran asks on the faktur: which account the money
    goes back from and on which day. The closed shift's report does not move.
  */
  const drawerClosed = Boolean(transaction?.drawerClosed);
  const [refundAccountId, setRefundAccountId] = useState("");
  const [refundAt, setRefundAt] = useState(todayIso());
  const accountId = refundAccountId || transaction?.cashAccountId || "";

  function close() {
    setReason("");
    setReasonError(undefined);
    setServerError(null);
    setRefundAccountId("");
    setRefundAt(todayIso());
    onClose();
  }

  async function submit() {
    if (!transaction || saving) return;

    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError("Isi alasannya — ini satu-satunya catatan kenapa dibatalkan.");
      return;
    }

    if (drawerClosed && !accountId) {
      setServerError("Pilih akun Kas & Bank tempat uangnya dikembalikan.");
      return;
    }

    setSaving(true);
    setServerError(null);

    try {
      const updated = await cashTransactionService.cancel(
        transaction._id,
        drawerClosed
          ? {
              reason: trimmed,
              refundAccountId: accountId,
              refundAt: new Date(`${refundAt}T12:00:00`).toISOString(),
            }
          : { reason: trimmed },
      );
      swalToast(`Transaksi ${cashTransactionTitle(updated)} dibatalkan.`);
      setSaving(false);
      onCancelled(updated);
      close();
    } catch (caught) {
      setServerError(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Gagal membatalkan transaksi. Coba lagi.",
      );
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={transaction !== null}
      onOpenChange={(open) => {
        if (!open && !saving) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan transaksi</DialogTitle>
          <DialogDescription>
            {transaction
              ? `${cashTransactionTitle(transaction)} · ${formatMoney(transaction.amount)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-surface-hover px-4 py-3 text-sm">
          {drawerClosed ? (
            <p>
              Ini pembayaran kasir dari <b>shift yang sudah ditutup</b>. Laporan
              penutupan shift itu <b>tidak berubah</b> — uang yang dikembalikan
              dicatat sebagai <b>bukti kas keluar baru</b> di tanggal dan dari
              akun yang Anda pilih di bawah.
            </p>
          ) : (
            <p>
              Transaksi ini <b>tidak dihapus</b>. Sistem memposting{" "}
              <b>jurnal pembalik</b>, dan barisnya tetap terlihat dengan tanda
              dibatalkan — kesalahan dan koreksinya sama-sama tercatat.
            </p>
          )}
          {transaction?.document && (
            <p className="mt-2 text-muted">
              Sisa tagihan fakturnya naik kembali sebesar jumlah ini.
            </p>
          )}
          {transaction?.kind === "commission_payment" && (
            <p className="mt-2 text-muted">
              Komisinya kembali tercatat sebagai utang ke groomer.
            </p>
          )}
        </div>

        {serverError && <Alert variant="error">{serverError}</Alert>}

        <TextareaField
          label="Alasan pembatalan"
          name="cancel-reason"
          value={reason}
          required
          maxLength={REASON_MAX_LENGTH}
          disabled={saving}
          error={reasonError}
          onChange={(event) => {
            setReason(event.target.value);
            setReasonError(undefined);
          }}
          hint="mis. Salah channel · Dobel input · Transfer ditarik kembali"
        />

        {drawerClosed && (
          <SettlementAccountFields
            label="Uang dikembalikan dari"
            accountId={accountId}
            onAccountChange={setRefundAccountId}
            date={refundAt}
            onDateChange={setRefundAt}
            disabled={saving}
          />
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={close}
            disabled={saving}
          >
            Kembali
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void submit()}
            disabled={saving}
          >
            {saving ? "Membatalkan…" : "Batalkan transaksi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
