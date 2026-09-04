"use client";

import { useEffect, useState } from "react";

import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import type { Product } from "@/types/inventory";

interface BundleCandidates {
  products: Product[];
  loading: boolean;
  error: string | null;
}

/**
 * The products a bundle may be built from: standalone items and variants.
 *
 * TWO REQUESTS, not one, because `productType` takes a single value — and the
 * pair is still cheaper than the alternative, which is fetching parents and
 * bundles the picker would then have to throw away. The two types are exactly
 * the ones that hold stock, which is the rule that makes bundle nesting
 * impossible (see BundleComponentEditor).
 *
 * `enabled` exists so a standalone or a variant-family form pays nothing for a
 * picker it never renders. It fetches once, when the user switches into bundle
 * mode, and the result is kept if they switch away and back.
 *
 * Not paginated and not searched: a picker over a few hundred items is a
 * dropdown, and one over more than that needs a different control than this
 * component offers — at which point this hook grows a search parameter rather
 * than a page counter.
 */
export function useBundleCandidates(enabled: boolean): BundleCandidates {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded) return;

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    Promise.all([
      productService.list({ productType: "standalone", isActive: true, limit: 100 }),
      productService.list({ productType: "variant", isActive: true, limit: 100 }),
    ])
      .then(([standalone, variants]) => {
        if (!active) return;
        setProducts([...standalone.items, ...variants.items]);
        setLoaded(true);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Daftar produk untuk komponen gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled, loaded]);

  return { products, loading, error };
}
