"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, isDecimal, isPositive, toMinor } from "@/utils/decimal";
import type { GoodsReceiptDetailItem } from "@/types/api";

/**
 * What is going back, per line of the original delivery.
 *
 * `qty` and `reason` ARE THE ONLY TWO THINGS A CLIENT SENDS — the product, the
 * lot, the unit cost and the subtotal are all copied server-side from the receipt
 * line. That is the entire point of tracing a return to a receipt: the price that
 * delivery actually charged is what the weighted average must be reversed at, and
 * a client able to type it could restate the cost basis every later sale is
 * costed at.
 */
export interface ReturnLineDraft {
  qty: string;
  reason: string;
}

/** Keyed by `goodsreceipts.items[].itemId` — the identity a return line carries. */
export type ReturnLineDrafts = Record<string, ReturnLineDraft>;

/**
 * Common reasons, offered as a shortcut — NOT as a vocabulary.
 *
 * The API stores `reason` as free text (≤ 255 chars) per line, deliberately: it
 * is read by the SUPPLIER, on a document sent to settle a disagreement, and a
 * fixed enum chosen in our UI would be one the vendor never agreed to. The
 * prototype this replaced used a four-value enum and could not express "rusak
 * saat transit, kardus basah" at all. The presets below are prefills; the last
 * option hands the field back to the user.
 */
export const REASON_PRESETS = [
  "Rusak",
  "Kadaluarsa",
  "Salah kirim",
  "Tidak sesuai pesanan",
] as const;

/** Sentinel for "write your own" — never sent, and not a legal reason. */
const CUSTOM = "__custom__";

/**
 * True when the line is claiming more than the delivery has left to give.
 *
 * ADVISORY, exactly as `remainingQty` is. The server re-reads the ceiling inside
 * the submit and refuses an over-claim regardless of what this showed — two
 * drafts can each claim the same remainder and the second to submit is turned
 * away. Catching it here saves a round trip; it does not replace the check.
 */
export function exceedsRemaining(qty: string, remainingQty: string): boolean {
  const wanted = toMinor(qty);
  const available = toMinor(remainingQty);
  if (wanted === null || available === null) return false;
  return wanted > available;
}

/** The lines the user has actually filled in — a draft with no qty is not a line. */
export function chosenLines(
  items: GoodsReceiptDetailItem[],
  drafts: ReturnLineDrafts,
): GoodsReceiptDetailItem[] {
  return items.filter((item) => isPositive(drafts[item.itemId]?.qty ?? ""));
}

/**
 * The grid of a delivery's lines, with a returnable quantity and a reason per row.
 *
 * SHARED BY THE CREATE FORM AND THE DRAFT EDITOR, because they are the same
 * decision made at two moments and a second copy of this table would be a second
 * place for the ceiling to be read wrongly.
 *
 * THE CEILING COMES FROM THE SERVER — `remainingQty` on the receipt line — rather
 * than being reassembled here from the returns raised against the delivery. It
 * counts SUBMITTED returns only, so a draft never blocks the goods it names, and
 * the draft being edited right now does not count against itself.
 *
 * ROWS THAT ARE FULLY SPENT ARE DISABLED, NOT HIDDEN. A line that has already
 * gone back in its entirety is exactly what somebody about to return the same
 * carton twice needs to see; removing the row would answer their question by
 * making it unaskable.
 */
