"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Product } from "@/types/inventory";

import { ProductMultiPicker } from "./ProductMultiPicker";

/**
 * Choosing which products go onto an opening stock sheet.
 *
 * THE THIRD USER OF ProductMultiPicker, after the opname sheet and the transfer
 * form — deliberately, rather than a fourth way of putting products on a stock
 * document. The picker searches on the SERVER and keeps ticks across searches,
 * which is what a day-one catalogue needs: "makanan" then "vaksin" is one trip
 * and one sheet, and a per-row dropdown could only ever offer one product at a
 * time out of a list it had to hold in memory.
 *
 * NOTHING IS POSTED BY ADDING IT. This only puts empty rows on the form; the
 * quantity and the purchase price are typed afterwards and nothing reaches the
 * ledger until the sheet is saved. So, like the transfer's version and unlike
 * the opname's, it takes no async handler and cannot fail.
 *
 * THE ELIGIBILITY RULE IS APPLIED TO THE LIST, by the server, against the
 * ledger: only products with no movement in the sheet's warehouse are offered.
 * Filtering rather than refusing-on-save is the difference between a picker that
 * cannot produce a bad sheet and one that lets somebody type twenty rows before
 * naming the four that were never allowed.
 *
 * SCOPED TO THE WAREHOUSE, not global — a product trading in one warehouse may
 * legitimately be receiving its opening balance in another, which is how a
 * tenant opening with two locations fills both. The save enforces the same rule
 * at the same scope, so the list and the refusal cannot disagree.
 *
 * Its own dialog rather than ConfirmDialog, which puts its children inside a
 * `<p>`: this one holds a search box and a list of checkboxes.
 */
export function OpeningStockAddProductsDialog({
  /** The sheet's warehouse — what "never moved" is asked about. */
  warehouseId,
  /** What the sheet already carries — hidden from the list, never offered twice. */
  existingProductIds,
  onAdd,
  onClose,
}: {
  warehouseId: string;
  existingProductIds: string[];
  onAdd: (products: Product[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Product[]>([]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tambah produk ke stok awal</DialogTitle>
          <DialogDescription>
            Cari lalu centang produk yang stok awalnya mau dicatat, boleh
            beberapa produk sekaligus. Hanya menampilkan produk yang{" "}
            <b>belum pernah punya pergerakan di gudang ini</b>.
          </DialogDescription>
        </DialogHeader>

        <ProductMultiPicker
          neverMovedInWarehouse={warehouseId}
          selected={selected}
          onChange={setSelected}
          excludeIds={existingProductIds}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={() => {
              onAdd(selected);
              onClose();
            }}
            disabled={selected.length === 0}
          >
            Tambahkan {selected.length > 0 && `${selected.length} produk`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
