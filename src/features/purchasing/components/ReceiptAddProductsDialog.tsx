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
import { ProductMultiPicker } from "@/features/inventory/components/ProductMultiPicker";
import type { Product } from "@/types/inventory";

/**
 * Choosing which products a delivery brought.
 *
 * THE FIFTH USER OF ProductMultiPicker, after the opname sheet, the transfer
 * form, the opening stock document and the adjustment — deliberately, rather
 * than a fifth way of putting products on a stock document. What it replaced
 * here was a per-row `<Select>` over the WHOLE catalogue held in memory: fine at
 * fifty products, a scroll nobody can aim at five thousand, and one product per
 * trip either way. The picker searches on the SERVER and keeps ticks across
 * searches, so a van carrying "vaksin" and "shampoo" is one pass over the form.
 *
 * NO WAREHOUSE FILTER, unlike the opening stock and transfer versions. Both of
 * those ask the ledger a question about a shelf — has this ever moved here, is
 * there any of it here to move. A receipt is the other direction: the goods are
 * arriving, so a product with nothing on the shelf is the ordinary case, not the
 * excluded one.
 *
 * NOTHING IS POSTED BY ADDING IT. This only puts rows on the form; the quantity,
 * the purchase price and the expiry date are typed afterwards, and nothing
 * reaches the ledger until the receipt is saved.
 */
export function ReceiptAddProductsDialog({
  /** What the receipt already carries — hidden, never offered twice. The API
      refuses a product on two lines, so a tick that could only produce a
      refusal is worse than an absence. */
  existingProductIds,
  onAdd,
  onClose,
}: {
  existingProductIds: string[];
  onAdd: (products: Product[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Product[]>([]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tambah barang yang diterima</DialogTitle>
          <DialogDescription>
            Cari lalu centang produk yang datang dari supplier ini, boleh
            beberapa sekaligus. Qty dan harga belinya diisi di form setelah ini.
          </DialogDescription>
        </DialogHeader>

        <ProductMultiPicker
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
