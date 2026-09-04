"use client";

import { useEffect, useRef, useState } from "react";

/** What the spec pins, and what useProductCandidates already uses. */
const DEBOUNCE_MS = 300;

/**
 * A list query whose `search` settles after typing stops, while every other
 * field applies on the tick it changed.
 *
 * THE ASYMMETRY IS THE POINT. Debouncing the whole object would make clicking a
 * dropdown feel broken for a third of a second. Debouncing nothing — which is
 * what every list screen did before this — sends one request per keystroke, so
 * typing "royal canin" asked the server eleven questions and threw ten answers
 * away.
 *
 * Feed the RESULT to the fetch effect and keep handing the ARGUMENT to the
 * toolbar, so the input stays instantly responsive while only the network waits:
 *
 *     const [query, setQueryState] = useState(DEFAULT_QUERY);
 *     const settled = useDebouncedQuery(query);
 *     useEffect(() => { …fetch using `settled`… }, [settled, nonce]);
 *     return { query, setQuery, … };   // the toolbar still gets the live one
 *
 * Any derived flag a toolbar shows WHILE typing — Batches disables its horizon
 * the moment the search box has content — should keep reading the live query.
 * Only the request waits.
 */
export function useDebouncedQuery<Q extends { search: string }>(
  query: Q,
  delay: number = DEBOUNCE_MS,
): Q {
  const [settled, setSettled] = useState(query);
  const previous = useRef(query);

  useEffect(() => {
    const before = previous.current;
    previous.current = query;

    // Only the text field earns a wait. A changed dropdown is a finished
    // decision, so it goes straight through — including when it changes in the
    // same tick as the search box, e.g. a Reset that clears several fields.
    if (query.search === before.search) {
      setSettled(query);
      return;
    }

    const timer = setTimeout(() => setSettled(query), delay);
    return () => clearTimeout(timer);
  }, [query, delay]);

  return settled;
}
