"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { membershipService } from "@/services/membership.service";
import type {
  BenefitCandidate,
  BenefitQuoteLine,
  BenefitQuoteResponse,
} from "@/types/membership";

/**
 * "For this cart, what could this customer be given?"
 *
 * ─── IT WRITES NOTHING AND COMMITS NOTHING ─────────────────────────────────
 *
 * The answer is an OFFER. Applying it is a separate act — the cashier ticks a
 * chip, which sends `{ membershipId, benefitId }` on the line and lets the
 * server price it again for real. This hook exists so the till can show what is
 * available without guessing at it, never so it can compute a discount.
 *
 * ─── IT RE-ASKS WHEN THE CART CHANGES, AND ONLY THEN ───────────────────────
 *
 * The request is keyed on a digest of the lines rather than on the array
 * itself: a cart object is rebuilt on every server round trip, so depending on
 * the reference would re-quote on every keystroke elsewhere on the screen. The
 * digest holds the four things that can change an answer — which animal, which
 * item, how much, and which line — and nothing else.
 *
 * ─── A FAILURE IS SILENT, ON PURPOSE ───────────────────────────────────────
 *
 * If the quote cannot be fetched the chips simply do not appear. Every other
 * part of the till goes on working, and the sale can still be rung up at full
 * price — which is the correct degradation for a feature that only ever REMOVES
 * money from a bill. An error banner over a working till would stop a queue for
 * something nobody can act on.
 */
export function useBenefitQuote({
  customerId,
  lines,
  enabled = true,
}: {
  customerId: string | null;
  lines: BenefitQuoteLine[];
  enabled?: boolean;
}) {
  const [quote, setQuote] = useState<BenefitQuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const digest = useMemo(
    () =>
      JSON.stringify(
        lines.map((line) => [line.ref, line.refId, line.petId, line.amount]),
      ),
    [lines],
  );

  const active = enabled && Boolean(customerId) && lines.length > 0;

  useEffect(() => {
    let live = true;

    /*
      THE INACTIVE CASE GOES THROUGH THE SAME GUARDED PATH as every other
      branch, rather than returning early above a `setState`. A synchronous
      state write in an effect body is a cascading render, and the lint rule is
      right to refuse it.
    */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(active);

    if (!active) {
      setQuote(null);
      return () => {
        live = false;
      };
    }

    membershipService
      .quote({ customerId: customerId ?? undefined, lines })
      .then((result) => {
        if (live) setQuote(result);
      })
      .catch(() => {
        // Silent — see the header.
        if (live) setQuote(null);
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
    // `digest` is the real dependency; `lines` would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, digest, active]);

  /**
   * The benefit offered for one line, by the `ref` the caller gave it.
   *
   * BY `ref`, NOT BY INDEX. A cart renumbers when a line is removed, and an
   * answer matched by position would land on the wrong row for exactly as long
   * as it took the next quote to come back — which is to say, long enough for
   * somebody to click it.
   */
  const offerFor = useCallback(
    (ref: string): BenefitCandidate | null =>
      quote?.lines.find((line) => line.ref === ref)?.recommended ?? null,
    [quote],
  );

  /** Every card this customer's animals hold — for the banner over the cart. */
  const cards = quote?.cards ?? [];

  return { quote, cards, offerFor, loading };
}
