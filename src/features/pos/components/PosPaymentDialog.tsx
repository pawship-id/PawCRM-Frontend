"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { paymentChannelService } from "@/services/paymentChannel.service";
import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import { formatMoney } from "@/utils/decimal";
import type { PaymentChannel, PosTransaction } from "@/types/api";

import { PaymentChannelPicker, type PaymentRoute } from "./PaymentChannelPicker";
import { PosCreditPanel, defaultDueDate } from "./PosCreditPanel";
import { PaymentLinesList, type DraftPayment } from "./PaymentLinesList";

/** The API's page cap — asking for more is a 400. */
const FETCH_LIMIT = 100;

/**
 * What a cashier may TYPE: digits only.
 *
 * "300.000" is three hundred thousand to an Indonesian and 300 to `Number()`,
 * and a till that accepted it would take a thousandth of the bill. This is the
 * INPUT rule and applies to nothing else — see `serverRupiah` below, which is
 * the other half of a distinction worth keeping sharp.
 */
const TYPED_RUPIAH = /^\d+$/;

/**
 * A figure the cashier typed, as an integer.
 *
 * SAFE HERE, AND NOWHERE ELSE. Every figure a cashier types is a whole rupiah —
 * the keypad has no decimal point — so these stay well inside the range a double
 * represents exactly. What crosses the wire is still the STRING that was typed;
 * nothing here is sent as a number, and nothing here decides what is posted. The
 * server prices the sale and checks the remainder again.
 */
function typed(value: string | null | undefined): number {
  const trimmed = (value ?? "").trim();
  return TYPED_RUPIAH.test(trimmed) ? Number(trimmed) : 0;
}

/**
 * A figure the SERVER sent, as an integer.
 *
 * A separate function from `typed`, and the bug that earned it is worth naming:
 * the server sends money at four decimal places — `"300000.0000"` — and reading
 * it with the typed-input rule matched nothing and silently produced a total of
 * zero. The whole dialog then offered the cashier a bill of Rp 0.
 *
 * Two rules that look alike and are not: one guards what a person may type, the
 * other reads a format we control. Conflating them is what broke it.
 */
