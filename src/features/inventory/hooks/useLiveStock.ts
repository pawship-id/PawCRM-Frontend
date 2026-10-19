"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { productService } from "@/services/product.service";
import type { ProductStockRow } from "@/types/inventory";

/** The server's cap per request — GET /products/stock takes at most 100 ids. */
const CHUNK = 100;

/**
 * The least time between two refreshes triggered by somebody coming back to the
 * tab. Switching tabs fires both `focus` and `visibilitychange`, and somebody
 * flicking between windows fires them every few seconds; one answer per
 * quarter-minute is plenty for a number a save re-checks anyway.
 */
export const RETURN_REFRESH_MS = 15 * 1000;

/** Splits ids into requests the server will accept. */
export function chunked(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(ids.slice(i, i + CHUNK));
  return out;
}

/**
 * Runs `refresh` when somebody comes back to this tab — at most once per
 * `minIntervalMs`, and never while the tab is hidden.
 *
 * WHY "COMING BACK" IS THE TRIGGER, and not a timer: a form left open is the
 * case where its numbers go stale, and the moment somebody returns to it is the
 * moment they are about to read them again. A timer would ask every few seconds
 * of a lunch break for numbers nobody is looking at.
 */
export function useRefreshOnReturn(
  refresh: () => void,
  minIntervalMs = RETURN_REFRESH_MS,
) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    let last = Date.now();

    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < minIntervalMs) return;
      last = Date.now();
      latest.current();
    };

    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [minIntervalMs]);
}

/**
 * CURRENT on-hand rows for the products an open document carries — what its
 * "Tersedia" / "Stok" notes read instead of the figure each product brought
 * with it when it was picked.
 *
 * ASKED TWICE, AND NEVER PER ROW:
 *   - when products JOIN the form — only those, in one request (fifty added from
 *     the picker at once is still one request);
 *   - when somebody COMES BACK to the tab — every line, in one request.
 * Typing a quantity asks nothing.
 *
 * `rowsOf` is undefined until a product's answer arrives, so a caller falls
 * back to what the product came with — the note is never blank while it loads.
 * A failed read is silent for the same reason: the save re-checks the shelf on
 * the server whatever this says.
 */
export function useLiveStock(productIds: string[]) {
  const [rows, setRows] = useState<Map<string, ProductStockRow[]>>(
    () => new Map(),
  );
  const asked = useRef(new Set<string>());

  /* A STABLE KEY for the set of ids, so a keystroke in a quantity box — which
     rebuilds the array — is not a new set of products. */
  const key = [...new Set(productIds.filter(Boolean))].sort().join(",");
  const current = useRef<string[]>([]);
  useEffect(() => {
    current.current = key ? key.split(",") : [];
  }, [key]);

  const load = useCallback((ids: string[]) => {
    Promise.all(
      chunked(ids).map((chunk) =>
        productService
          .stock(chunk)
          .then((result) => result.items)
          .catch(() => []),
      ),
    ).then((results) => {
      const items = results.flat();
      if (items.length === 0) return;
      setRows((before) => {
        const next = new Map(before);
        items.forEach((item) => next.set(item.productId, item.stockByWarehouse));
        return next;
      });
    });
  }, []);

  useEffect(() => {
    const missing = (key ? key.split(",") : []).filter(
      (id) => !asked.current.has(id),
    );
    if (missing.length === 0) return;
    missing.forEach((id) => asked.current.add(id));
    load(missing);
  }, [key, load]);

  useRefreshOnReturn(() => {
    if (current.current.length > 0) load(current.current);
  });

  const rowsOf = useCallback(
    (productId: string): ProductStockRow[] | undefined => rows.get(productId),
    [rows],
  );

  return { rowsOf };
}
