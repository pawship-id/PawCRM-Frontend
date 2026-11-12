"use client";

import { useEffect, useMemo, useState } from "react";

import { promoService } from "@/services/promo.service";
import type { PromoQuoteInput, PromoQuoteResponse } from "@/types/promo";

/**
 * PROMO V1 — the promo quote for whatever a screen is selling (kasir, booking,
 * faktur). `POST /promos/quote`, debounced.
 *
 * The answer is kept with the digest of the request it answers and `quote` is
 * null whenever that is not the current request — the same rule as
 * `usePosMembershipQuote`: refs are line indexes or row keys, and a stale
 * answer must never be read against a basket that has moved on.
 *
 * A FAILURE IS SILENT: no quote, no promo shown. The server still prices the
 * sale itself, so nothing is charged wrongly — only the preview is quieter.
 *
 * `null` input asks nothing (offline, nothing to quote, waiting on another
 * quote first).
 */
export function usePromoQuote(input: PromoQuoteInput | null, delayMs = 300) {
  const digest = useMemo(() => (input ? JSON.stringify(input) : ""), [input]);

  const [answer, setAnswer] = useState<{
    digest: string;
    quote: PromoQuoteResponse | null;
  }>({ digest: "", quote: null });

  useEffect(() => {
    if (!digest) return;

    let live = true;
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() => promoService.quote(JSON.parse(digest) as PromoQuoteInput))
        .then((result) => {
          if (live) setAnswer({ digest, quote: result ?? null });
        })
        .catch(() => {
          if (live) setAnswer({ digest, quote: null });
        });
    }, delayMs);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [digest, delayMs]);

  const current = digest !== "" && answer.digest === digest;

  return {
    /** The answer for THIS request, or null (none yet, failed, or stale). */
    quote: current ? answer.quote : null,
    /** The digest the answer belongs to — "" while none is current. */
    digest: current ? digest : "",
  };
}