export function ReturnLinesEditor({
  items,
  drafts,
  onChange,
  disabled = false,
}: {
  items: GoodsReceiptDetailItem[];
  drafts: ReturnLineDrafts;
  onChange: (itemId: string, patch: Partial<ReturnLineDraft>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
            <th className="px-2 py-2 text-left font-medium">Produk</th>
            <th className="px-2 py-2 text-right font-medium">Diterima</th>
            <th className="px-2 py-2 text-right font-medium">Sudah diretur</th>
            <th className="px-2 py-2 text-right font-medium">Maks</th>
            <th className="px-2 py-2 text-right font-medium">Harga beli asli</th>
            <th className="px-2 py-2 text-right font-medium">Qty retur</th>
            <th className="px-2 py-2 text-left font-medium">Alasan</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const draft = drafts[item.itemId];
            const qty = draft?.qty ?? "";
            const reason = draft?.reason ?? "";

            const exhausted = (toMinor(item.remainingQty) ?? 0n) <= 0n;
            const active = isPositive(qty);
            const malformed = qty.trim() !== "" && !isDecimal(qty);
            const tooMuch = !malformed && exceedsRemaining(qty, item.remainingQty);

            // A preset only stays selected while the text still matches it
            // exactly; the moment somebody edits it, the row is custom.
            const preset = (REASON_PRESETS as readonly string[]).includes(reason)
              ? reason
              : CUSTOM;

            return (
              <tr
                key={item.itemId}
                className={cn(
                  "border-b border-border/60 last:border-0",
                  active && "bg-primary/5",
                  exhausted && "opacity-60",
                )}
              >
                <td className="px-2 py-2">
                  <p className="text-sm font-medium">
                    {item.productName ?? item.name}
                  </p>
                  <p className="tabular-nums text-xs text-muted">
                    {item.productSku ?? "—"}
                  </p>
                </td>

                <td className="px-2 py-2 text-right tabular-nums text-xs text-muted">
                  {formatQty(item.qty)}
                </td>

                <td className="px-2 py-2 text-right tabular-nums text-xs text-muted">
                  {(toMinor(item.returnedQty) ?? 0n) > 0n
                    ? formatQty(item.returnedQty)
                    : "—"}
                </td>

                <td className="px-2 py-2 text-right tabular-nums text-xs font-semibold">
                  {formatQty(item.remainingQty)}
                </td>

                <td className="px-2 py-2 text-right tabular-nums text-xs">
                  {formatMoney(item.costPerUnit)}
                </td>

                <td className="px-2 py-2">
                  <Input
                    aria-label={`Qty retur ${item.productName ?? item.name}`}
                    inputMode="decimal"
                    placeholder="0"
                    disabled={disabled || exhausted}
                    value={qty}
                    onChange={(event) =>
                      onChange(item.itemId, { qty: event.target.value })
                    }
                    aria-invalid={malformed || tooMuch}
                    className={cn(
                      "ml-auto max-w-24 text-right tabular-nums",
                      (malformed || tooMuch) && "border-danger",
                    )}
                  />
                  {tooMuch && (
                    <p className="mt-1 text-right text-[11px] text-danger">
                      maks {formatQty(item.remainingQty)}
                    </p>
                  )}
                  {malformed && (
                    <p className="mt-1 text-right text-[11px] text-danger">
                      bukan angka
                    </p>
                  )}
                </td>

                <td className="px-2 py-2">
                  <Select
                    value={preset}
                    disabled={disabled || exhausted}
                    onValueChange={(value) =>
                      onChange(item.itemId, {
                        // Choosing "tulis sendiri" clears the box rather than
                        // leaving the preset text behind for the user to delete.
                        reason: value === CUSTOM ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger
                      aria-label={`Alasan ${item.productName ?? item.name}`}
                      className="w-44"
                    >
                      <SelectValue placeholder="Pilih alasan" />
                    </SelectTrigger>
                    <SelectContent>
                      {REASON_PRESETS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                      <SelectItem value={CUSTOM}>Tulis sendiri…</SelectItem>
                    </SelectContent>
                  </Select>

                  {preset === CUSTOM && (
                    <Input
                      aria-label={`Alasan lain ${item.productName ?? item.name}`}
                      placeholder="mis. rusak saat transit, kardus basah"
                      maxLength={255}
                      disabled={disabled || exhausted}
                      value={reason}
                      onChange={(event) =>
                        onChange(item.itemId, { reason: event.target.value })
                      }
                      aria-invalid={active && reason.trim() === ""}
                      className={cn(
                        "mt-1 w-44 text-xs",
                        active && reason.trim() === "" && "border-danger",
                      )}
                    />
                  )}

                  {active && reason.trim() === "" && (
                    <p className="mt-1 text-[11px] text-danger">
                      alasan wajib diisi
                    </p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-3 text-xs text-muted">
        Kolom <b>Maks</b> hanya menghitung retur yang sudah <b>final</b>. Draft
        milik orang lain belum memotong jatah, jadi angka ini bisa berubah — yang
        menentukan tetap server saat retur disubmit.
      </p>
    </div>
  );
}
