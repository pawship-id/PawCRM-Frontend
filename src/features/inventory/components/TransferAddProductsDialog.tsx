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
 * Choosing what goes into a transfer — several products at a time, by search.
 *
 * WHY A DIALOG RATHER THAN A DROPDOWN ON THE FORM. Preparing a bazaar is a
 * dozen products picked out of a catalogue that may run to thousands, and a
 * `<Select>` can only offer one at a time out of a list it has to hold entirely
 * in memory. The picker searches on the SERVER and keeps ticks across searches,
 * so "vaksin" then "shampoo" is one trip, not two.
 *
 * ONLY WHAT THE SOURCE ACTUALLY HOLDS. The list is filtered to products with
 * stock at `fromWarehouseId`, by the server against the balances — a transfer
 * takes goods off one shelf, and offering something that shelf does not have
 * would produce a row whose only possible ending is "Melebihi stok — tersedia
 * 0". Products whose stock predates their batches still appear: they have a
 * balance, they simply have no lot.
 *
 * NOTHING IS MOVED BY ADDING IT. This only puts empty rows on the form; the
 * quantities — and the per-line notes — are typed on the form afterwards, and
 * nothing reaches the ledger until it is saved. That is why the dialog cannot
 * fail and takes no async handler, unlike the opname's version of it, which
 * posts to the API as it closes.
 *
 * Its own dialog rather than ConfirmDialog, which puts its children inside a
 * `<p>`: this one holds a search box and a list of checkboxes.
 */
export function TransferAddProductsDialog({
  /** What the form already carries — hidden from the list, never offered twice. */
  existingProductIds,
  fromWarehouseId,
  onAdd,
  onClose,
}: {
  existingProductIds: string[];
  /**
   * The shelf the goods come off — and therefore what may be offered at all.
   *
   * A transfer moves what is HERE: a product the source warehouse holds none of
   * can only ever produce a line the save refuses, so it is filtered out by the
   * server rather than added, typed into, and rejected. Re-asked whenever the
   * source changes, because "what is on the shelf" is a different answer at
   * every location.
   */
  fromWarehouseId: string;
  onAdd: (products: Product[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Product[]>([]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tambah produk ke transfer ini</DialogTitle>
          <DialogDescription>
            Cari lalu centang produk yang ikut dipindahkan — boleh beberapa
            sekaligus. Jumlah dan catatannya diisi di form setelah ini. Yang
            ditampilkan hanya produk yang <b>ada stoknya di gudang asal</b>;
            produk yang sudah ada di form juga disembunyikan, karena satu
            transfer hanya boleh membawa tiap produk sekali.
          </DialogDescription>
        </DialogHeader>

        <ProductMultiPicker
          selected={selected}
          onChange={setSelected}
          excludeIds={existingProductIds}
          inStockAtWarehouse={fromWarehouseId}
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
