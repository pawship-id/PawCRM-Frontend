"use client";

import { useEffect, useState } from "react";

import { customerInvoiceService } from "@/services/customerInvoice.service";
import type { TillCorrectionStatus } from "@/types/api";

/**
 * WHETHER A TILL-BORN FAKTUR CAN BE EDITED OR CANCELLED (17 November 2026) —
 * the server's own reading, so a button is drawn exactly when it would accept
 * the write. Not fetched for a hand-raised faktur (`enabled` false), whose
 * rules the screen already knows. `version` re-reads it after every write.
 */
export function useTillCorrection(
  invoiceId: string,
  enabled: boolean,
  version = 0,
): { status: TillCorrectionStatus | null; loading: boolean } {
  const [status, setStatus] = useState<TillCorrectionStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus(null);
      return;
    }

    let active = true;
    setLoading(true);

    customerInvoiceService
      .tillCorrection(invoiceId)
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch(() => {
        // Unknown → nothing offered; the server would refuse a write anyway.
        if (active) setStatus(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [invoiceId, enabled, version]);

  return { status, loading };
}
