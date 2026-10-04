"use client";

import { useEffect, useState } from "react";

import { userService } from "@/services/user.service";

/**
 * How many staff this tenant has — the "X pengguna" chip on Pengaturan › Umum's
 * hero (23 September 2026, matching the mockup's `t.penggunaAktif`).
 *
 * ONE ROW, NOT THE LIST: `limit: 1` and `pagination.total`, the same trick
 * `useSetupCounts` plays for every other headcount in this app.
 *
 * EVERY NON-DELETED USER, active or suspended — the default query excludes
 * neither. The chip answers "how many staff accounts does this shop have", not
 * "how many are currently allowed to sign in".
 */
export function useUserCount(enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    userService
      .list({ page: 1, limit: 1 })
      .then((result) => {
        if (active) setCount(result.pagination.total);
      })
      .catch(() => {
        // Silent: a chip that fails to load is left out, not turned into an
        // alert on a page whose main content already loaded fine.
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  return enabled ? count : null;
}
