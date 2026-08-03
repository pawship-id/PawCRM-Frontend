"use client";

import { useEffect, useState } from "react";

import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import type { Product } from "@/types/inventory";

interface ProductDetail {
  product: Product | null;
  /** A parent's variants; empty for every other type. */
  variants: Product[];
  loading: boolean;
  error: string | null;
}

/**
 * One product and, when it is a parent, its variants — what the edit screen
 * needs before it can render a single field.
 *
 * Fetched rather than taken from the list, because the edit page is reachable by
 * URL: a bookmark or a refresh arrives with an id and no list behind it.
 *
 * The variants come in a second request, and only for a parent. The form edits
 * the FAMILY — it needs every existing row to pre-fill the combination table and
 * to know which axis values are load-bearing — so there is no version of this
 * screen that works without them.
 */
export function useProductDetail(productId?: string): ProductDetail {
  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Product[]>([]);
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

  return { product, variants, loading, error };
}
