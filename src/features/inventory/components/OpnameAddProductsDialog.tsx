"use client";

import { useState } from "react";

import { Alert, Spinner } from "@/components";
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
 * Adding products to a count that is already open.
 *
 * WHY THIS EXISTS. A sheet is a plan for an afternoon's work, and the plan is
 * wrong the moment somebody finds a shelf that was not on it. Without this the
 * only remedy was to discard the draft and open another — throwing away every
 * quantity already typed, which is how people end up counting on paper.
 *
 * NOTHING IS COUNTED BY ADDING IT. The server pre-fills each new line with the
 * system quantity and leaves it uncounted, so the sheet's progress figure goes
 * from `12 / 40` to `12 / 43` rather than pretending three more shelves were
 * walked. That is also why the picker sends product ids and no quantities.
 *
 * ITS OWN DIALOG RATHER THAN ConfirmDialog, which puts its children inside a
 * <p>: this one holds a search box and a list of checkboxes.
 */
export function OpnameAddProductsDialog({
  /** What the sheet already carries — hidden from the list, never offered twice. */
  existingProductIds,
  busy,
  onAdd,
  onClose,
}: {
  existingProductIds: string[];
  busy: boolean;
  /** Resolves to the API's refusal, or null when it worked. */
  onAdd: (productIds: string[]) => Promise<string | null>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);

    const failure = await onAdd(selected.map((product) => product._id));

    // Kept OPEN on a refusal: "these are already on the sheet" names products
    // the counter can untick and try again, which a closed dialog cannot offer.
    if (failure) {
      setError(failure);
      return;
    }

    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent showCloseButton={!busy} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tambah produk ke lembar ini</DialogTitle>
          <DialogDescription>
            Baris baru dibuka dengan angka sistem dan berstatus{" "}
            <b>belum dihitung</b> — hitungan yang sudah Anda isi tidak berubah.
            Produk yang sudah ada di lembar ini tidak ditampilkan.
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        <ProductMultiPicker
          categoryId=""
          selected={selected}
          onChange={setSelected}
          excludeIds={existingProductIds}
          disabled={busy}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={handleAdd} disabled={busy || selected.length === 0}>
            {busy && <Spinner size={16} />}
            Tambahkan {selected.length > 0 && `${selected.length} produk`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
