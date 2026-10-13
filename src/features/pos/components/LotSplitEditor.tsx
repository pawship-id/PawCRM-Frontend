"use client";

import { Minus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PosLot } from "@/types/api";

/**
 * WHICH LOTS A PRODUCT LINE IS TAKEN FROM — the till's batch rows, lifted out
 * of `PosLineDialog` when Faktur baru needed the same picker (13 October 2026).
 *
 * NO ROWS = AUTOMATIC (FEFO), which is the default and needs no choosing. The
 * moment somebody adds a batch row they are naming lots, and then the rows must
 * add up to the line's quantity. Removing the last row is the way back.
 */

/** One row of the manual split: which lot, and how many from it. */
export interface LotRow {
  batchId: string;
  qty: number;
}

/**
 * The default split: earliest-expiring lots first, which is what FEFO would do.
 * It is only the STARTING point of manual mode — edited from here rather than
 * built from nothing.
 */
export function fefoSplit(lots: PosLot[], qty: number): LotRow[] {
  const rows: LotRow[] = [];
  let left = qty;

  for (const lot of lots) {
    if (left <= 0) break;

    const take = Math.min(left, Math.floor(Number(lot.qtyRemaining)));
    if (take <= 0) continue;

    rows.push({ batchId: lot._id, qty: take });
    left -= take;
  }

  return rows.length > 0 ? rows : [{ batchId: "", qty: Math.max(qty, 1) }];
}

/**
 * THE SPLIT MUST ADD UP: every row names a lot, takes a whole number within
 * what the lot holds, and the rows total the quantity. No rows is automatic,
 * and always valid. The server enforces the same — this is so the person is
 * told BEFORE pressing, not refused after.
 */
export function lotRowsValid(rows: LotRow[], lots: PosLot[], qty: number) {
  if (rows.length === 0) return true;

  const total = rows.reduce((sum, row) => sum + row.qty, 0);

  return (
    total === qty &&
    rows.every((row) => {
      const lot = lots.find((one) => one._id === row.batchId);
      return (
        lot !== undefined &&
        Number.isInteger(row.qty) &&
        row.qty >= 1 &&
        row.qty <= Number(lot.qtyRemaining)
      );
    })
  );
}

export function LotSplitEditor({
  lots,
  qty,
  rows,
  available,
  onRowsChange,
}: {
  lots: PosLot[];
  /** The line's quantity — what the rows must add up to. */
  qty: number;
  rows: LotRow[];
  /** Whether this line can name lots at all — a product that expires. */
  available: boolean;
  onRowsChange: (rows: LotRow[]) => void;
}) {
  const lotOf = (id: string) => lots.find((lot) => lot._id === id);
  const total = rows.reduce((sum, row) => sum + row.qty, 0);

  /*
    OFFERED WHILE THERE IS SOMETHING TO ADD: no rows yet (the first one starts
    from FEFO's own split), or rows that do not yet cover the quantity with lots
    left.
  */
  const canAddBatch =
    available &&
    lots.length > 0 &&
    (rows.length === 0 || (total < qty && rows.length < lots.length));

  function addBatch() {
    onRowsChange(
      rows.length === 0
        ? fefoSplit(lots, qty)
        : [...rows, { batchId: "", qty: Math.max(qty - total, 1) }],
    );
  }

  function patchRow(index: number, patch: Partial<LotRow>) {
    onRowsChange(
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  return (
    <>
      {rows.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Batch</Label>
          <div className="space-y-2">
            {rows.map((row, index) => {
              const lot = lotOf(row.batchId);
              const held = lot ? Math.floor(Number(lot.qtyRemaining)) : 0;
              const taken = new Set(
                rows
                  .filter((_, i) => i !== index)
                  .map((other) => other.batchId),
              );
              /*
                THE MOST THIS ROW CAN TAKE: what its lot holds, and what is
                still unassigned on the line once the OTHER rows are counted.
                The input clamps to it, and + goes grey at it.
              */
              const most = Math.max(
                Math.min(lot ? held : qty, qty - (total - row.qty)),
                0,
              );

              return (
                /*
                  ONE LINE PER LOT: the choice stretches, the quantity controls
                  and the bin sit at its end. The Select is the only part that
                  gives, so the line still fits a phone's dialog.
                */
                <div key={index} className="flex items-center gap-1.5">
                  <Select
                    value={row.batchId}
                    onValueChange={(value) => {
                      const next = lotOf(value);
                      const cap = next
                        ? Math.floor(Number(next.qtyRemaining))
                        : row.qty;
                      patchRow(index, {
                        batchId: value,
                        qty: Math.min(row.qty, cap),
                      });
                    }}
                  >
                    <SelectTrigger
                      className="h-9 min-w-0 flex-1"
                      aria-label={`Batch ${index + 1}`}
                    >
                      <SelectValue placeholder="Pilih batch" />
                    </SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-2rem)]">
                      {lots
                        .filter((option) => !taken.has(option._id))
                        .map((option) => (
                          <SelectItem key={option._id} value={option._id}>
                            {`${option.supplierBatchCode ?? option.batchCode} · sisa ${Number(option.qtyRemaining)}`}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label={`Kurangi jumlah batch ${index + 1}`}
                    disabled={row.qty <= 1}
                    onClick={() => patchRow(index, { qty: row.qty - 1 })}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <Input
                    inputMode="numeric"
                    value={row.qty === 0 ? "" : String(row.qty)}
                    placeholder="0"
                    aria-label={`Jumlah batch ${index + 1}`}
                    className="h-8 w-11 shrink-0 px-1 text-center tabular-nums"
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "");
                      patchRow(index, {
                        qty: Math.min(Number(digits || 0), most),
                      });
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label={`Tambah jumlah batch ${index + 1}`}
                    disabled={row.qty >= most}
                    onClick={() => patchRow(index, { qty: row.qty + 1 })}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-danger"
                    aria-label={`Hapus baris batch ${index + 1}`}
                    onClick={() =>
                      onRowsChange(rows.filter((_, i) => i !== index))
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canAddBatch && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 px-2 text-primary"
          onClick={addBatch}
        >
          <Plus className="size-4" />
          Tambah batch
        </Button>
      )}
    </>
  );
}
