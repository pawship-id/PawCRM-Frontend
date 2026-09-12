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
import { Input } from "@/components/ui/input";
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
  PaymentChannelType,
  PosReturn,
  PosReturnable,
  PosTransaction,
} from "@/types/api";

import { ReturnItemsPicker, type ReturnDraftLine } from "./ReturnItemsPicker";

const FETCH_LIMIT = 100;

/*
  WHAT A TILL CAN HAND MONEY BACK THROUGH: notes from the drawer, or a transfer
  from the shop's account (BBK, and it leaves the drawer alone). A merchant QRIS
  or EDC cannot pay out, and a giro is not written at a counter — `usableFor`
  already drops the first two unless somebody declared otherwise, and this list
  drops whatever was.
*/
const REFUND_TYPES: readonly PaymentChannelType[] = ["cash", "transfer"];

/**
 * Taking goods back (FR-11).
 *
 * THE FORM SHOWS NO REFUND FIGURE, and that is a decision rather than an
 * omission. What comes back is what was PAID — net of the line's own discount
 * and of its share of the basket discount — arithmetic the server owns. Showing
 * a number here would mean implementing that arithmetic twice, and the copy that
 * disagreed would be discovered by a customer at the counter.
 *
 * THE MONEY GOES BACK IN CASH OR BY TRANSFER (12 Sep — it was cash only). A
 * transfer is a BBK from the shop's account and is not netted out of the drawer
 * at closing. Store credit is in the API's enum because the PRD asks for it and
 * is refused by the server: a customer has no balance to hold it. This form does
 * not offer it rather than offering something that will be refused.
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
  const [reference, setReference] = useState("");
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
    setReference("");

    Promise.all([
      posService.returnable(saleId),
      paymentChannelService.list({
        isActive: true,
        // A refund LEAVES the shop, so it needs a channel that can pay out —
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
        const offered = channelPage.items.filter((channel) =>
          REFUND_TYPES.includes(channel.type),
        );
        setChannels(offered);
        /*
          One drawer is the overwhelming case; pre-selecting it removes a tap.
          Cash, not a lone bank account beside it — handing notes back is what a
          till does unless somebody chooses otherwise.
        */
        const drawers = offered.filter((channel) => channel.type === "cash");
        const only =
          drawers.length === 1
            ? drawers[0]
            : offered.length === 1
              ? offered[0]
              : null;
        if (only) {
          setChannelId(only._id);
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

  const chosenChannel =
    channels.find((channel) => channel._id === channelId) ?? null;
  const chosenType = chosenChannel?.type ?? null;
  /*
    ASKED ONLY WHEN THE CHANNEL ASKS, the same rule as the till's payment lines.
    The server refuses the gap too; this keeps the button honest about it.
  */
  const needsReference =
    needsChannel && chosenChannel?.requiresReference === true;

  const canSubmit =
    chosen.length > 0 &&
    reason.trim().length > 0 &&
    (!needsChannel || channelId !== "") &&
    (!needsReference || reference.trim().length > 0);

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
        ...(needsReference ? { refundReference: reference.trim() } : {}),
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
                    Belum ada channel tunai atau transfer di cabang ini. Tambah
                    dulu di Kas &amp; Bank.
                  </p>
                ) : (
                  <Select value={channelId} onValueChange={setChannelId}>
                    <SelectTrigger id="refund-channel" className="h-11">
                      <SelectValue placeholder="Pilih laci atau rekening" />
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
                {needsReference && (
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="refund-reference">No. referensi</Label>
                    <Input
                      id="refund-reference"
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      placeholder="Nomor bukti transfer"
                      className="h-11 tabular-nums"
                      disabled={submitting}
                    />
                  </div>
                )}
                {/*
                Said here because it changes whose drawer is short tonight: cash
                comes out of the till open right now, not the one that made the
                sale — and a transfer comes out of no drawer at all.
              */}
                <p className="text-xs text-muted">
                  {chosenType === "transfer"
                    ? "Uangnya ditransfer dari rekening ini, bukan dari laci — tidak ikut terhitung di tutup kasir."
                    : chosenType === "cash"
                      ? "Uangnya keluar dari laci yang sedang dibuka sekarang, dan ikut terhitung di tutup kasir nanti."
                      : "Tunai keluar dari laci yang sedang dibuka sekarang; transfer tidak mengurangi laci."}
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
