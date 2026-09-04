"use client";

import { useEffect, useState } from "react";

import { Alert, Button, TextField } from "@/components";
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
import { paymentChannelService } from "@/services/paymentChannel.service";
import {
  divideRound,
  formatMoney,
  isDecimal,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";
import type {
  PaymentChannel,
  PaymentMethod,
  PurchaseInvoiceDetail,
} from "@/types/api";

/**
 * The four rails, and the account each one credits.
 *
 * The account is spelled out in the hint rather than previewed as a journal,
 * because it is the one consequence of this choice a clerk cannot see anywhere
 * else on the screen — and unlike the goods-receipt form there is no preview
 * endpoint to ask. The mapping is fixed server-side, so stating it is safe.
 */
/** The method's own word, for the sentence shown when no channel matches it. */
const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "tunai",
  transfer: "transfer",
  qris: "QRIS",
  giro: "giro",
};

const METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "transfer", label: "Transfer bank" },
  { value: "cash", label: "Tunai" },
  { value: "qris", label: "QRIS" },
  { value: "giro", label: "Giro" },
];

/** `yyyy-mm-dd` for today, as a date input holds it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record a payment against one invoice.
 *
 * THE FORM LIVES BESIDE THE INVOICE rather than on its own route because a
 * payment has no meaning apart from the bill it clears: the amount is bounded by
 * what is outstanding, and offering the field a navigation away from the number
 * it must not exceed is how a typo becomes a 400 the user did not see coming.
 *
 * THE SUBMIT IS LOCKED FOR THE WHOLE FLIGHT, and this is the one guard that
 * genuinely matters here. `POST /:id/payments` is NOT idempotent — there is no
 * key to send — so a double-click records the cash leaving twice, on two
 * irreversible journal entries. The lock is `saving`, released in BOTH outcomes
 * — see the note at the release.
 *
 * THE CLIENT-SIDE BOUND IS A COURTESY, NOT THE AUTHORITY. The server refuses an
 * overpayment against the balance it can see, which is the only one that counts
 * under concurrency — two clerks paying at once both pass this check and one of
 * them loses a compare-and-swap. What the local check buys is a message before
 * a round trip, in the ordinary case.
 *
 * QUICK AMOUNTS ARE NOT DECORATION: partial payment is the normal case with
 * suppliers on terms, and "half now" is a decision made far more often than an
 * arbitrary figure is typed.
 */
export function RecordPaymentForm({
  invoice,
  onPaid,
}: {
  invoice: PurchaseInvoiceDetail;
  /** Handed the UPDATED invoice the write returned — no refetch needed. */
  onPaid: (updated: PurchaseInvoiceDetail) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [channelId, setChannelId] = useState("");

  /*
    Re-read whenever the METHOD changes, and filtered to channels that can pay
    OUT. Fetching every channel once and filtering here would work until a
    tenant had more than a page of them — and would put the direction rule in two
    places, where the browser's copy is the one that drifts.
  */
  useEffect(() => {
    let active = true;

    paymentChannelService
      .list({ isActive: true, type: method, usableFor: "out", limit: 100 })
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
  const [at, setAt] = useState(today());
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const outstandingMinor = toMinor(invoice.outstandingAmount) ?? 0n;

  /** A fraction of what is left, rounded to a whole minor unit. */
  function quickAmount(percentage: bigint) {
    setAmount(
      toDecimalString(divideRound(outstandingMinor * percentage, 100n)),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!isDecimal(amount) || (toMinor(amount) ?? 0n) <= 0n) {
      setError("Jumlah pembayaran harus lebih dari nol.");
      return;
    }
    if ((toMinor(amount) ?? 0n) > outstandingMinor) {
      setError(
        `Jumlah melebihi sisa tagihan ${formatMoney(invoice.outstandingAmount)}.`,
      );
      return;
    }

    setSaving(true);
    try {
      const updated = await purchaseInvoiceService.recordPayment(invoice._id, {
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
        RELEASED ON SUCCESS TOO, and BEFORE `onPaid`. "Success unmounts this
        form" holds only when the invoice becomes SETTLED; a partial payment
        leaves the parent rendering the same element in the same position, so
        React keeps this component's state and the button stayed disabled with a
        spinner until the page was reloaded — after every instalment.

        Found on the receivables side, which was written from this file. Fixed
        here too rather than left, because it is the same defect on a form that
        moves money.
      */
      setSaving(false);
      onPaid(updated);
    } catch (caught) {
      // Every refusal here is actionable and specific — "exceeds the 100.000
      // outstanding", "already settled", "somebody else paid while you were
      // recording this". `fullMessage` carries the backend's reason alongside
      // the message, which is the half that says what to do next.
      setError(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Gagal menyimpan pembayaran. Coba lagi.",
      );
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {error && <Alert variant="error">{error}</Alert>}

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
        label="Jumlah dibayar"
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
          onValueChange={(value) => setMethod(value as PaymentMethod)}
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
        WHICH ACCOUNT THE MONEY LEAVES — the whole point of this field.

        It used to be derived from the method alone: transfer, QRIS and giro all
        credited "1102 Bank", so a shop with three rekening could not tell which
        one paid a supplier — while the selling side, which names its channels,
        answered exactly that.

        The list is filtered to channels that can PAY OUT and that match the
        chosen method, so it can only ever offer something the server accepts.
      */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment-channel">Keluar dari</Label>
        {channels.length === 0 ? (
          <p className="text-sm text-danger">
            Belum ada rekening {METHOD_LABEL[method]} untuk pembayaran keluar.
            Tambah dulu di Kas &amp; Bank.
          </p>
        ) : (
          <Select
            value={channelId}
            disabled={saving}
            onValueChange={setChannelId}
          >
            <SelectTrigger id="payment-channel" aria-label="Keluar dari">
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
          Rekening ini yang dikreditkan di jurnal, jadi rekonsiliasinya bisa
          ditelusuri per rekening.
        </p>
      </div>

      {/* The day the money MOVED, not the day this row was typed. A transfer
          sent on the 31st and recorded on the 2nd is the previous month's cash
          outflow, and the journal entry is dated from this field. */}
      <TextField
        label="Tanggal bayar"
        name="at"
        type="date"
        value={at}
        disabled={saving}
        onChange={(event) => setAt(event.target.value)}
        hint="Tanggal uang benar-benar keluar — ini yang dipakai jurnalnya."
      />

      <TextField
        label="Nomor referensi"
        name="ref"
        value={ref}
        disabled={saving}
        onChange={(event) => setRef(event.target.value)}
        className="tabular-nums"
        placeholder="opsional"
        hint="Nomor transfer, nomor giro, atau id transaksi QRIS."
      />

      <Button type="submit" disabled={saving}>
        {saving ? "Menyimpan…" : "Simpan pembayaran"}
      </Button>

      <p className="text-xs text-muted">
        Pembayaran langsung memposting jurnal dan tidak bisa dibatalkan dari
        sini. Periksa jumlahnya sebelum menyimpan.
      </p>
    </form>
  );
}
