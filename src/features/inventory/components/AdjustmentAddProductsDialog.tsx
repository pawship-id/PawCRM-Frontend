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
 * Choosing which products an adjustment corrects.
 *
 * THE FOURTH USER OF ProductMultiPicker, after the opname sheet, the transfer
 * form and the opening stock document — deliberately, rather than a fourth way
 * of putting products on a stock document. The picker searches on the SERVER and
 * keeps ticks across searches, so "vaksin" then "shampoo" is one document.
 *
 * NO WAREHOUSE FILTER HERE, unlike the opening stock version. Eligibility there
 * is a question about the ledger — has this ever moved — and only products that
 * have NOT moved may be named. An adjustment is the opposite: it corrects what
 * is on a shelf, and a product with no stock is a perfectly ordinary thing to
 * find one of.
 *
 * NOTHING IS POSTED BY ADDING IT. This only puts empty rows on the form; the
 * quantities are typed afterwards and nothing reaches the ledger until the
 * document is saved.
 */
export function AdjustmentAddProductsDialog({
  /** What the document already carries — hidden, never offered twice. */
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
          <DialogTitle>Tambah produk ke penyesuaian</DialogTitle>
          <DialogDescription>
            Cari lalu centang produk yang mau dikoreksi, boleh beberapa produk
            sekaligus. Stok sistem dan selisihnya muncul di form setelah ini.
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
