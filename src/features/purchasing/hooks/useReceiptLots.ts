"use client";

import { useEffect, useState } from "react";

import { productBatchService } from "@/services/productBatch.service";
import type { ProductBatch } from "@/types/inventory";

/**
 * The lots a receipt's lines created, keyed by batch id.
 *
 * WHY THIS HOOK EXISTS AT ALL — a gap in the API. `GET /goods-receipts/:id`
 * resolves `productSku`, `productName` and `productUnit` onto every line, but
 * stops at `batchId` for the lot: the code a human recognises the lot by and the
 * expiry date that decides when it must be sold are both absent. The delivery
 * screen is where a clerk checks the lot they just typed against the box in front
 * of them, so the ids are resolved here instead. Adding `batchCode` and
 * `expiryDate` to the receipt's own lines would remove this file.
 *
 * BEST-EFFORT, AND THAT IS THE DESIGN. `productBatches:read` is a permission
 * separate from `goodsReceipts:read`, so a role that may read a delivery need not
 * be able to read its lots. A failure resolves to a missing entry, never to an
 * error on the screen: the receipt itself loaded fine, and refusing to render it
 * because a decoration could not be fetched would be a worse answer than
 * rendering the lot column blank.
 *
 * ONE REQUEST PER LOT, because there is no endpoint that takes a set of ids.
 * Bounded in practice by the lines on one delivery, and they run concurrently.
 */
export function useReceiptLots(
  batchIds: string[],
): Record<string, ProductBatch> {
  const [lots, setLots] = useState<Record<string, ProductBatch>>({});

  // Serialised so a fresh array with identical contents — which every render of
  // the detail screen produces — does not re-fetch every lot on the document.
  const key = JSON.stringify(batchIds);

  useEffect(() => {
    const ids = JSON.parse(key) as string[];
    if (ids.length === 0) return;

    let active = true;

    Promise.all(
      ids.map((id) =>
        productBatchService
          .getById(id)
          .then((batch) => [id, batch] as const)
          // See the header: a lot that cannot be read costs the lot column, not
          // the page.
          .catch(() => null),
      ),
    ).then((results) => {
      if (!active) return;
      setLots(Object.fromEntries(results.filter((row) => row !== null)));
    });

    return () => {
      active = false;
    };
  }, [key]);

  return lots;
}
