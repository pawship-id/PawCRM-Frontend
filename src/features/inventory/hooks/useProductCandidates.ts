"use client";

import { useEffect, useState } from "react";

import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import type { Product } from "@/types/inventory";

/** One screenful of candidates. Past this the answer is a search, not a page. */
const PAGE_LIMIT = 50;

/** Long enough that typing a SKU is one request, short enough to feel live. */
const DEBOUNCE_MS = 300;

/**
 * How long an answer is shown WITHOUT asking again. Past it the cached list is
 * still shown at once, and refreshed behind it.
 *
 * Short on purpose: the list carries `stockByWarehouse`, which the transfer
 * form reads as "tersedia", and a shelf can change between two documents. The
 * prefetch a form fires as it opens is what makes the dialog instant; this only
 * stops a dialog opened seconds later from asking the same question twice.
 */
const FRESH_MS = 10 * 1000;

/** Older answers are dropped rather than shown, however they were reached. */
const KEEP_MS = 5 * 60 * 1000;

export interface ProductCandidates {
  products: Product[];
  /** How many products match, which is usually more than `products` carries. */
  total: number;
  /** True when the match list was cut at PAGE_LIMIT — the picker says so. */
  truncated: boolean;
  /**
   * A request is out. `products` may still be the PREVIOUS answer — the picker
   * keeps it on screen rather than blanking the list on every keystroke.
   */
  loading: boolean;
  error: string | null;
}

/** Everything a picker narrows by — the cache key and the prefetch's input. */
export interface ProductCandidateFilters {
  search?: string;
  categoryId?: string;
  neverMovedInWarehouse?: string;
  inStockAtWarehouse?: string;
  isConsignment?: boolean;
  searchBatches?: boolean;
}

interface Entry {
  products: Product[];
  total: number;
  at: number;
}

/*
  THE CACHE IS MODULE STATE, shared by every picker and every prefetch. That is
  the point: the form fetches as it opens, and the dialog — mounted later, on
  click — finds the answer already here and draws it without a spinner. The
  stock pickers that share a filter set (opname, adjustment and the invoice all
  ask for "every stocked product") share one entry.
*/
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();

function normalise(filters: ProductCandidateFilters) {
  return {
    search: (filters.search ?? "").trim(),
    categoryId: filters.categoryId ?? "",
    neverMovedInWarehouse: filters.neverMovedInWarehouse ?? "",
    inStockAtWarehouse: filters.inStockAtWarehouse ?? "",
    isConsignment: filters.isConsignment,
    searchBatches: filters.searchBatches === true,
  };
}

function keyOf(filters: ReturnType<typeof normalise>): string {
  return JSON.stringify([
    filters.search.toLowerCase(),
    filters.categoryId,
    filters.neverMovedInWarehouse,
    filters.inStockAtWarehouse,
    filters.isConsignment ?? null,
    filters.searchBatches,
  ]);
}

function readCache(key: string): Entry | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > KEEP_MS) {
    cache.delete(key);
    return null;
  }
  return hit;
}

/**
 * One request per key at a time: a dialog opened while the form's prefetch is
 * still out waits for that answer instead of asking again.
 */
