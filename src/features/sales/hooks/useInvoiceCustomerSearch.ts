"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { customerService } from "@/services/customer.service";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";
import type { Customer } from "@/types/api";

/** The API's page-size cap — the same one `useInvoiceLookups` asks for. */
const RESULT_LIMIT = 100;

/**
 * The invoice form's customer picker, searched ON THE SERVER.
 *
 * The form opens on the first 100 customers `useInvoiceLookups` fetched, and
 * that is all an in-browser `.includes()` could ever find — a shop with 1.500
 * customers typed a name that is plainly in Pelanggan and was told there was no
 * such person (12 October 2026). Typing now asks `GET /customers?search=`, the
 * same substring match over name, email and phone the Pelanggan list uses.
 *
 * THE PICKED CUSTOMER IS KEPT. Once the box is cleared the list falls back to
 * the first 100, which may not include them — and the form still needs their
 * record (the pin a ride is priced from) and the trigger still needs their name.
 */
export function useInvoiceCustomerSearch(initial: Customer[]) {
  const [query, setQuery] = useState({ search: "" });
  const settled = useDebouncedQuery(query);
  const [results, setResults] = useState<{
    term: string;
    items: Customer[];
    failed: boolean;
  } | null>(null);
  const [picked, setPicked] = useState<Customer | null>(null);

  useEffect(() => {
    const term = settled.search.trim();
    if (!term) return;

    let active = true;

    customerService
      // A customer switched off is not offerable here either — see
      // `useInvoiceLookups`.
      .list({ search: term, isActive: true, limit: RESULT_LIMIT })
      .then((result) => {
        if (active) setResults({ term, items: result.items, failed: false });
      })
      .catch(() => {
        if (active) setResults({ term, items: [], failed: true });
      });

    return () => {
      active = false;
    };
  }, [settled]);

  const term = query.search.trim();
  const answered = results !== null && results.term === term;

  /** What the picker lists right now: search results, or the opening 100. */
  const customers = useMemo(() => {
    if (term) return answered ? results.items : [];
    if (picked && !initial.some((one) => one._id === picked._id)) {
      return [picked, ...initial];
    }
    return initial;
  }, [term, answered, results, initial, picked]);

  const find = useCallback(
    (id: string) =>
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
    customers,
    /** Typed, and the server has not answered for this term yet. */
    searching: term !== "" && !answered,
    failed: term !== "" && answered && results.failed,
    setSearch,
    remember,
    find,
  };
}
