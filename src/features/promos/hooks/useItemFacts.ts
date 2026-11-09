"use client";

import { useEffect, useState } from "react";

import { serviceVariantPrices } from "@/features/memberships/variantKey";
import { productService } from "@/services/product.service";
import { serviceService } from "@/services/service.service";

import type { ItemFacts } from "../promoDraft";

/** `product:<id>` / `service:<id>` — one cache slot per catalogue item. */
export const factsKey = (item: { targetType: string; refId: string }) => `${item.targetType}:${item.refId}`;

/** "2 kg · Ayam" from a variant's attributes, falling back to its name. */
function variantLabel(variant: { name: string; variantAttributes: Record<string, string> | null }) {
  const values = Object.values(variant.variantAttributes ?? {}).filter(Boolean);
  return values.length ? values.join(" · ") : variant.name;
}

async function loadFacts(item: { targetType: string; refId: string }): Promise<ItemFacts> {
  if (item.targetType === "service") {
    const service = await serviceService.getById(item.refId);
    if (!service.hasVariants) return { normalPrice: service.price ?? null, variants: [] };
    return {
      normalPrice: null,
      variants: serviceVariantPrices(service).map((row) => ({
        id: row.variantKey,
        label: null,
        normalPrice: row.price,
      })),
    };
  }

  const product = await productService.getById(item.refId);
  if (product.productType !== "parent") return { normalPrice: product.sellPrice, variants: [] };
  const { items } = await productService.listVariants(item.refId);
  return {
    normalPrice: null,
    variants: items
      .filter((variant) => variant.isActive !== false && !variant.deletedAt)
      .map((variant) => ({ id: variant._id, label: variantLabel(variant), normalPrice: variant.sellPrice })),
  };
}

/**
 * The catalogue facts (normal price, variants) of every item on the form,
 * read ONCE per item and kept while the form is open. Not saved with the promo:
 * the server always prices from the catalogue, so the form only needs them to
 * draw the variant table and the preview.
 *
 * FAILS SOFT per item — a missing fact leaves "—" for the normal price, and the
 * promo can still be saved.
 */
export function useItemFacts(items: { targetType: string; refId: string }[]) {
  const [facts, setFacts] = useState<Map<string, ItemFacts | "loading" | "failed">>(() => new Map());

  const wanted = items.map(factsKey).filter((key) => !facts.has(key));
  const wantedKey = [...new Set(wanted)].join(",");

  useEffect(() => {
    if (!wantedKey) return;
    const keys = wantedKey.split(",");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFacts((current) => {
      const next = new Map(current);
      for (const key of keys) next.set(key, "loading");
      return next;
    });
    for (const key of keys) {
      const [targetType, refId] = key.split(":");
      loadFacts({ targetType, refId })
        .then((result) => setFacts((current) => new Map(current).set(key, result)))
        .catch(() => setFacts((current) => new Map(current).set(key, "failed")));
    }
  }, [wantedKey]);

  return (item: { targetType: string; refId: string }): ItemFacts | null => {
    const fact = facts.get(factsKey(item));
    return fact && fact !== "loading" && fact !== "failed" ? fact : null;
  };
}
