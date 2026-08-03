"use client";

import { useEffect, useState } from "react";

import { stockMovementService } from "@/services/stockMovement.service";
import { ApiError } from "@/services/api-error";
import type {
  PreviewStockMovementInput,
  StockMovementPreview,
} from "@/types/inventory";

/**
 * Long enough that typing "12" is one request rather than two, short enough that
 * the panel feels like it belongs to the field being typed into.
 */
const DEBOUNCE_MS = 350;

interface UseMovementPreviewResult {
  preview: StockMovementPreview | null;
  loading: boolean;
  /** The API's own refusal — an inactive warehouse, a quantity it reads differently. */
  error: string | null;
}

/**
 * What a manual movement would do, asked of the server on every meaningful edit.
 *
 * THE FRONTEND USED TO COMPUTE THIS. FEFO allocation, the perpetual weighted
 * average and the journal's counter account all lived in
 * `features/inventory/utils/preview.ts`, reimplemented from the service. That
 * file is gone: the rules now have one implementation, and a preview cannot show
 * a confident wrong number when the server changes its mind.
 *
 * DEBOUNCED, because the trade is a request per keystroke. `input` is serialised
 * to key the effect, so a re-render that produces an identical payload — and
 * every form re-render produces a fresh object — does not re-fetch.
 *
 * `enabled` is the caller's gate, not a convenience: the endpoint refuses a
 * payload the create would refuse, so asking it about an empty quantity would
 * paint the panel red while the user is still typing the first digit. The form
 * enables it once the payload is plausible; the server has the final word on
 * whether it is valid.
 *
 * THE PREVIOUS ANSWER IS KEPT WHILE A NEW ONE IS IN FLIGHT. Clearing it would
 * make the panel flicker between every keystroke and the response, which reads
 * as instability rather than as work.
 */
export function useMovementPreview(
  input: PreviewStockMovementInput,
  enabled: boolean,
  /**
   * Bumped by the form after a successful post, to re-ask a question whose
   * answer has changed without the question changing — the lots and the average
   * the last preview described have just moved.
   */
  nonce = 0,
): UseMovementPreviewResult {
  const [preview, setPreview] = useState<StockMovementPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = JSON.stringify(input);
  const cacheKey = `${key}#${nonce}`;

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      setError(null);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);

      stockMovementService
        .preview(JSON.parse(key) as PreviewStockMovementInput)
        .then((result) => {
          if (!active) return;
          setPreview(result);
        })
        .catch((err) => {
          if (!active) return;
          setPreview(null);
          setError(
            err instanceof ApiError
              ? err.fullMessage
              : "Perkiraan gagal dimuat.",
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
    // `key` is read inside via JSON.parse — the effect depends on the string, so
    // an identical payload rebuilt on every render does not re-fetch.
  }, [cacheKey, key, enabled]);

  return { preview, loading, error };
}
