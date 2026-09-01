"use client";

import { useCallback, useEffect, useState } from "react";

import { tenantService } from "@/services/tenant.service";
import { ApiError } from "@/services/api-error";
import type { Tenant } from "@/types/api";

interface UseTenantResult {
  tenant: Tenant | null;
  loading: boolean;
  /** Non-null when the read failed — the screen shows it instead of the detail. */
  error: string | null;
  /** Re-run the read. Exposed for the error state's retry. */
  refetch: () => void;
}

/**
 * Loads the signed-in user's own business (GET /tenants/me).
 *
 * One fetch on mount, no polling: a tenant's name, timezone and plan change
 * about as often as the business is renamed, so keeping this in step with the
 * server continuously would be all cost and no benefit. `refetch` covers the
 * only case that matters — a read that failed.
 *
 * There is no id parameter, here or in the service: the backend derives the
 * tenant from the session, which is what makes the whole screen safe to reach
 * without a permission check on WHICH tenant is being read.
 *
 * `enabled` IS FOR THE SCREENS THAT MERELY CONSULT A SETTING — the Inventory hub
 * reads `allowNegativeStock` to decide whether to show its negative-stock
 * section. Reading the business profile needs `tenants:read`, which a storekeeper
 * need not hold, and firing the request anyway would paint a 403 error across a
 * page that was only asking a yes/no question. Off, the hook answers with a null
 * tenant and no error, which those callers read as "unknown" and fall back from.
 */
export function useTenant(enabled = true): UseTenantResult {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  // Bumped by refetch() to re-run the effect without any query state to change.
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // Not asked for. The caller reads a null tenant as "unknown" — see the
    // header — and no request is made at all.
    if (!enabled) return;

    let active = true;
    // Show the loading state, then synchronize with the server. The stale-
    // response guard (`active`) makes the late setStates safe. Same sanctioned
    // fetch-effect shape as useBranches, so the heuristic lint rule is disabled.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    tenantService
      .me()
      .then((result) => {
        if (active) setTenant(result);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Could not load your business information. Please try again.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [nonce, enabled]);

  return { tenant, loading, error, refetch };
}
