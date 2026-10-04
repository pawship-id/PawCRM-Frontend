"use client";

import { useEffect, useState } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { paymentChannelService } from "@/services/paymentChannel.service";
import type { PaymentChannel, PaymentMethod } from "@/types/api";

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

/**
 * "Metode" + "Keluar dari" — the two fields that say HOW and FROM WHICH ACCOUNT
 * money leaves the shop to a supplier.
 *
 * EXTRACTED from `RecordPaymentForm` when the consignment "Setor" dialog became
 * its second caller: both pay a supplier out of a `paymentChannels` row and send
 * the same `{ method, channelId }` pair, so the direction rule (`usableFor:
 * "out"`) and the method/channel agreement must live in ONE place. Both callers
 * are in Pembelian, so it stays in this feature rather than `src/components/`
 * (ui-rules §14: promote only when a second FEATURE needs it).
 *
 * CONTROLLED: the parent owns `method` and `channelId` because it sends them. The
 * channel list is this component's own — it is re-read whenever the method
 * changes, filtered to channels that can pay OUT, and a lone match is
 * pre-selected (the ordinary case: one account per method).
 */
export function PaymentAccountFields({
  method,
  channelId,
  onMethodChange,
  onChannelChange,
  disabled,
  idPrefix = "payment",
}: {
  method: PaymentMethod;
  channelId: string;
  onMethodChange: (method: PaymentMethod) => void;
  onChannelChange: (channelId: string) => void;
  disabled?: boolean;
  /** Keeps label/id pairs unique when two forms could be mounted together. */
  idPrefix?: string;
}) {
  const [channels, setChannels] = useState<PaymentChannel[]>([]);

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
        onChannelChange(result.items.length === 1 ? result.items[0]._id : "");
      })
      .catch(() => {
        if (active) setChannels([]);
      });

    return () => {
      active = false;
    };
    // `onChannelChange` is a state setter in both callers; depending on it would
    // refetch on every render of a parent that wrapped it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-method`}>Metode</Label>
        <Select
          value={method}
          disabled={disabled}
          onValueChange={(value) => onMethodChange(value as PaymentMethod)}
        >
          <SelectTrigger id={`${idPrefix}-method`} aria-label="Metode">
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
        <Label htmlFor={`${idPrefix}-channel`}>Keluar dari</Label>
        {channels.length === 0 ? (
          <p className="text-sm text-danger">
            Belum ada rekening {METHOD_LABEL[method]} untuk pembayaran keluar.
            Tambah dulu di Kas &amp; Bank.
          </p>
        ) : (
          <Select
            value={channelId}
            disabled={disabled}
            onValueChange={onChannelChange}
          >
            <SelectTrigger id={`${idPrefix}-channel`} aria-label="Keluar dari">
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
    </>
  );
}
