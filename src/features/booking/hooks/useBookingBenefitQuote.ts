"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { membershipService } from "@/services/membership.service";
import type { BenefitQuoteResponse, BookingBenefitQuoteInput } from "@/types/membership";

/** How long the form settles before asking — a time typed digit by digit is one question. */
const SETTLE_MS = 250;

/**
 * Asks once; a failure, or a mocked service answering nothing, is `null`.
 *
 * A FAILURE IS SILENT, ON PURPOSE — the same call `useBenefitQuote` makes for
 * the till: the feature only ever takes money OFF, so without it the booking is
 * simply saved at the normal price and the field does not appear.
 */
export async function fetchBookingQuote(
  input: BookingBenefitQuoteInput,
): Promise<BenefitQuoteResponse | null> {
  try {
    const result = await membershipService.quoteBooking(input);
    return result && Array.isArray(result.lines) ? result : null;
  } catch {
    return null;
  }
}

/**
 * THE BOOKING FORM'S MEMBERSHIP QUOTE (membership-v1 §4.4) — one request for
 * every card, re-asked whenever what it depends on changes: the date, the
 * animals, the services and their prices, the visit fee, the picks.
 *
 * ─── AN ANSWER ONLY COUNTS FOR THE QUESTION IT ANSWERED ───────────────────
 *
 * The result is kept with the request it was for. `quote` is the LAST answer,
 * kept on screen while the next one is on its way — a radio that vanished for a
 * quarter of a second on every click would be unusable — but `pending` says it
 * is no longer this form's question, and the save calls `latest()`, which asks
 * again rather than saving a jatah from last Tuesday's period under this
 * Thursday's booking.
 */
export function useBookingBenefitQuote(input: BookingBenefitQuoteInput | null) {
  const key = useMemo(() => (input ? JSON.stringify(input) : null), [input]);
  /* Bumped to ask again with the same input — after a refusal on save. */
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    nonce: number;
    quote: BenefitQuoteResponse | null;
  } | null>(null);

  useEffect(() => {
    if (!key) return;

    let active = true;
    const timer = setTimeout(() => {
      void fetchBookingQuote(JSON.parse(key) as BookingBenefitQuoteInput).then((quote) => {
        if (active) setResult({ key, nonce, quote });
      });
    }, SETTLE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, nonce]);

  const current = key !== null && result?.key === key && result.nonce === nonce;

  const latest = useCallback(async () => {
    if (!key) return null;
    if (current) return result?.quote ?? null;
    return fetchBookingQuote(JSON.parse(key) as BookingBenefitQuoteInput);
  }, [key, current, result]);

  return {
    quote: key !== null ? (result?.quote ?? null) : null,
    pending: key !== null && !current,
    latest,
    refresh: useCallback(() => setNonce((n) => n + 1), []),
  };
}
