"use client";

import { Button } from "@/components/ui/button";
import type { PaymentChannel, PaymentChannelType } from "@/types/api";

/**
 * What each type is called at the counter.
 *
 * The type is a grouping, not a choice — FR-7 is explicit that a payment names a
 * SPECIFIC channel, because "transfer" does not say which bank account the money
 * landed in and the reconciliation needs to know.
 */
const TYPE_LABEL: Record<PaymentChannelType, string> = {
  cash: "Tunai",
  transfer: "Transfer",
  qris: "QRIS",
  edc: "Kartu",
};

const TYPE_ORDER: PaymentChannelType[] = ["cash", "qris", "edc", "transfer"];

/**
 * Choosing where the money goes (FR-7).
 *
 * TWO ROWS, NOT ONE. The top row picks a TYPE and the bottom picks the actual
 * channel within it, because a shop with three bank accounts and two QRIS
 * providers has more channels than fit on a row — and flattening them would put
 * "BCA 1234" beside "Tunai" as if they were the same kind of decision.
 *
 * CASH LEADS, always. It is what most sales are settled with, and a till is
 * operated by muscle memory.
 */
export function PaymentChannelPicker({
  channels,
  activeType,
  onTypeChange,
  onPick,
  disabled = false,
}: {
  channels: PaymentChannel[];
  activeType: PaymentChannelType;
  onTypeChange: (type: PaymentChannelType) => void;
  onPick: (channel: PaymentChannel) => void;
  disabled?: boolean;
}) {
  const available = TYPE_ORDER.filter((type) =>
    channels.some((channel) => channel.type === type),
  );
  const inType = channels.filter((channel) => channel.type === activeType);

  return (
    <div className="space-y-3">
      {/*
        A PILL ROW, not a tablist. The PRD calls these tabs and they look like
        tabs, but tab semantics need tabpanels to mean anything, and what is
        below is not a panel — it is the channel list narrowed by the pill. Half
        an ARIA pattern is worse than none: a screen reader would announce a tab
        and then find nothing it controls. ui-rules §8 covers exactly this shape,
        and PosCategoryPills in this same feature already uses it.
      */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Metode bayar">
        {available.map((type) => (
          <Button
            key={type}
            type="button"
            size="sm"
            aria-pressed={activeType === type}
            variant={activeType === type ? "default" : "secondary"}
            disabled={disabled}
            onClick={() => onTypeChange(type)}
          >
            {TYPE_LABEL[type]}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {inType.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada channel {TYPE_LABEL[activeType].toLowerCase()}. Tambah di
            Kas &amp; Bank.
          </p>
        ) : (
          inType.map((channel) => (
            <Button
              key={channel._id}
              type="button"
              variant="secondary"
              className="h-11"
              disabled={disabled}
              onClick={() => onPick(channel)}
            >
              {channel.name}
            </Button>
          ))
        )}
      </div>
    </div>
  );
}

export { TYPE_LABEL };
