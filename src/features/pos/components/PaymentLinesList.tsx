"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/utils/decimal";
import type { PaymentChannel, PosPaymentInput } from "@/types/api";

/** A settlement line, with the channel it names kept alongside for its rules. */
export interface DraftPayment extends PosPaymentInput {
  channel: PaymentChannel;
}

/**
 * The lines making up one settlement (FR-7).
 *
 * A LIST, NOT A SINGLE FIELD, because a split payment is ordinary: 100.000 cash
 * and the rest on a card is one sale, and forcing it into one line would either
 * lose which channel took what or need two sales.
 *
 * THE REFERENCE FIELD APPEARS ONLY WHERE THE CHANNEL ASKS FOR IT. A QRIS or EDC
 * line with no trace number cannot be matched against the settlement report, and
 * an unmatchable line is indistinguishable from one that never arrived. Shown on
 * a cash line it would be a field nobody fills in, which teaches people to skip
 * the ones that matter.
 */
export function PaymentLinesList({
  lines,
  onChange,
  onRemove,
  disabled = false,
}: {
  lines: DraftPayment[];
  onChange: (index: number, patch: Partial<DraftPayment>) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  if (lines.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
        Pilih metode bayar di atas untuk menambah baris.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {lines.map((line, index) => (
        <li
          key={`${line.channelId}-${index}`}
          className="rounded-lg border border-border p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {line.channel.name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 text-danger"
              disabled={disabled}
              aria-label={`Hapus ${line.channel.name}`}
              onClick={() => onRemove(index)}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              value={line.amount}
              onChange={(event) =>
                onChange(index, { amount: event.target.value })
              }
              inputMode="numeric"
              placeholder="0"
              aria-label={`Jumlah ${line.channel.name}`}
              className="h-11 w-36 tabular-nums"
              disabled={disabled}
            />

            {line.channel.requiresReference && (
              <Input
                value={line.reference ?? ""}
                onChange={(event) =>
                  onChange(index, { reference: event.target.value })
                }
                placeholder="No. referensi"
                aria-label={`Referensi ${line.channel.name}`}
                className="h-11 flex-1"
                disabled={disabled}
              />
            )}
          </div>

          {/*
            Change is shown, not typed. The cashier types what was handed over;
            what goes back is arithmetic, and a second field to get wrong is a
            drawer that disagrees with the receipt.
          */}
          {line.channel.type === "cash" &&
            line.change &&
            line.change !== "0" && (
              <p className="mt-2 text-sm tabular-nums text-muted">
                Kembalian: {formatMoney(line.change)}
              </p>
            )}
        </li>
      ))}
    </ul>
  );
}
