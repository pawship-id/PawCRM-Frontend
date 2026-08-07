"use client";

import { useCallback, useState } from "react";

import { purchaseReturnService } from "@/services/purchaseReturn.service";
import { ApiError } from "@/services/api-error";
import type { PurchaseReturnPreview } from "@/types/api";

interface UseReturnPreviewResult {
  preview: PurchaseReturnPreview | null;
  loading: boolean;
  error: string | null;
  /** True when the API refused for lack of `purchaseReturns:submit`. */
  forbidden: boolean;
  /** Asks the server what submitting would post. Returns null on failure. */
  run: () => Promise<PurchaseReturnPreview | null>;
  clear: () => void;
}

/**
 * What submitting a return WOULD post — asked of the server, never computed.
 *
 * WORTH ASKING MORE THAN ALMOST ANYWHERE ELSE IN THE SYSTEM, because the submit
 * cannot be undone and it moves two things at once: the stock leaves, and the
 * weighted-average cost every future sale of the SURVIVING stock is costed at
 * moves with it. `hppAvg` comes back with the before, the after and the working.
 *
 * THE PROTOTYPE COMPUTED THIS IN THE BROWSER, and that is exactly the failure
 * mode this hook exists to remove. A local simulation does not fail loudly when
 * it disagrees with the server — it renders a confident wrong number that a user
 * then approves, and here the number being approved is the cost basis of
 * everything still on the shelf.
 *
 * ON DEMAND, NOT DEBOUNCED, matching useOpnamePreview: the question is asked once,
 * when somebody is about to accept the whole thing.
 *
 * `forbidden` IS SEPARATED FROM `error` ON PURPOSE. The endpoint is gated on
 * `purchaseReturns:submit` rather than `read`, so a storekeeper holding
 * create/read/update — the seeded Staff role — gets a 403 here while everything
 * else on their screen works. That is not an error to paint red across a working
 * page; it is a panel they simply do not get, and the caller renders it as such.
 */
export function useReturnPreview(returnId: string): UseReturnPreviewResult {
  const [preview, setPreview] = useState<PurchaseReturnPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const result = await purchaseReturnService.preview(returnId);
      setPreview(result);
      return result;
    } catch (err) {
      setPreview(null);

      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
        return null;
      }

      // The preview refuses exactly what the submit refuses — an over-claimed
      // line, goods sold since the delivery arrived, an inactive warehouse — so
      // `fullMessage` here is the same refusal the user would otherwise have met
      // after committing.
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Perkiraan gagal dimuat. Coba lagi.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [returnId]);

  const clear = useCallback(() => {
    setPreview(null);
    setError(null);
    setForbidden(false);
  }, []);

  return { preview, loading, error, forbidden, run, clear };
}
