"use client";

import { useCallback, useState } from "react";

import { stockOpnameService } from "@/services/stockOpname.service";
import { ApiError } from "@/services/api-error";
import type { OpnameSubmitPreview } from "@/types/inventory";

interface UseOpnamePreviewResult {
  preview: OpnameSubmitPreview | null;
  loading: boolean;
  error: string | null;
  /** Asks the server what submitting would post. Returns null on failure. */
  run: () => Promise<OpnameSubmitPreview | null>;
  clear: () => void;
}

/**
 * What submitting a count sheet WOULD post — asked of the server, never computed.
 *
 * The journal lines come back with their account CODES and NAMES resolved
 * against the tenant's own chart, and the movement rows come back with the FEFO
 * lots a shortage will actually be drawn from. A browser cannot know either: the
 * accounts differ per tenant, and which lots supply a withdrawal depends on
 * expiry dates it does not hold.
 *
 * THIS IS WHY THE OLD PROTOTYPE WAS WRONG. It hardcoded a surplus to "4901
 * Pendapatan Lain-lain"; the ledger books both directions to 5201 Inventory
 * Loss. That copy did not fail loudly when it disagreed with the server — it
 * rendered a confident wrong number that a user then approved.
 *
 * ON DEMAND, NOT DEBOUNCED, unlike useMovementPreview. That hook watches a form
 * where every keystroke changes the answer; a count sheet has hundreds of lines
 * and the question is only asked once, when somebody is about to accept the
 * whole thing. Previewing on every edit would be hundreds of requests to answer
 * a question nobody asked yet.
 */
export function useOpnamePreview(opnameId: string): UseOpnamePreviewResult {
  const [preview, setPreview] = useState<OpnameSubmitPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await stockOpnameService.preview(opnameId);
      setPreview(result);
      return result;
    } catch (err) {
      setPreview(null);
      // The preview refuses exactly what the submit refuses — a missing batch
      // code on found stock that expires, for instance — so `fullMessage` here
      // is the same refusal the user would otherwise have met after committing.
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Perkiraan gagal dimuat. Coba lagi.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [opnameId]);

  const clear = useCallback(() => {
    setPreview(null);
    setError(null);
  }, []);

  return { preview, loading, error, run, clear };
}
