"use client";

import { Minus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney, formatQty } from "@/utils/decimal";
import type { PosItem, PosReturnable } from "@/types/api";

/** One line's answer: how many come back, and whether they go on the shelf. */
export interface ReturnDraftLine {
  qty: number;
  returnToStock: boolean;
  /** Empty = the automatic split; rows = the lots the cashier chose. */
  lots?: Array<{ batchId: string; qty: number }>;
}

/**
 * Choosing what comes back (FR-11).
 *
 * A RETURN IS PARTIAL BY DEFAULT — every line starts at zero, and the cashier
 * counts up what is actually in the bag. Starting at the full quantity would
 * make "return everything" the one-tap answer and "return one of three" the
 * careful one, which is backwards: most returns are one item out of a basket.
 *
 * `returnToStock` IS PER LINE, because one bag holds both an unopened sack and a
 * chewed toy. A single answer for the whole return would either restock
 * something unsellable or write off something perfectly good.
 *
 * A SERVICE HAS NO CHECKBOX. A grooming that already happened is not on a shelf;
 * the server forces the flag to false whatever is sent, and offering a control
 * that does nothing is worse than offering none.
 *
 * NO REFUND FIGURE IS SHOWN PER LINE. What a line gives back is what was PAID
 * for it, net of its share of the basket discount — arithmetic the server owns
 * and this component would have to duplicate to display. A figure computed here
 * that disagreed with the refund would be discovered by a customer.
 */
export function ReturnItemsPicker({
  items,
  remaining,
  lotsByItem = [],
  draft,
  onChange,
  disabled = false,
}: {
  items: PosItem[];
  /** Per line, the lots it was sold from — see `PosReturnable`. */
  lotsByItem?: NonNullable<PosReturnable["items"][number]["lots"]>[];
  /** How many of each line are still returnable, after earlier returns. */
  remaining: number[];
  draft: Record<number, ReturnDraftLine>;
  onChange: (index: number, line: ReturnDraftLine) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item, index) => {
        const left = remaining[index] ?? 0;
        const line = draft[index] ?? { qty: 0, returnToStock: true };
        const isService = item.kind === "service";
        const lotOptions = lotsByItem[index] ?? [];
        /*
          A MEMBERSHIP IS NOT RETURNED HERE (29 September 2026). Handing a
          package back means WITHDRAWING THE CARD it minted, which refuses once
          a benefit has been used — the rule that matters, and one a refund
          screen cannot enforce. The server refuses the line outright; this
          keeps the row visible so the receipt still reads whole, and says why
          rather than offering a control that will be rejected.
        */
        const isMembership = item.kind === "membership";

        return (
          <li key={`${item.refId}-${index}`} className="py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {item.name}
                </span>
                <span className="block text-xs tabular-nums text-muted">
                  {formatQty(item.qty)} × {formatMoney(item.unitPrice)}
                  {left <= 0 && " · sudah diretur semua"}
                </span>
                {isMembership && (
                  <span className="block text-xs text-muted">
                    Batalkan kartunya di halaman Membership — tidak bisa diretur
                    dari sini.
                  </span>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  disabled={disabled || isMembership || line.qty <= 0}
                  aria-label={`Kurangi ${item.name}`}
                  onClick={() =>
                    onChange(index, { ...line, qty: line.qty - 1 })
                  }
                >
                  <Minus className="size-4" />
                </Button>

                <span className="w-8 text-center text-sm font-medium tabular-nums">
                  {line.qty}
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  disabled={disabled || isMembership || line.qty >= left}
                  aria-label={`Tambah ${item.name}`}
                  onClick={() =>
                    onChange(index, { ...line, qty: line.qty + 1 })
                  }
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            {/* Only asked once something on this line is actually coming back. */}
            {line.qty > 0 && !isService && !isMembership && (
              <div className="mt-2 flex items-center gap-2">
                <Checkbox
                  id={`restock-${index}`}
                  checked={line.returnToStock}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange(index, {
                      ...line,
                      returnToStock: checked === true,
                    })
                  }
                />
                <Label
                  htmlFor={`restock-${index}`}
                  className="text-sm font-normal text-muted"
                >
                  Masih layak jual, kembalikan ke stok
                </Label>
              </div>
            )}

            {/*
              WHICH LOT THE GOODS GO BACK TO (9 October 2026). Nothing shown means
              automatic — the lots the sale drew, in the order it drew them. Once
              rows exist the cashier is naming lots, and they must add up to the
              quantity coming back (checked when Retur is pressed). Offered only
              for goods going back on the shelf from a sale that drew from lots.
            */}
            {line.qty > 0 &&
              line.returnToStock &&
              !isService &&
              !isMembership &&
              lotOptions.length > 0 && (
                <ReturnLotRows
                  options={lotOptions}
                  qty={line.qty}
                  rows={line.lots ?? []}
                  disabled={disabled}
                  onChange={(lots) => onChange(index, { ...line, lots })}
                />
              )}
          </li>
        );
      })}
    </ul>
  );
}

