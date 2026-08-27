"use client";

import { useEffect, useState } from "react";

import { Button, TextField } from "@/components";
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
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import {
  divideRound,
  formatMoney,
  isDecimal,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";
import type {
  CustomerInvoiceDetail,
  CustomerPaymentMethod,
  PaymentChannel,
} from "@/types/api";

/** The method's own word, for the sentence shown when no channel matches it. */
const METHOD_LABEL: Record<CustomerPaymentMethod, string> = {
  cash: "tunai",
  transfer: "transfer",
  qris: "QRIS",
  edc: "EDC",
};

/**
 * The four rails money can arrive on.
 *
 * `edc` WHERE THE PAYABLE HAS `giro`, and the difference is real rather than
 * cosmetic: a shop is handed a card at the counter and hands a post-dated cheque
 * to a vendor. Transfer leads because it is how a B2B customer settles a
 * receivable — cash is what the till already took.
 */
const METHODS: Array<{ value: CustomerPaymentMethod; label: string }> = [
  { value: "transfer", label: "Transfer bank" },
  { value: "cash", label: "Tunai" },
  { value: "qris", label: "QRIS" },
  { value: "edc", label: "EDC / kartu" },
];

/** `yyyy-mm-dd` for today, as a date input holds it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record money arriving against one receivable.
 *
 * ONE FORM FOR DP, CICILAN AND PELUNASAN — that is PCR-032's whole user story,
 * and it is why there is no second control anywhere for "settle in full". The
 * status is derived from what has been paid, so "Lunasi" is a shortcut that
 * fills the amount box, not a different request.
 *
 * THE FORM LIVES BESIDE THE INVOICE rather than on its own route because a
 * payment has no meaning apart from the debt it clears: the amount is bounded by
 * what is outstanding, and offering the field a navigation away from the number
 * it must not exceed is how a typo becomes a 400 the user did not see coming.
 *
 * THE SUBMIT IS LOCKED FOR THE WHOLE FLIGHT, and this is the one guard that
 * genuinely matters. `POST /:id/payments` is NOT idempotent — there is no key to
 * send — so a double-click records the money arriving twice, on two irreversible
 * journal entries. The lock is `saving`, released in BOTH outcomes — see the
 * note at the release: assuming success always unmounts this form was wrong for
 * every partial payment, and left the button spinning until a reload.
 *
 * REFUSALS ARE TOASTS, NOT AN INLINE ALERT — a deliberate departure from
 * docs/ui-rules.md §9, made on request. The tradeoff it accepts: a toast
 * auto-dismisses, so a message the user has to act on can be missed. The
 * server's refusals are given 8 seconds rather than the default 3 for that
 * reason. The local checks keep the default — the user knows what they just
 * typed.
 *
 * THE CLIENT-SIDE BOUND IS A COURTESY, NOT THE AUTHORITY. The server refuses an
 * overpayment against the balance it can see, which is the only one that counts
 * under concurrency — two clerks recording at once both pass this check and one
 * of them loses a compare-and-swap. What the local check buys is a message
 * before a round trip, in the ordinary case.
 */
export function RecordPaymentForm({
  invoice,
  onPaid,
}: {
  invoice: CustomerInvoiceDetail;
  /** Handed the UPDATED invoice the write returned — no refetch needed. */
  onPaid: (updated: CustomerInvoiceDetail) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<CustomerPaymentMethod>("transfer");
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [at, setAt] = useState(today());
  const [ref, setRef] = useState("");
  const [saving, setSaving] = useState(false);

  /*
    Re-read whenever the METHOD changes, and filtered to channels that can
    RECEIVE — `usableFor: "in"`, the mirror of the payable form's `"out"`. That
    one letter is the whole difference: a drawer a shop only ever pays out of is
    the wrong place to book a customer's transfer, and the server refuses it.

    Fetching every channel once and filtering here would work until a tenant had
    more than a page of them — and would put the direction rule in two places,
    where the browser's copy is the one that drifts.
  */
  useEffect(() => {
    let active = true;

    paymentChannelService
      .list({ isActive: true, type: method, usableFor: "in", limit: 100 })
      .then((result) => {
        if (!active) return;
        setChannels(result.items);
        // One account per method is the ordinary case; pre-selecting it removes
        // a tap from every payment.
        setChannelId(result.items.length === 1 ? result.items[0]._id : "");
      })
      .catch(() => {
        if (active) setChannels([]);
      });

    return () => {
      active = false;
    };
  }, [method]);

  const outstandingMinor = toMinor(invoice.outstandingAmount) ?? 0n;

  /** A fraction of what is left, rounded to a whole minor unit. */
  function quickAmount(percentage: bigint) {
    setAmount(
      toDecimalString(divideRound(outstandingMinor * percentage, 100n)),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!isDecimal(amount) || (toMinor(amount) ?? 0n) <= 0n) {
      swalToast("Jumlah pembayaran harus lebih dari nol.", "error");
      return;
    }
    if ((toMinor(amount) ?? 0n) > outstandingMinor) {
      swalToast(
        `Jumlah melebihi sisa tagihan ${formatMoney(invoice.outstandingAmount)}.`,
        "error",
      );
      return;
    }
    if (!channelId) {
      swalToast("Pilih rekening tujuan uang masuknya.", "error");
      return;
    }

    setSaving(true);
    try {
      const updated = await customerInvoiceService.recordPayment(invoice._id, {
        amount,
        method,
        channelId,
        at,
        // Empty means "no reference", which the API models as null/absent — an
        // empty string would be stored as one and shown as a blank bank ref.
        ref: ref.trim() || undefined,
      });

      swalToast(`Pembayaran ${formatMoney(amount)} tercatat.`);
      setAmount("");
      setRef("");
      /*
        RELEASED ON SUCCESS TOO, and BEFORE `onPaid`. This used to be released
        only on failure, on the reasoning that a successful payment unmounts the
        form — which is true only when the invoice becomes SETTLED. A partial
        payment leaves the same branch of the parent rendering the same element
        in the same position, so React keeps this component's state: the button
        stayed disabled with a spinner until the page was reloaded, after every
        instalment.

        Before `onPaid` because that re-renders the parent and may unmount this
        form; setting state afterwards would be setting it on a dead component.
      */
      setSaving(false);
      onPaid(updated);
    } catch (caught) {
      /*
        Every refusal here is actionable and specific — "melebihi sisa tagihan",
        "sudah lunas", "sudah dibayar orang lain sementara pembayaran ini
        dicatat". `fullMessage` carries the backend's reason alongside the
        message, which is the half that says what to do next, so the toast gets
        longer than the default three seconds to be read in.
      */
      swalToast(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Gagal menyimpan pembayaran. Coba lagi.",
        "error",
        8000,
      );
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {/* NOT DECORATION: partial payment is the normal case on terms, and "half
          now" is a decision made far more often than an arbitrary figure is
          typed. "Lunasi" fills the box with the outstanding amount — it is not a
          different request. */}
      <div className="flex gap-1">
        {([25n, 50n, 100n] as const).map((percentage) => (
          <UIButton
            key={String(percentage)}
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => quickAmount(percentage)}
          >
            {percentage === 100n ? "Lunasi" : `${percentage}%`}
          </UIButton>
        ))}
      </div>

      <TextField
        label="Jumlah diterima"
        name="amount"
        inputMode="decimal"
        value={amount}
        disabled={saving}
        onChange={(event) => setAmount(event.target.value)}
        hint={`Maksimal ${formatMoney(invoice.outstandingAmount)}`}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment-method">Metode</Label>
        <Select
          value={method}
          disabled={saving}
          onValueChange={(value) =>
            setMethod(value as CustomerPaymentMethod)
          }
        >
          <SelectTrigger id="payment-method" aria-label="Metode">
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
          Menentukan jenis pembayaran. Rekeningnya dipilih di bawah.
        </p>
      </div>

      {/*
        WHICH ACCOUNT THE MONEY LANDED IN — the account the journal entry debits.
        The list is filtered to channels that can RECEIVE and that match the
        chosen method, so it can only ever offer something the server accepts.
      */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment-channel">Masuk ke</Label>
        {channels.length === 0 ? (
          <p className="text-sm text-danger">
            Belum ada rekening {METHOD_LABEL[method]} untuk penerimaan. Tambah
            dulu di Kas &amp; Bank.
          </p>
        ) : (
          <Select
            value={channelId}
            disabled={saving}
            onValueChange={setChannelId}
          >
            <SelectTrigger id="payment-channel" aria-label="Masuk ke">
              <SelectValue placeholder="Pilih rekening" />
            </SelectTrigger>
            <SelectContent>
              {channels.map((channel) => (
                <SelectItem key={channel._id} value={channel._id}>
                  {channel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted">
          Rekening ini yang didebit di jurnal, jadi rekonsiliasinya bisa
          ditelusuri per rekening.
        </p>
      </div>

      {/* The day the money MOVED, not the day this row was typed. A transfer
          received on the 31st and recorded on the 2nd is the previous month's
          cash inflow, and the journal entry is dated from this field. */}
      <TextField
        label="Tanggal terima"
        name="at"
        type="date"
        value={at}
        disabled={saving}
        onChange={(event) => setAt(event.target.value)}
        hint="Tanggal uang benar-benar masuk — ini yang dipakai jurnalnya."
      />

      <TextField
        label="No. referensi"
        name="ref"
        value={ref}
        disabled={saving}
        onChange={(event) => setRef(event.target.value)}
        hint="Opsional. Nomor mutasi bank atau trace QRIS/EDC untuk rekonsiliasi."
      />

      <Button type="submit" loading={saving} disabled={saving}>
        Simpan pembayaran
      </Button>
    </form>
  );
}
