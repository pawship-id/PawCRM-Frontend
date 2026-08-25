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
  /*
    Present because the type demands it, and never rendered: TYPE_ORDER below
    omits it, and the till only ever lists channels that can RECEIVE. A giro is
    something a shop writes to a supplier, not something a customer hands over.
  */
  giro: "Giro",
};

const TYPE_ORDER: PaymentChannelType[] = ["cash", "qris", "edc", "transfer"];

/**
 * Where a sale can be settled — the four channel types, plus one that is not a
 * channel at all.
 *
 * PIUTANG IS NOT A PAYMENT CHANNEL and deliberately never becomes one. A channel
 * names an account money physically arrives in; a credit sale is money that has
 * NOT arrived. Filing it as a channel would put it in the drawer count, in the
 * X-Report's cash expectation, and in every reconciliation — as a figure nobody
 * can reconcile, because there is nothing to reconcile it against.
 *
 * It shares this row because that is where a cashier looks for "how is this
 * being settled", and that question does include "on account".
 */
export type PaymentRoute = PaymentChannelType | "piutang";

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
  activeRoute,
  onRouteChange,
  onPick,
  creditBlockedReason = null,
  disabled = false,
}: {
  channels: PaymentChannel[];
  activeRoute: PaymentRoute;
  onRouteChange: (route: PaymentRoute) => void;
  onPick: (channel: PaymentChannel) => void;
  /**
   * Why Piutang cannot be used right now, or null when it can.
   *
   * A REASON RATHER THAN A BOOLEAN, because the pill has to SAY it. A disabled
   * control with no explanation is the commonest way a screen wastes somebody's
   * time: they press it, nothing happens, and they press it again.
   */
  creditBlockedReason?: string | null;
  disabled?: boolean;
}) {
  const available = TYPE_ORDER.filter((type) =>
    channels.some((channel) => channel.type === type),
  );
  const inType = channels.filter((channel) => channel.type === activeRoute);

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
            aria-pressed={activeRoute === type}
            variant={activeRoute === type ? "default" : "secondary"}
            disabled={disabled}
            onClick={() => onRouteChange(type)}
          >
            {TYPE_LABEL[type]}
          </Button>
        ))}

        {/*
          WRAPPED IN A SPAN CARRYING THE TITLE. A `title` on the disabled button
          itself is unreliable — a disabled control swallows pointer events in
          several engines, so the hint would never appear on the one occasion it
          is needed. The wrapper still receives them.
        */}
        <span title={creditBlockedReason ?? undefined}>
          <Button
            type="button"
            size="sm"
            aria-pressed={activeRoute === "piutang"}
            variant={activeRoute === "piutang" ? "default" : "secondary"}
            disabled={disabled || creditBlockedReason !== null}
            onClick={() => onRouteChange("piutang")}
          >
            Piutang
          </Button>
        </span>
      </div>

      {/*
        SAID OUT LOUD, not only on hover. The PRD asks for a tooltip, and a
        tooltip on a till is a hint nobody receives: the screen is touched, not
        pointed at, and hover does not exist. The `title` above is kept for the
        shop running this on a laptop; this line is for everyone else.
      */}
      {creditBlockedReason !== null && (
        <p className="text-sm text-muted">{creditBlockedReason}</p>
      )}

      {activeRoute === "piutang" ? null : (
      <div className="flex flex-wrap gap-2">
        {inType.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada channel {TYPE_LABEL[activeRoute as PaymentChannelType].toLowerCase()}. Tambah di
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
      )}
    </div>
  );
}

export { TYPE_LABEL };