function serverRupiah(value: string | null | undefined): number {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

/**
 * Taking the money (FR-7).
 *
 * THE REMAINDER IS THE WHOLE SCREEN. It is the largest thing on it, it updates
 * on every keystroke, and Selesaikan is disabled until it is exactly zero — not
 * "at least", which is the trap: underpaid is a debt nobody recorded, and
 * overpaid on a non-cash channel is money the books cannot place.
 *
 * CASH IS THE ONE EXCEPTION, and it is not really one. A cashier hands over
 * 350.000 for a 300.000 bill; the excess becomes CHANGE rather than an
 * overpayment, so the remainder still reads zero and the drawer still balances.
 * The change is computed, never typed — a second field to get wrong is a drawer
 * that disagrees with the receipt.
 */
export function PosPaymentDialog({
  cart,
  open,
  onPaid,
  onOpenChange,
}: {
  cart: PosTransaction;
  open: boolean;
  onPaid: (sale: PosTransaction) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [activeRoute, setActiveRoute] = useState<PaymentRoute>("cash");
  const [lines, setLines] = useState<DraftPayment[]>([]);
  /**
   * The due date, held even while the Piutang pill is not the active one.
   *
   * A cashier who taps Piutang, sets a date, taps back to Tunai to add a part
   * payment and returns must find their date still there — losing it would be a
   * screen punishing somebody for doing the ordinary thing in a different order.
   */
  const [dueDate, setDueDate] = useState(() => defaultDueDate());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = serverRupiah(cart.runningTotals.net);

  useEffect(() => {
    if (!open) return;

    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    paymentChannelService
      /*
        `usableFor: "in"` — the till only offers channels money can ARRIVE
        through. Without it, a bank account a tenant marked pay-out-only would
        still appear here, and the narrowing would work in one direction only.

        A channel that declares nothing still matches, by its type: every channel
        written before the field existed is that kind.
      */
      .list({
        isActive: true,
        usableFor: "in",
        branchId: cart.branchId,
        limit: FETCH_LIMIT,
      })
      .then((result) => {
        if (!active) return;
        setChannels(result.items);
        // Land on a type the shop actually has, so the first tab is never empty.
        const first = result.items.find((channel) => channel.type === "cash");
        setActiveRoute(first?.type ?? result.items[0]?.type ?? "cash");
      })
      .catch(() => {
        if (active) setError("Metode bayar gagal dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, cart.branchId]);

  /**
   * What is still owed, and what goes back.
   *
   * CASH ABSORBS THE EXCESS, and only cash. Everything tendered above the bill
   * on the LAST cash line becomes change; a transfer that overpays stays an
   * overpayment, because the bank has that money and handing over notes for it
   * would empty the till against a receipt saying otherwise.
   */
  const { remaining, overpaid, changeByIndex } = useMemo(() => {
    const tendered = lines.reduce((sum, line) => sum + typed(line.amount), 0);
    const excess = tendered - total;
    const byIndex = new Map<number, string>();

    // What actually settles. It differs from what was tendered only when cash
    // absorbs an excess as change.
    let settled = tendered;

    if (excess > 0) {
      const lastCash = [...lines]
        .map((line, index) => ({ line, index }))
        .reverse()
        .find(({ line }) => line.channel.type === "cash");

      if (lastCash && typed(lastCash.line.amount) >= excess) {
        byIndex.set(lastCash.index, String(excess));
        settled = total;
      }
    }

    return {
      // Never negative. An overpayment is its own state with its own sentence —
      // a "Sisa" of minus fifty thousand is a number nobody can act on.
      remaining: Math.max(0, total - settled),
      overpaid: settled > total,
      changeByIndex: byIndex,
    };
  }, [lines, total]);

  const missingReference = lines.some(
    (line) => line.channel.requiresReference && !line.reference?.trim(),
  );
  const badAmount = lines.some((line) => !TYPED_RUPIAH.test(line.amount.trim()));

  /**
   * Why a sale cannot be put on account right now — null when it can.
   *
   * ONE RULE, ONE SENTENCE, and it is FR-2's: "Pelanggan wajib untuk Piutang".
   * A debt with no debtor is not a receivable, it is a write-off nobody has
   * approved. The server refuses it too; this is the courtesy that stops a
   * cashier finding out after they have bagged the goods.
   */
  const creditBlockedReason = cart.customer
    ? null
    : "Pilih pelanggan dulu — piutang harus ada yang menanggung.";

  const onCredit = activeRoute === "piutang" && creditBlockedReason === null;

  /*
    THE REMAINDER IS THE RECEIVABLE. It is not typed and not chosen: whatever the
    payment lines did not cover walks out on account, which is FR-7's "satu klik
    menutup seluruh sisa tagihan sebagai AR". A cashier taking 100.000 towards a
    300.000 bill enters that one line and taps Piutang; the 200.000 follows.
  */
  const creditAmount = onCredit ? remaining : 0;

  const canSubmit = onCredit
    ? // Nothing left to put on account is a refusal, not a sale: it would raise
      // an invoice for zero that sits in the collection list for ever.
      creditAmount > 0 &&
      dueDate !== "" &&
      !overpaid &&
      !missingReference &&
      !badAmount
    : lines.length > 0 &&
      remaining === 0 &&
      !overpaid &&
      !missingReference &&
      !badAmount;

  function addLine(channel: PaymentChannel) {
    setLines((current) => [
      ...current,
      {
        channelId: channel._id,
        // The first line offers the whole bill, which is what most sales are.
        amount:
          current.length === 0
            ? String(total)
            : String(
                Math.max(
                  0,
                  total - current.reduce((s, l) => s + typed(l.amount), 0),
                ),
              ),
        reference: "",
        channel,
      },
    ]);
  }

  async function submit() {
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const sale = await posService.pay(cart._id, {
        // Sent only when the sale is actually going on account — an empty
        // object here would be the server's cue to raise a receivable.
        ...(onCredit ? { credit: { dueDate } } : {}),
        payments: lines.map((line, index) => ({
          channelId: line.channelId,
          amount: line.amount.trim(),
          ...(changeByIndex.has(index)
            ? { change: changeByIndex.get(index) }
            : {}),
          ...(line.channel.requiresReference
            ? { reference: line.reference?.trim() }
            : {}),
        })),
      });

      onPaid(sale);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.reason ?? "Pembayaran gagal. Coba lagi.")
          : "Pembayaran gagal. Coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pembayaran</DialogTitle>
          <DialogDescription>
            Total {formatMoney(cart.runningTotals.net)}
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Spinner /> Memuat metode bayar…
          </div>
        ) : (
          <div className="space-y-4">
            <PaymentChannelPicker
              channels={channels}
              activeRoute={activeRoute}
              onRouteChange={setActiveRoute}
              onPick={addLine}
              creditBlockedReason={creditBlockedReason}
              disabled={submitting}
            />

            {onCredit && cart.customer && (
              <PosCreditPanel
                customerId={cart.customer._id}
                customerName={cart.customer.name}
                amount={creditAmount}
                dueDate={dueDate}
                disabled={submitting}
                onDueDateChange={setDueDate}
              />
            )}

            <PaymentLinesList
              lines={lines.map((line, index) => ({
                ...line,
                change: changeByIndex.get(index),
              }))}
              disabled={submitting}
              onChange={(index, patch) =>
                setLines((current) =>
                  current.map((line, i) =>
                    i === index ? { ...line, ...patch } : line,
                  ),
                )
              }
              onRemove={(index) =>
                setLines((current) => current.filter((_, i) => i !== index))
              }
            />

            {missingReference && (
              <p className="text-sm text-danger">
                Isi nomor referensinya dulu — tanpa itu pembayarannya tidak bisa
                dicocokkan nanti.
              </p>
            )}

            {overpaid && (
              <p className="text-sm text-danger">
                Kelebihan bayar. Kembalian cuma bisa dari pembayaran tunai.
              </p>
            )}

            {/*
              The number the cashier reads while typing.

              IT MEANS TWO DIFFERENT THINGS and says which. On a cash sale a
              remainder above zero is something still to collect, and green at
              zero is the signal to press Selesaikan. On a credit sale the same
              figure is what the customer will owe — so it is not a shortfall,
              green would be a lie, and calling it "Sisa" would invite a cashier
              to keep typing until it went away.
            */}
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-sm font-semibold text-foreground">
                {onCredit ? "Sisa jadi piutang" : "Sisa"}
              </span>
              <span
                className={
                  remaining === 0 && !onCredit
                    ? "text-xl font-semibold tabular-nums text-success"
                    : "text-xl font-semibold tabular-nums text-foreground"
                }
              >
                {formatMoney(String(remaining))}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Batal
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={submit}
            disabled={submitting || !canSubmit}
          >
            {submitting && <Spinner />}
            Selesaikan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
