"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Button, FIELD_HEIGHT, TextField } from "@/components";
import { cn } from "@/lib/utils";
import { Button as UIButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { CASH_ACCOUNT_CATEGORY } from "@/features/accounting";
import {
  divideRound,
  formatMoney,
  isDecimal,
  toDecimalString,
  toMinor,
  trimDecimal,
} from "@/utils/decimal";
import type { ChartOfAccount } from "@/types/accounting";

import { cashBankAccounts } from "../hooks/useCashBankAccountOptions";

/** `yyyy-mm-dd` for today, as a date input holds it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** What a payment form hands its owner to send. */
export interface PaymentSubmission {
  amount: string;
  /** The Kas & Bank account the money landed in (in) or left (out). */
  accountId: string;
  at: string;
  ref?: string;
}

/**
 * The words that differ between money ARRIVING (a customer paying a receivable)
 * and money LEAVING (paying a supplier). Everything else is one form.
 */
const COPY: Record<
  "in" | "out",
  {
    amount: string;
    date: string;
    /** Under the date; omitted where BO asked for none. */
    dateHint?: string;
    /** Whether "Maksimal Rp …" sits under the amount. */
    ceilingHint: boolean;
    account: string;
    accountPlaceholder: string;
    /** Under the account picker; omitted where BO asked for none. */
    accountHint?: string;
    accountMissing: string;
    refHint: string;
  }
> = {
  in: {
    amount: "Jumlah diterima",
    date: "Tanggal terima",
    ceilingHint: true,
    dateHint: "Tanggal uang benar-benar masuk — ini yang dipakai jurnalnya.",
    account: "Masuk ke",
    accountPlaceholder: "Pilih akun kas atau bank",
    accountHint:
      "Akun ini yang didebit di jurnal, jadi rekonsiliasinya bisa ditelusuri per akun.",
    accountMissing: "Pilih akun kas atau bank tujuan uang masuknya.",
    refHint: "Opsional. Nomor mutasi bank atau trace QRIS/EDC untuk rekonsiliasi.",
  },
  out: {
    amount: "Jumlah dibayar",
    date: "Tanggal bayar",
    // No hint under the date, nor "Maksimal Rp …" under the amount (BO, 20
    // October 2026). The ceiling still refuses an over-payment on submit.
    ceilingHint: false,
    account: "Keluar dari",
    accountPlaceholder: "Pilih akun kas atau bank",
    // No hint under "Keluar dari" (BO, 20 October 2026).
    accountMissing: "Pilih akun kas atau bank sumber pembayarannya.",
    refHint: "Opsional. Nomor transfer, nomor giro, atau id transaksi QRIS.",
  },
};

/**
 * RECORD MONEY AGAINST ONE DOCUMENT — a receivable paid in, or a supplier bill
 * paid out. ONE FORM FOR BOTH (15 October 2026, on request: "Catat pembayaran"
 * on a purchase invoice looks and behaves like the one on a sales invoice).
 *
 * Moved here from features/sales when Pembelian needed it — a payment is a
 * Kas & Bank transaction, which is this feature's domain.
 *
 * THE ACCOUNT IS A KAS & BANK ACCOUNT of the chart, not a channel — the back
 * office knows which account the money moved through, and that is all the
 * journal needs (BO, 22 September 2026).
 *
 * `ceiling` IS A COURTESY, NOT THE AUTHORITY: the server refuses an over-
 * payment against the balance it can see. The local check buys a message before
 * a round trip. Quick amounts are fractions of the ceiling; "Lunasi" fills it.
 *
 * THE SUBMIT IS LOCKED FOR THE WHOLE FLIGHT — `POST …/payments` is not
 * idempotent, so a double click would move the money twice. Released in BOTH
 * outcomes, before `onSubmit`'s owner re-renders the parent.
 *
 * REFUSALS ARE TOASTS (8 seconds for the server's, which carry what to do).
 */
export function PaymentForm({
  direction,
  ceiling,
  ceilingLabel,
  overCeilingMessage,
  onSubmit,
  onCancel,
  note,
}: {
  direction: "in" | "out";
  /** The most this payment may be — what is outstanding, or payable now. */
  ceiling: string;
  /** "maksimal …" hint text; defaults to the formatted ceiling. */
  ceilingLabel?: string;
  /** Said when the amount passes the ceiling. */
  overCeilingMessage?: string;
  /** Sends the payment; throws to report a refusal. */
  onSubmit: (input: PaymentSubmission) => Promise<void>;
  /** Offered when the form is in a dialog. */
  onCancel?: () => void;
  /** What happens after saving, said before it. */
  note?: ReactNode;
}) {
  const copy = COPY[direction];
  const [amount, setAmount] = useState("");
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [at, setAt] = useState(today());
  const [ref, setRef] = useState("");
  const [saving, setSaving] = useState(false);

  // The same Kas & Bank list the Kas & Bank page and the manual transaction
  // form use, so the three can never disagree.
  useEffect(() => {
    let active = true;

    chartOfAccountsService
      .list({ accountCategory: CASH_ACCOUNT_CATEGORY, isActive: true, limit: 100 })
      .then((result) => {
        if (!active) return;
        const usable = cashBankAccounts(result.items);
        setAccounts(usable);
        // A single cash-or-bank account is not a choice.
        setAccountId(usable.length === 1 ? usable[0]._id : "");
      })
      .catch(() => {
        if (active) setAccounts([]);
      });

    return () => {
      active = false;
    };
  }, []);

  const ceilingMinor = toMinor(ceiling) ?? 0n;
  const maxLabel = ceilingLabel ?? formatMoney(ceiling);

  /** A fraction of the ceiling, rounded to a whole minor unit and trimmed. */
  function quickAmount(percentage: bigint) {
    setAmount(
      trimDecimal(toDecimalString(divideRound(ceilingMinor * percentage, 100n))),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    if (!isDecimal(amount) || (toMinor(amount) ?? 0n) <= 0n) {
      swalToast("Jumlah pembayaran harus lebih dari nol.", "error");
      return;
    }
    if ((toMinor(amount) ?? 0n) > ceilingMinor) {
      swalToast(
        overCeilingMessage ??
          `Jumlah melebihi sisa tagihan ${formatMoney(ceiling)}.`,
        "error",
      );
      return;
    }
    if (!accountId) {
      swalToast(copy.accountMissing, "error");
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        amount,
        accountId,
        at,
        // Empty means "no reference" — absent, not a blank string.
        ref: ref.trim() || undefined,
      });
      swalToast(`Pembayaran ${formatMoney(amount)} tercatat.`);
      setAmount("");
      setRef("");
      setSaving(false);
    } catch (caught) {
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

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={copy.amount}
          name="amount"
          inputMode="decimal"
          value={amount}
          disabled={saving}
          onChange={(event) => setAmount(event.target.value)}
          hint={
            isDecimal(amount) && (toMinor(amount) ?? 0n) > 0n
              ? copy.ceilingHint
                ? `${formatMoney(amount)} · maksimal ${maxLabel}`
                : formatMoney(amount)
              : copy.ceilingHint
                ? `Maksimal ${maxLabel}`
                : undefined
          }
        />

        <TextField
          label={copy.date}
          name="at"
          type="date"
          value={at}
          disabled={saving}
          onChange={(event) => setAt(event.target.value)}
          hint={copy.dateHint}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment-account">{copy.account}</Label>
        {accounts.length === 0 ? (
          <p className="text-sm text-danger">
            Belum ada akun berkategori Kas &amp; Bank. Tambah dulu di Daftar
            Akun.
          </p>
        ) : (
          <Select value={accountId} disabled={saving} onValueChange={setAccountId}>
            <SelectTrigger
              id="payment-account"
              aria-label={copy.account}
              className={cn("w-full", FIELD_HEIGHT)}
            >
              <SelectValue placeholder={copy.accountPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account._id} value={account._id}>
                  {account.code} · {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {copy.accountHint && (
          <p className="text-xs text-muted">{copy.accountHint}</p>
        )}
      </div>

      <TextField
        label="No. referensi"
        name="ref"
        value={ref}
        disabled={saving}
        onChange={(event) => setRef(event.target.value)}
        hint={copy.refHint}
      />

      {note}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <UIButton
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={onCancel}
          >
            Batal
          </UIButton>
        )}
        <Button type="submit" loading={saving} disabled={saving}>
          Simpan pembayaran
        </Button>
      </div>
    </form>
  );
}

/**
 * The payment form in a dialog, with the figure it is about on a dark panel at
 * the top — the dialog covers the page that would otherwise have said it.
 * `key` on the form so a dialog closed halfway and reopened starts clean.
 */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  description,
  summaryLabel,
  summaryAmount,
  summaryCaption,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: ReactNode;
  /** "Sisa tagihan saat ini", "Bisa dibayar sekarang". */
  summaryLabel: string;
  summaryAmount: string;
  /** Which document — "INV-001 · PT Sumber Pangan". */
  summaryCaption: ReactNode;
  /** The `PaymentForm`, keyed by the caller on `open`. */
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Catat pembayaran</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-primary px-4 py-3.5 text-primary-foreground">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm opacity-80">{summaryLabel}</span>
            <span className="text-xl font-bold tabular-nums">
              {formatMoney(summaryAmount)}
            </span>
          </div>
          <p className="mt-1 text-sm opacity-80 tabular-nums">{summaryCaption}</p>
        </div>

        {children}
      </DialogContent>
    </Dialog>
  );
}