function fetchCandidates(
  filters: ReturnType<typeof normalise>,
  key: string,
): Promise<Entry> {
  const pending = inflight.get(key);
  if (pending) return pending;

  const request = productService
    .list({
      holdsStock: true,
      isActive: true,
      search: filters.search || undefined,
      categoryId: filters.categoryId || undefined,
      neverMovedInWarehouse: filters.neverMovedInWarehouse || undefined,
      inStockAtWarehouse: filters.inStockAtWarehouse || undefined,
      // Passed straight through: `false` is a filter, and `|| undefined`
      // here would drop exactly the case the receipt picker needs most.
      isConsignment: filters.isConsignment,
      searchBatches: filters.searchBatches || undefined,
      view: "picker",
      limit: PAGE_LIMIT,
    })
    .then((result) => {
      const entry = {
        products: result.items,
        total: result.pagination.total,
        at: Date.now(),
      };
      cache.set(key, entry);
      return entry;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

/**
 * Fetches a picker's opening list BEFORE its dialog exists, so the dialog
 * draws it the moment it opens. Called by every form with a "+ Tambah produk"
 * button, as the form mounts and whenever the filter it will open with changes
 * (the source warehouse of a transfer, say).
 *
 * ALWAYS ASKS, unless the same question is already out: a form opening is
 * exactly when the shelf may have changed since the last document. Failures are
 * swallowed — the dialog asks again on its own and shows the error there.
 */
export function prefetchProductCandidates(filters: ProductCandidateFilters) {
  const normalised = normalise(filters);
  fetchCandidates(normalised, keyOf(normalised)).catch(() => {});
}

/** Forgets every cached answer. Tests call it between cases. */
export function clearProductCandidatesCache() {
  cache.clear();
  inflight.clear();
}

/**
 * The products a stock DOCUMENT may be built over — a count sheet, a transfer —
 * behind ProductMultiPicker.
 *
 * SEARCHED ON THE SERVER, NOT FILTERED IN THE BROWSER. A picker that loaded the
 * whole catalogue to filter it locally is fine at fifty products and a hang at
 * five thousand — and a tenant with five thousand is exactly the one who never
 * wants the whole warehouse on one sheet.
 *
 * CACHED, AND SHOWN BEFORE IT IS REFRESHED. An answer this session already has
 * is drawn at once — the prefetch a form fires as it opens, or a search typed
 * before — and asked again behind it only once it is older than FRESH_MS. The
 * debounce applies to typing alone: an empty search box is not something
 * anybody is still in the middle of typing.
 *
 * `holdsStock=true` IS THE SERVER'S OWN LIST of the types stock may be posted
 * against. A `parent` is an abstraction over its variants and a `bundle`
 * consumes its components; the API refuses a line against either, so offering
 * them would be an invitation to a 400 after the user had chosen. Same flag, and
 * the same reasoning, as useStockCardLookups.
 *
 * ACTIVE PRODUCTS ONLY, unlike the stock card's lookup. That one feeds a READ,
 * where a deactivated product still owns its history; this one feeds a WRITE
 * somebody has to walk a shelf for, and a discontinued line is not on that
 * shelf. The whole-warehouse count the server builds applies the same rule.
 */
export function useProductCandidates(
  search: string,
  /** Narrows the list. "" is every category. */
  categoryId = "",
  /**
   * Only products with NO movement in this warehouse — the opening-stock
   * picker's rule, resolved by the server against the ledger.
   *
   * A WAREHOUSE ID RATHER THAN A FLAG, because "never moved" is only meaningful
   * somewhere: a product trading in one warehouse may legitimately be receiving
   * its opening balance in another, which is how a tenant that opens with two
   * locations fills both. "" leaves the list unfiltered, which is what every
   * other caller wants.
   */
  neverMovedInWarehouse = "",
  /**
   * Only products this warehouse HOLDS — the transfer picker's rule, resolved
   * by the server against the balances.
   *
   * The near-mirror of the filter above, and asked the same way and for the
   * same reason: a transfer draws goods off ONE shelf, so a product with
   * nothing on it can only ever produce a line the save refuses. "" leaves the
   * list unfiltered, which is what every other caller wants.
   */
  inStockAtWarehouse = "",
  /**
   * Only consignment goods (`true`) or only owned ones (`false`) — the receipt
   * picker's rule, resolved by the SERVER against `products.isConsignment`.
   *
   * A BOOLEAN WITH `undefined` AS THE UNFILTERED CASE, not `""` like the two
   * warehouse ids above. Those are ids, where empty is a natural "none given";
   * here `false` is a REAL filter meaning "not consignment", so it cannot share
   * a sentinel with "no filter" — a truthiness test would silently turn the
   * *Beli putus* picker back into the whole catalogue.
   *
   * Server-side for the reason the whole hook is: the list comes back capped at
   * PAGE_LIMIT, so filtering the returned page in the browser would drop
   * matches that never left the server and leave `total` counting rows the user
   * cannot see.
   */
  isConsignment: boolean | undefined = undefined,
  /**
   * Also match `search` against the codes of lots — ours and the supplier's —
   * so a label or a carton number finds its product. Asked of the SERVER for the
   * reason the whole hook is: the codes live on the batches, not the products.
   */
  searchBatches = false,
): ProductCandidates {
  const filters = normalise({
    search,
    categoryId,
    neverMovedInWarehouse,
    inStockAtWarehouse,
    isConsignment,
    searchBatches,
  });
  const key = keyOf(filters);

  /*
    WHAT IS SHOWN IS WORKED OUT DURING RENDER, not copied into state by the
    effect: the answer this key last fetched, else the cached one, else the
    previous key's list while this one loads. Reading the cache here is what
    lets a prefetched dialog paint its list in the very frame it opens — no
    spinner, not even for one tick.
  */
  const [result, setResult] = useState<{
    key: string;
    products: Product[];
    total: number;
    error: string | null;
  } | null>(null);

  const hit = readCache(key);
  const settled = result?.key === key ? result : null;
  const shown = settled ?? hit ?? result ?? { products: [], total: 0 };
  const loading = !settled && !hit;
  const error = settled?.error ?? null;

  useEffect(() => {
    let active = true;
    const cached = readCache(key);

    if (cached && Date.now() - cached.at < FRESH_MS) return;

    const run = () => {
      fetchCandidates(filters, key)
        .then((entry) => {
          if (active) setResult({ key, ...entry, error: null });
        })
        .catch((err) => {
          if (!active) return;
          // A failed REFRESH keeps the list it was refreshing; only a search
          // with nothing to show says so.
          setResult(
            cached
              ? { key, ...cached, error: null }
              : {
                  key,
                  products: [],
                  total: 0,
                  error:
                    err instanceof ApiError
                      ? err.message
                      : "Daftar produk gagal dimuat.",
                },
          );
        });
    };

    // Debounced like useMovementPreview, but only while somebody is typing:
    // the effect re-runs on every keystroke, and only the last one in a burst
    // reaches the API. A cached answer or an empty box has nothing to wait for.
    if (cached || filters.search === "") {
      run();
      return () => {
        active = false;
      };
    }

    const timer = setTimeout(run, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // `key` is `filters`, serialised: listing the object would re-run every
    // render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    products: shown.products,
    total: shown.total,
    truncated: shown.total > shown.products.length,
    loading,
    error,
  };
}
