"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { membershipService } from "@/services/membership.service";
import type {
  BenefitCandidate,
  BenefitQuoteLine,
  BenefitQuotePackage,
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
  packages = [],
  at = null,
  enabled = true,
}: {
  customerId: string | null;
  lines: BenefitQuoteLine[];
  /**
   * PACKAGES ON THE SAME BILL, not paid yet (19 November 2026) — quoted as
   * virtual cards, so their benefits can be offered before the card exists.
   */
  packages?: BenefitQuotePackage[];
  /** The instant quotas are judged at — the invoice date; null = now. */
  at?: string | null;
  enabled?: boolean;
}) {
  const [quote, setQuote] = useState<BenefitQuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  /** The request the current `quote` answers — see `settled` below. */
  const [answered, setAnswered] = useState<string | null>(null);

  const digest = useMemo(
    () =>
      /*
        THE WHOLE LINE (20 November 2026). The faktur now sends kind, qty, the
        row's pick and "Tanpa potongan" like the till — each changes the answer,
        so each has to re-ask.
      */
      JSON.stringify([
        customerId,
        lines,
        packages.map((pkg) => [pkg.ref, pkg.planId, pkg.petId, pkg.startDate]),
        at,
      ]),
    [customerId, lines, packages, at],
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
      setAnswered(digest);
      return () => {
        live = false;
      };
    }

    membershipService
      .quote({
        customerId: customerId ?? undefined,
        lines,
        ...(packages.length > 0 ? { packages } : {}),
        ...(at ? { at } : {}),
      })
      .then((result) => {
        if (live) {
          setQuote(result);
          setAnswered(digest);
        }
      })
      .catch(() => {
        // Silent — see the header.
        if (live) {
          setQuote(null);
          setAnswered(digest);
        }
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

  /**
   * THE ANSWER IS FOR THE LINES ON SCREEN NOW (20 November 2026). `quote`
   * keeps the last answer while the next is in flight — fine for display,
   * wrong for anything that WRITES from it (the faktur's auto-apply would put
   * the old animal's card on a row whose animal just changed).
   */
  const settled = !active ? true : answered === digest;

  return { quote, cards, offerFor, loading, settled };
}
