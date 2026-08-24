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
 * IT DOES FILTER BY OWNERSHIP, though, which is the one thing a receipt knows
 * that the other four documents do not: it has already been told whether this
 * delivery is *beli putus* or *konsinyasi*. Offering the wrong kind is the same
 * failure the warehouse filters exist to prevent, arriving later — the goods are
 * on the shelf and the journal is posted before anybody notices that a titipan
 * item was received as a purchase.
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
  consignment,
  onAdd,
  onClose,
}: {
  existingProductIds: string[];
  /**
   * Which tab the receipt is on. Offers ONLY the matching kind of goods —
   * titipan on a consignment intake, the shop's own on a purchase.
   *
   * A required prop with no default, deliberately: a caller that forgot it
   * would silently offer the whole catalogue, and the mistake is invisible
   * until a receipt is already posted against the wrong kind of goods.
   */
  consignment: boolean;
  onAdd: (products: Product[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Product[]>([]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Tambah barang yang diterima
            {/* The tab, restated INSIDE the modal. The tabs are behind the
                overlay while this is open, so without it the only cue for why
                half the catalogue is missing is off-screen. */}
            <span className="ml-2 rounded-full bg-secondary/25 px-2 py-0.5 align-middle text-xs font-medium text-secondary-foreground">
              {consignment ? "Konsinyasi" : "Beli putus"}
            </span>
          </DialogTitle>
          <DialogDescription>
            Cari lalu centang produk yang datang dari supplier ini, boleh
            beberapa sekaligus. Qty dan harga belinya diisi di form setelah ini.{" "}
            {consignment
              ? "Yang tampil hanya produk yang ditandai konsinyasi (titipan)."
              : "Produk yang ditandai konsinyasi (titipan) tidak ditampilkan di sini."}
          </DialogDescription>
        </DialogHeader>

        <ProductMultiPicker
          selected={selected}
          onChange={setSelected}
          excludeIds={existingProductIds}
          isConsignment={consignment}
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
