"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { productService } from "@/services/product.service";

interface UseBarcodeCheckResult {
  /** The product already holding this barcode, or null. */
  takenBy: { _id: string; sku: string | null; name: string } | null;
  checking: boolean;
}

/**
 * Warns while the barcode is being TYPED, rather than after the form is
 * submitted — PCR-018's "warning duplicate barcode saat input".
 *
 * THE DATA WAS NEVER AT RISK. The API enforces a partial unique index on
 * `{ tenantId, barcode }` and answers a duplicate with a 409, so a clash has
 * always been refused. What was missing is WHEN the user learns: after filling
 * in a whole product and pressing save, at which point the fix is to go and find
 * which existing product owns the code.
 *
 * ADVISORY, NEVER A GATE. This does not disable the save button, and it must not
 * — the check races anything another user does in the same second, and the
 * server is the authority either way. It answers "you are about to collide with
 * this product" while there is still time to look.
 *
 * DEBOUNCED at 500ms because a barcode is usually SCANNED, arriving as a burst
 * of keystrokes ending in a newline. Firing per character would be a dozen
 * requests for one scan; waiting for a pause turns it into one.
 *
 * A 404 IS THE GOOD ANSWER here — the endpoint reports "no product has this
 * barcode" by not finding one, so the miss is the success case and only an
 * unexpected failure is silence.
 */
export function useBarcodeCheck(
  barcode: string,
  /**
   * The product being edited, so it does not report itself as a duplicate.
   * Undefined while creating.
   */
  excludeProductId?: string,
): UseBarcodeCheckResult {
  const [takenBy, setTakenBy] =
    useState<UseBarcodeCheckResult["takenBy"]>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const trimmed = barcode.trim();

    if (trimmed === "") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTakenBy(null);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setChecking(true);

      productService
        .getByBarcode(trimmed)
        .then((product) => {
          if (!active) return;
          /**
           * Editing the product that already owns this code is not a clash. Left
           * out and the edit form would warn about every save that did not touch
           * the barcode at all.
           */
          setTakenBy(
            product._id === excludeProductId
              ? null
              : {
                  _id: product._id,
                  sku: product.sku,
                  name: product.name,
                },
          );
        })
        .catch((err) => {
          if (!active) return;
          // 404 means the barcode is free, which is what the user wants to hear.
          // Anything else is a problem with the check, not with the barcode —
          // and a check that cannot run must not accuse a code of being taken.
          setTakenBy(null);
          if (!(err instanceof ApiError) || err.status !== 404) {
            // Deliberately silent: the server still enforces uniqueness on save,
            // so a failed advisory lookup costs the user nothing.
          }
        })
        .finally(() => {
          if (active) setChecking(false);
        });
    }, 500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [barcode, excludeProductId]);

  return { takenBy, checking };
}
