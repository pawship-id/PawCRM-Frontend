"use client";

import { useState } from "react";

import { SkuText } from "@/components/SkuText";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty } from "@/utils/decimal";
import type { PurchaseInvoiceItem } from "@/types/api";

/**
 * One invoice line as the picker shows it — how much of it is still free.
 *
 * `remaining` is computed by the form, not here: it is the invoice line less
 * EVERY receipt line already pointing at it — other receipts, and the rows on
 * this form, every batch of them — and only the form can see all of those.
 */
export interface InvoiceLineChoice {
  line: PurchaseInvoiceItem;
  /** Already on a receipt or on this form. */
  allocated: string;
  /** What may still be picked; "0" when nothing is left. */
  remaining: string;
  /** Whether `remaining` is above zero. */
  available: boolean;
}

/**
 * Choosing which INVOICE LINES this receipt takes (16 October 2026, BO).
 *
 * THE INVOICE'S LINES AND NOTHING ELSE — not the catalogue. A receipt made from
 * an invoice receives what was billed, so the only honest list is the bill.
 *
 * A LINE OF GOODS THAT EXPIRE STAYS ON OFFER while some of it is still free:
 * one invoice line commonly arrives as two batches with two expiry dates, and
 * each batch is its own row. Goods with no batch are left out by the form once
 * they are on it — see `invoiceChoices`. A line with nothing left is still listed — with
 * "0" left and its box disabled — so the clerk can see it was not forgotten.
 *
 * NOTHING IS POSTED BY ADDING IT. Picking only puts rows on the form, each
 * seeded with what is left of its line; the quantity, the batch and what
 * arrived are filled in on the form.
 */
export function ReceiptInvoiceLinesDialog({
  invoiceNumber,
  choices,
  onAdd,
  onClose,
}: {
  invoiceNumber: string;
  choices: InvoiceLineChoice[];
  onAdd: (picked: InvoiceLineChoice[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function toggle(id: string, checked: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const chosen = choices.filter(
    (choice) => choice.available && picked.has(choice.line.invoiceItemId),
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tambah barang dari faktur {invoiceNumber}</DialogTitle>
          <DialogDescription>
            Hanya barang di faktur ini yang bisa dipilih. Barang berkedaluwarsa
            yang sudah ada di daftar tetap bisa dipilih lagi untuk batch lain,
            selama masih ada sisa qty faktur. Barang tanpa batch cukup diubah
            qty-nya di daftar.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Pilih</span>
                </TableHead>
                <TableHead>Produk</TableHead>
                <TableHead className="text-right">Harga</TableHead>
                <TableHead className="text-right">Qty faktur</TableHead>
                <TableHead className="text-right">Sudah dialokasikan</TableHead>
                <TableHead className="text-right">Sisa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {choices.map((choice) => {
                const { line } = choice;
                const id = line.invoiceItemId;
                const name = line.productName ?? line.name;

                return (
                  <TableRow
                    key={id}
                    // THE WHOLE ROW PICKS, not only the box — a 16px target
                    // in a row this wide is hard to aim at. The checkbox stays
                    // the keyboard and screen-reader control.
                    onClick={
                      choice.available
                        ? () => toggle(id, !picked.has(id))
                        : undefined
                    }
                    className={
                      choice.available
                        ? cn(
                            "cursor-pointer hover:bg-surface-hover",
                            picked.has(id) && "bg-navy-100 hover:bg-navy-100",
                          )
                        : "text-muted"
                    }
                  >
                    <TableCell>
                      <Checkbox
                        aria-label={`Pilih ${name}`}
                        checked={choice.available && picked.has(id)}
                        disabled={!choice.available}
                        // The row's own click handles a click on the box too;
                        // letting both fire would toggle it twice.
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={(checked) =>
                          toggle(id, checked === true)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{name}</p>
                      <p className="tabular-nums text-xs text-muted">
                        <SkuText value={line.productSku} />
                        {line.productUnit && ` · ${line.productUnit}`}
                        {line.productHasExpiry && " · bisa beberapa batch"}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(line.costPerUnit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(line.qty)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(choice.allocated)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatQty(choice.remaining)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={() => {
              onAdd(chosen);
              onClose();
            }}
            disabled={chosen.length === 0}
          >
            Tambahkan {chosen.length > 0 && `${chosen.length} barang`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
