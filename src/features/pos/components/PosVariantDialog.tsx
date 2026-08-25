"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { productService } from "@/services/product.service";
import { formatMoney } from "@/utils/decimal";
import type { PosCatalogItem } from "@/types/api";
import type { Product } from "@/types/inventory";

/**
 * Choosing which variant to ring up.
 *
 * A PARENT IS NOT SELLABLE and the grid says so by showing "N varian" where a
 * price would be. Tapping it opens this instead of adding anything — a parent
 * added to a basket is a line nobody can pick off a shelf.
 *
 * IT ASKS THE PRODUCTS ENDPOINT, not the till's catalogue, because the catalogue
 * flattens products and services into a grid of sellable tiles and deliberately
 * has no parent filter. `listVariants` is unpaginated, which is right here: a
 * parent with more variants than fit in a dialog is rare, and paging inside a
 * picker opened from a picker is worse than scrolling.
 *
 * NO STOCK BADGE. The variants come from the catalogue-independent endpoint,
 * which does not know the shift's warehouse — and a badge computed against the
 * wrong shelf is worse than none. The server refuses an empty line at payment,
 * which is where the answer is authoritative anyway.
 */
export function PosVariantDialog({
  parent,
  onPick,
  onOpenChange,
}: {
  parent: PosCatalogItem | null;
  onPick: (variant: PosCatalogItem) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [variants, setVariants] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentId = parent?._id ?? null;

  useEffect(() => {
    if (!parentId) return;

    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    productService
      .listVariants(parentId)
      .then((result) => {
        if (active) setVariants(result.items);
      })
      .catch(() => {
        if (active) setError("Varian gagal dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [parentId]);

  return (
    <Dialog open={parent !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pilih varian</DialogTitle>
          <DialogDescription>{parent?.name}</DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Spinner /> Memuat varian…
          </div>
        ) : variants.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            Produk ini belum punya varian yang bisa dijual.
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {variants.map((variant) => (
              <li
                key={variant._id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {variant.name}
                  </span>
                  {variant.sku && (
                    <span className="block truncate text-xs tabular-nums text-muted">
                      {variant.sku}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm tabular-nums text-foreground">
                    {formatMoney(variant.sellPrice)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      onPick({
                        kind: "product",
                        _id: variant._id,
                        name: variant.name,
                        code: variant.sku,
                        price: variant.sellPrice,
                        categoryId: variant.categoryId,
                        unit: variant.unit ?? null,
                        stock: null,
                        variantCount: null,
                      })
                    }
                  >
                    Tambah
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
