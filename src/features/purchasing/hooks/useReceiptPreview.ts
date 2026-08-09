"use client";

import { useEffect, useState } from "react";

import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { ApiError } from "@/services/api-error";
import type {
  CreateGoodsReceiptInput,
  GoodsReceiptPreview,
} from "@/types/api";

/**
 * Long enough that typing "15000" is one request rather than five, short enough
 * that the panel feels like it belongs to the field being typed into.
 */
const DEBOUNCE_MS = 350;

interface UseReceiptPreviewResult {
  preview: GoodsReceiptPreview | null;
  loading: boolean;
  /** The API's own refusal — a supplier on the wrong terms, a missing batch code. */
  error: string | null;
}

/**
 * What a delivery would do, asked of the server on every meaningful edit.
 *
 * THE FRONTEND USED TO COMPUTE THIS. ReceiptForm ran its own sequential
 * weighted-average simulation across the lines, reimplemented from the service.
 * That is gone: the rule now has one implementation, and a preview cannot show a
 * confident wrong number when the server changes its mind. The endpoint runs the
 * same code the post runs, with the commit left off.
 *
 * IT IS ALSO THE ONLY MITIGATION FOR A DOUBLE SUBMIT. `POST /goods-receipts` is
 * not idempotent — a retried submit is indistinguishable from a second delivery
 * of the same goods — so seeing the outcome before committing is the difference
 * between one receipt and two.
 *
 * DEBOUNCED, because the trade is a request per keystroke. `input` is serialised
 * to key the effect, so a re-render that produces an identical payload — and
 * every form re-render produces a fresh object — does not re-fetch.
 *
 * `enabled` is the caller's gate, not a convenience: the endpoint refuses exactly
 * what the create refuses, so asking it about a half-typed line would paint the
 * panel red while the user is still working. The form enables it once the payload
 * is plausible; the server has the final word on whether it is valid.
 *
 * THE PREVIOUS ANSWER IS KEPT WHILE A NEW ONE IS IN FLIGHT. Clearing it would
 * make the panel flicker between every keystroke and the response, which reads as
 * instability rather than as work.
 */
export function useReceiptPreview(
  input: CreateGoodsReceiptInput,
  enabled: boolean,
): UseReceiptPreviewResult {
  const [preview, setPreview] = useState<GoodsReceiptPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = JSON.stringify(input);

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

      goodsReceiptService
        .preview(JSON.parse(key) as CreateGoodsReceiptInput)
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
  }, [key, enabled]);

  return { preview, loading, error };
}