/** The lots a returned line goes back to — one row each, like the till's. */
function ReturnLotRows({
  options,
  qty,
  rows,
  disabled,
  onChange,
}: {
  options: NonNullable<PosReturnable["items"][number]["lots"]>;
  qty: number;
  rows: Array<{ batchId: string; qty: number }>;
  disabled: boolean;
  onChange: (rows: Array<{ batchId: string; qty: number }>) => void;
}) {
  const total = rows.reduce((sum, row) => sum + row.qty, 0);
  const optionOf = (id: string) => options.find((o) => o.batchId === id);

  function add() {
    if (rows.length === 0) {
      // The first row starts from the automatic split, to be edited.
      const start: Array<{ batchId: string; qty: number }> = [];
      let left = qty;
      for (const option of options) {
        if (left <= 0) break;
        const take = Math.min(left, Math.floor(Number(option.qty)));
        if (take > 0) {
          start.push({ batchId: option.batchId, qty: take });
          left -= take;
        }
      }
      onChange(start.length > 0 ? start : [{ batchId: "", qty }]);
      return;
    }

    onChange([...rows, { batchId: "", qty: Math.max(qty - total, 1) }]);
  }

  return (
    <div className="mt-2 space-y-2">
      {rows.length > 0 && (
        <>
          <p className="text-xs font-medium text-muted">Kembali ke batch</p>
          {rows.map((row, index) => {
            const chosen = optionOf(row.batchId);
            const held = chosen ? Math.floor(Number(chosen.qty)) : qty;
            const others = rows.reduce(
              (sum, other, i) => (i === index ? sum : sum + other.qty),
              0,
            );
            const most = Math.max(Math.min(held, qty - others), 0);
            const taken = new Set(
              rows.filter((_, i) => i !== index).map((other) => other.batchId),
            );
            const patch = (next: Partial<{ batchId: string; qty: number }>) =>
              onChange(
                rows.map((r, i) => (i === index ? { ...r, ...next } : r)),
              );

            return (
              <div key={index} className="flex items-center gap-1.5">
                <Select
                  value={row.batchId}
                  onValueChange={(value) => {
                    const next = optionOf(value);
                    patch({
                      batchId: value,
                      qty: Math.min(
                        row.qty,
                        next ? Math.floor(Number(next.qty)) : row.qty,
                      ),
                    });
                  }}
                >
                  <SelectTrigger
                    className="h-9 min-w-0 flex-1"
                    aria-label={`Batch tujuan ${index + 1}`}
                  >
                    <SelectValue placeholder="Pilih batch" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    {options
                      .filter((option) => !taken.has(option.batchId))
                      .map((option) => (
                        <SelectItem key={option.batchId} value={option.batchId}>
                          {`${option.batchCode ?? "Batch"} · bisa kembali ${Number(option.qty)}`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={`Kurangi jumlah batch tujuan ${index + 1}`}
                  disabled={disabled || row.qty <= 1}
                  onClick={() => patch({ qty: row.qty - 1 })}
                >
                  <Minus className="size-3.5" />
                </Button>
                <Input
                  inputMode="numeric"
                  value={row.qty === 0 ? "" : String(row.qty)}
                  placeholder="0"
                  disabled={disabled}
                  aria-label={`Jumlah batch tujuan ${index + 1}`}
                  className="h-8 w-11 shrink-0 px-1 text-center tabular-nums"
                  onChange={(event) =>
                    patch({
                      qty: Math.min(
                        Number(event.target.value.replace(/\D/g, "") || 0),
                        most,
                      ),
                    })
                  }
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={`Tambah jumlah batch tujuan ${index + 1}`}
                  disabled={disabled || row.qty >= most}
                  onClick={() => patch({ qty: row.qty + 1 })}
                >
                  <Plus className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-danger"
                  aria-label={`Hapus baris batch tujuan ${index + 1}`}
                  disabled={disabled}
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                >
                  <X className="size-4" />
                </Button>
              </div>
            );
          })}
        </>
      )}

      {(rows.length === 0 || (total < qty && rows.length < options.length)) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 px-2 text-primary"
          disabled={disabled}
          onClick={add}
        >
          <Plus className="size-4" />
          Tambah batch
        </Button>
      )}
    </div>
  );
}
