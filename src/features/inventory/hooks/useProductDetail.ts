"use client";

import { useEffect, useState } from "react";

import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import type { Product } from "@/types/inventory";

interface ProductDetail {
  product: Product | null;
  /** A parent's variants; empty for every other type. */
  variants: Product[];
  /** A variant's parent; null for every other type. */
  parent: Product | null;
  loading: boolean;
  error: string | null;
}

/**
 * One product and the rest of its family — what the edit and detail screens need
 * before either can render a single field.
 *
 * Fetched rather than taken from the list, because both pages are reachable by
 * URL: a bookmark or a refresh arrives with an id and no list behind it.
 *
 * THE FAMILY COMES IN A SECOND REQUEST, and which one depends on the type:
 *
 *  - a PARENT fetches its variants. The form edits the FAMILY — it needs every
 *    existing row to pre-fill the combination table and to know which axis
 *    values are load-bearing — so there is no version of that screen that works
 *    without them, and the detail screen shows the same rows with their stock.
 *  - a VARIANT fetches its parent, purely for a NAME. `parentId` is an id, and
 *    "induk: 68f1a…" tells a reader nothing; the axes live on the parent too, so
 *    it is also what lets a variant's attributes be shown in axis order.
 *
 * Neither request is issued for a standalone or a bundle, which have no family.
 * A failure in the second request fails the whole hook: a parent whose variants
 * did not load is not a product screen with a gap in it, it is a screen that
 * would silently claim the family is empty.
 */
export function useProductDetail(productId?: string): ProductDetail {
  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Product[]>([]);
  const [parent, setParent] = useState<Product | null>(null);
  const [loading, setLoading] = useState(Boolean(productId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const found = await productService.getById(productId);
        if (!active) return;
        setProduct(found);

        if (found.productType === "parent") {
          const family = await productService.listVariants(productId);
          if (!active) return;
          setVariants(family.items);
        } else if (found.productType === "variant" && found.parentId) {
          const owner = await productService.getById(found.parentId);
          if (!active) return;
          setParent(owner);
        }
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Produk gagal dimuat.",
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [productId]);

  return { product, variants, parent, loading, error };
}
