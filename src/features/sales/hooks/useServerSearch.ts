"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { customerService } from "@/services/customer.service";
import { productService } from "@/services/product.service";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";
import type { Customer } from "@/types/api";
import type { Product } from "@/types/inventory";

/** The API's page-size cap — the same one `useInvoiceLookups` asks for. */
const RESULT_LIMIT = 100;

/**
 * A picker over a register too long to load whole, searched ON THE SERVER.
 *
 * The invoice forms open on the first 100 rows `useInvoiceLookups` fetched, and
 * that is all an in-browser `.includes()` could ever find — a shop with 1.500
 * customers typed a name that is plainly in Pelanggan and was told there was no
 * such person (12 October 2026). Typing now asks the list endpoint's own
 * `search`, the same substring match its list screen uses.
 *
 * THE PICKED RECORD IS KEPT. Once the box is cleared the list falls back to the
 * opening 100, which may not include it — and the form still needs the record
 * (a customer's pin, a product's price) and the trigger still needs its name.
 *
 * `search` must be a stable reference — a module-level function, as below.
 */
export function useServerSearch<T extends { _id: string }>(
  initial: T[],
  search: (term: string) => Promise<T[]>,
) {
  const [query, setQuery] = useState({ search: "" });
  const settled = useDebouncedQuery(query);
  const [results, setResults] = useState<{
    term: string;
    items: T[];
    failed: boolean;
  } | null>(null);
  const [picked, setPicked] = useState<T | null>(null);

  useEffect(() => {
    const term = settled.search.trim();
    if (!term) return;

    let active = true;

    search(term)
      .then((items) => {
        if (active) setResults({ term, items, failed: false });
      })
      .catch(() => {
        if (active) setResults({ term, items: [], failed: true });
      });

    return () => {
      active = false;
    };
  }, [settled, search]);

  const term = query.search.trim();
  const answered = results !== null && results.term === term;

  /** What the picker lists right now: search results, or the opening rows. */
  const items = useMemo(() => {
    if (term) return answered ? results.items : [];
    if (picked && !initial.some((one) => one._id === picked._id)) {
      return [picked, ...initial];
    }
    return initial;
  }, [term, answered, results, initial, picked]);

  const find = useCallback(
    (id: string): T | null =>
      (id &&
        (initial.find((one) => one._id === id) ??
          (picked?._id === id ? picked : undefined) ??
          results?.items.find((one) => one._id === id))) ||
      null,
    [initial, picked, results],
  );

  /** Hold on to the chosen record — it may only exist in the search results. */
  const remember = useCallback(
    (id: string) => setPicked(id ? find(id) : null),
    [find],
  );

  const setSearch = useCallback((search: string) => setQuery({ search }), []);

  return {
    items,
    /** The live term — for a caller filtering rows of its own beside these. */
    term,
    /** Typed, and the server has not answered for this term yet. */
    searching: term !== "" && !answered,
    failed: term !== "" && answered && results.failed,
    setSearch,
    remember,
    find,
  };
}

/** Over name, email and phone. A customer switched off is not offerable. */
async function searchCustomers(term: string): Promise<Customer[]> {
  const result = await customerService.list({
    search: term,
    isActive: true,
    limit: RESULT_LIMIT,
  });
  return result.items;
}

/** Over name and SKU — the same filters `useInvoiceLookups` reads with. */
async function searchProducts(term: string): Promise<Product[]> {
  const result = await productService.list({
    search: term,
    isActive: true,
    limit: RESULT_LIMIT,
  });
  return result.items;
}

export function useCustomerSearch(initial: Customer[]) {
  return useServerSearch(initial, searchCustomers);
}

export function useProductSearch(initial: Product[]) {
  return useServerSearch(initial, searchProducts);
}
