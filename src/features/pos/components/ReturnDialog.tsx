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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { paymentChannelService } from "@/services/paymentChannel.service";
import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import type {
  PaymentChannel,
  PosReturn,
  PosReturnable,
  PosTransaction,
} from "@/types/api";

import { ReturnItemsPicker, type ReturnDraftLine } from "./ReturnItemsPicker";

const FETCH_LIMIT = 100;

/**
 * Taking goods back (FR-11).
 *
 * THE FORM SHOWS NO REFUND FIGURE, and that is a decision rather than an
 * omission. What comes back is what was PAID — net of the line's own discount
 * and of its share of the basket discount — arithmetic the server owns. Showing
 * a number here would mean implementing that arithmetic twice, and the copy that
 * disagreed would be discovered by a customer at the counter.
 *
 * THE REFUND CHANNEL IS CASH-ONLY IN PRACTICE. Store credit is in the API's enum
 * because the PRD asks for it and is refused by the server: a customer has no
 * balance to hold it. This form does not offer it rather than offering something
 * that will be refused.
 *
 * IT DOES NOT CHECK THE SHIFT. A return crosses shifts and days freely — that is
 * the whole difference from a void — so there is nothing to check beyond having
 * a till open, which the server enforces.
 */
export function ReturnDialog({
  sale,
  onReturned,
  onOpenChange,
}: {
  sale: PosTransaction | null;
  onReturned: (created: PosReturn) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [remaining, setRemaining] = useState<number[]>([]);
  /*
    WHAT THIS REFUND ACTUALLY DOES, from the server. A sale still on account is
    paid back by owing less — see `PosReturnable.refundMethod`.
  */
  const [refund, setRefund] = useState<
    Pick<PosReturnable, "refundMethod" | "invoice">
  >({ refundMethod: "cash", invoice: null });
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [draft, setDraft] = useState<Record<number, ReturnDraftLine>>({});
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saleId = sale?._id ?? null;
  const branchId = sale?.branchId ?? null;

  useEffect(() => {
    if (!saleId) return;

    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setDraft({});
    setReason("");

    Promise.all([
      posService.returnable(saleId),
      paymentChannelService.list({
        isActive: true,
        type: "cash",
        // A refund LEAVES the drawer, so it needs a channel that can pay out —
        // the same direction a supplier payment asks for.
        usableFor: "out",
        branchId: branchId ?? undefined,
        limit: FETCH_LIMIT,
      }),
    ])
      .then(([returnable, channelPage]) => {
        if (!active) return;
        setRemaining(
          returnable.items.map((item) => Math.floor(Number(item.remainingQty))),
        );
        setRefund({
          refundMethod: returnable.refundMethod,
          invoice: returnable.invoice,
        });
        setChannels(channelPage.items);
        // One drawer is the overwhelming case; pre-selecting it removes a tap.
        if (channelPage.items.length === 1) {
          setChannelId(channelPage.items[0]._id);
        }
      })
      .catch(() => {
        if (active) setError("Data retur gagal dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [saleId, branchId]);

  const chosen = useMemo(
    () =>
      Object.entries(draft)
        .filter(([, line]) => line.qty > 0)
        .map(([index, line]) => ({
          posItemIndex: Number(index),
          qty: String(line.qty),
          returnToStock: line.returnToStock,
        })),
    [draft],
  );

  /** A credit note needs no drawer, so it needs no choice of drawer. */
  const needsChannel = refund.refundMethod === "cash";

  const canSubmit =
    chosen.length > 0 &&
    reason.trim().length > 0 &&
    (!needsChannel || channelId !== "");

  async function submit() {
    if (!sale || !canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const created = await posService.createReturn({
        posTransactionId: sale._id,
        items: chosen,
        /*
          THE SERVER DECIDES AND MAY OVERRULE THIS. Which treatment applies is a
          fact about the sale's invoice, not a preference — this is what the
          till believes, and it is corrected rather than obeyed.
        */
        refundMethod: "cash",
        refundChannelId: needsChannel ? channelId : undefined,
        reason: reason.trim(),
      });

      onReturned(created);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.reason ?? err.message)
          : "Retur gagal diproses. Coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={sale !== null}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Retur barang</DialogTitle>
          <DialogDescription>
            {sale?.transactionNumber} — pilih barang yang dikembalikan.
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Spinner /> Memuat…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="max-h-64 overflow-y-auto">
              <ReturnItemsPicker
                items={sale?.items ?? []}
                remaining={remaining}
                draft={draft}
                disabled={submitting}
                onChange={(index, line) =>
                  setDraft((current) => ({ ...current, [index]: line }))
                }
              />
            </div>

            {/*
              NO DRAWER TO CHOOSE, so none is offered. The sale is still on
              account: the goods coming back reduce the bill instead of paying
              anything out, which is what stops the shop paying twice — notes
              across the counter AND an invoice still running for the same
              items.
            */}
            {!needsChannel ? (
              <div className="space-y-1 rounded-lg border border-border p-3">
                <p className="text-sm font-medium">Uangnya tidak keluar</p>
                <p className="text-sm text-muted">
                  Penjualan ini belum dibayar, jadi returnya{" "}
                  <strong>mengurangi tagihan</strong>
                  {refund.invoice ? ` ${refund.invoice.invoiceNumber}` : ""} —
                  bukan mengembalikan uang tunai.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="refund-channel">Uang dikembalikan lewat</Label>
                {channels.length === 0 ? (
                  <p className="text-sm text-danger">
                    Belum ada channel tunai di cabang ini. Tambah dulu di Kas
                    &amp; Bank.
                  </p>
                ) : (
                  <Select value={channelId} onValueChange={setChannelId}>
                    <SelectTrigger id="refund-channel" className="h-11">
                      <SelectValue placeholder="Pilih laci kas" />
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
                {/*
                Said here because it changes whose drawer is short tonight: the
                refund comes out of the till open right now, not the one that
                made the sale.
              */}
                <p className="text-xs text-muted">
                  Uangnya keluar dari laci yang sedang dibuka sekarang, dan ikut
                  terhitung di tutup kasir nanti.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="return-reason">Alasan</Label>
              <textarea
                id="return-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                placeholder="Misalnya: kemasan sobek"
                className="w-full rounded-lg border border-border bg-surface p-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            {/*
              No total here. What comes back is what was paid, net of the basket
              discount's share — the server's arithmetic, and duplicating it
              would mean two answers to one question.
            */}
            <p className="text-xs text-muted">
              Nilai retur dihitung dari harga yang dibayar, termasuk diskonnya.
            </p>
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
            onClick={() => void submit()}
            disabled={submitting || !canSubmit}
          >
            {submitting && <Spinner />}
            Proses retur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
