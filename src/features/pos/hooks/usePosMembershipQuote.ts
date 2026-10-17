"use client";

import { useEffect, useMemo, useState } from "react";

import { membershipService } from "@/services/membership.service";
import type { PosTransaction } from "@/types/api";
import type { BenefitQuoteResponse } from "@/types/membership";

import { buildQuoteInput } from "../membershipCart";

/**
 * The member quote for the basket on screen (contract §4, §6.3).
 *
 * ─── AN ANSWER IS ONLY READ AGAINST THE BASKET IT ANSWERS ──────────────────
 *
 * The quote's `ref` is a line's index, and a basket renumbers when a line goes.
 * So the answer is stored with the digest of the request it answers, and
 * `quote` is null whenever that digest is not the current basket's — a stale
 * answer can never auto-apply onto the wrong row.
 *
 * ─── A FAILURE IS SILENT ───────────────────────────────────────────────────
 *
 * No quote, no picks: the sale still rings up at full price, which is the
 * right way for a feature that only ever takes money OFF a bill to fail.
 *
 * Its own hook rather than `useBenefitQuote` (memberships): the till sends
 * packages, picks and "Tanpa member", and the invoice form does not.
 */
export function usePosMembershipQuote(
  cart: PosTransaction | null,
  noBenefitKeys: ReadonlySet<string>,
) {
  const input = useMemo(
    () => buildQuoteInput(cart, noBenefitKeys),
    [cart, noBenefitKeys],
  );
  const digest = useMemo(() => (input ? JSON.stringify(input) : ""), [input]);

  const [answer, setAnswer] = useState<{
    digest: string;
    quote: BenefitQuoteResponse | null;
  }>({ digest: "", quote: null });

  useEffect(() => {
    if (!digest) return;

    let live = true;

    membershipService
      .quote(JSON.parse(digest))
      .then((result) => {
        if (live) setAnswer({ digest, quote: result ?? null });
      })
      .catch(() => {
        if (live) setAnswer({ digest, quote: null });
      });

    return () => {
      live = false;
    };
  }, [digest]);

  const current = digest !== "" && answer.digest === digest;

  return {
    /** The answer for THIS basket, or null (none yet, failed, or stale). */
    quote: current ? answer.quote : null,
    /** The digest the answer belongs to — "" when there is nothing to ask. */
    digest: current ? digest : "",
  };
}
