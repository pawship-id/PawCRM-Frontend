"use client";

import { useEffect, useState } from "react";

import { Spinner } from "@/components";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { posService } from "@/services/pos.service";
import { formatMoney } from "@/utils/decimal";
import type { CustomerCreditStatus } from "@/types/api";

/**
 * FR-7's default term. A shop that wants another types a date.
 */
const DEFAULT_TERM_DAYS = 30;

/** `yyyy-mm-dd`, which is what a native date input reads and writes. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function defaultDueDate(from: Date = new Date()): string {
  const due = new Date(from);
  due.setDate(due.getDate() + DEFAULT_TERM_DAYS);
  return isoDay(due);
}

/**
 * Selling on account (FR-7).
 *
 * WHAT IT IS FOR is the thing a cashier cannot see anywhere else: how much this
 * customer already owes. The plafon is enforced when Selesaikan is pressed, and
 * a cashier who finds out there has already told the customer the sale went
 * through and started bagging it. This panel is that same rule, read early
 * enough to be useful.
 *
 * IT DOES NOT BLOCK. Everything here is advisory — the server decides, and it
 * decides again at the moment of payment, against numbers that may have moved
 * since this was fetched. A client-side refusal would be a second authority that
 * can disagree with the first.
 *
 * ONE FIELD, AND IT IS A DATE. Not a term in days, which is the same fact stated
 * in a way somebody has to do arithmetic on: "jatuh tempo 24 September" is what
 * goes on the slip and what the customer is told, so it is what the cashier
 * should be looking at.
 */
export function PosCreditPanel({
  customerId,
  customerName,
  amount,
  dueDate,
  disabled = false,
  onDueDateChange,
}: {
  customerId: string;
  customerName: string;
  /** What will become the receivable, in whole rupiah. */
  amount: number;
  /** `yyyy-mm-dd`. */
  dueDate: string;
  disabled?: boolean;
  onDueDateChange: (value: string) => void;
}) {
  const [status, setStatus] = useState<CustomerCreditStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setFailed(false);

    posService
      .creditStatus(customerId)
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  /*
    "No ceiling" and "nothing left" are opposite facts, and the API keeps them
    apart by sending null rather than zero — so this narrows rather than
    defaulting. A `?? 0` here would draw a full bar for the unlimited customer
    who is the ordinary case.
  */
  const remaining =
    status?.remaining === null || status?.remaining === undefined
      ? null
      : Number(status.remaining);

  const overLimit = remaining !== null && amount > remaining;

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">
          Jadi piutang {customerName}
        </span>
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {formatMoney(String(amount))}
        </span>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Memuat piutang pelanggan…
        </p>
      ) : failed ? (
        /*
          SAID PLAINLY RATHER THAN HIDDEN. The sale can still go through — the
          server checks the plafon itself — so this is a missing view, not a
          blocked one, and pretending the customer owes nothing would be worse
          than admitting we could not find out.
        */
        <p className="text-sm text-muted">
          Piutang berjalan tidak bisa dibaca. Penjualannya tetap bisa
          dilanjutkan — plafonnya diperiksa lagi saat disimpan.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Piutang berjalan{" "}
          <span className="tabular-nums text-foreground">
            {formatMoney(status?.outstanding ?? "0")}
          </span>
          {(status?.invoiceCount ?? 0) > 0 && ` dari ${status?.invoiceCount} faktur`}
          {status?.creditLimit === null
            ? " · tanpa plafon"
            : ` · plafon ${formatMoney(status?.creditLimit ?? "0")}, sisa ${formatMoney(
                status?.remaining ?? "0",
              )}`}
        </p>
      )}

      {overLimit && (
        <p className="text-sm text-danger">
          Melebihi plafon. Minta pembayaran sebagian dulu, atau naikkan plafonnya
          di data pelanggan.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="pos-credit-due">Jatuh tempo</Label>
        <Input
          id="pos-credit-due"
          type="date"
          className="h-11"
          value={dueDate}
          disabled={disabled}
          onChange={(event) => onDueDateChange(event.target.value)}
        />
      </div>
    </div>
  );
}
