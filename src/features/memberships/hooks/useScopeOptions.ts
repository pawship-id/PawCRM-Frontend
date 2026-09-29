"use client";

import { useEffect, useState } from "react";

import { productService } from "@/services/product.service";
import { serviceService } from "@/services/service.service";
import type { BenefitTarget } from "@/types/membership";

/** What one pickable row looks like, whichever list it came from. */
export interface ScopeOption {
  id: string;
  name: string;
}

/**
 * The rows the benefit form's second picker offers — fetched to match the two
 * choices above it.
 *
 * ─── IT ASKS THE SERVER, IT DOES NOT FILTER IN THE BROWSER ─────────────────
 *
 * The form used to load one page of services and narrow it here. That is
 * silently wrong the moment a tenant has more services than the page holds:
 * the picker would simply be missing the ones past the limit, with nothing on
 * screen saying so. `serviceKind` and `serviceType` are both server filters
 * now, so the list that comes back IS the list.
 *
 * ─── WHAT EACH TARGET ASKS FOR ─────────────────────────────────────────────
 *
 *   service — main services of the chosen kelompok.
 *   addon   — ADD-ONS of the chosen kelompok. The server also returns add-ons
 *             that declare no kelompok at all, because an empty list there
 *             means "offered with everything".
 *   product — the product catalogue. Kelompok does not apply: a bag of feed
 *             belongs to no kelompok layanan, which is why the control above
 *             disappears for this target.
 *   any     — nothing to pick.
 *
 * NOTHING IS FETCHED UNTIL THERE IS SOMETHING TO FETCH — a service or add-on
 * target with no kelompok chosen yet asks nothing, because "every service in
 * the shop" is not a list anybody was about to pick from.
 */
export function useScopeOptions({
  target,
  serviceKind,
}: {
  target: BenefitTarget;
  serviceKind: string | null;
}) {
  const [options, setOptions] = useState<ScopeOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;

    const wantsServices =
      (target === "service" || target === "addon") && Boolean(serviceKind);
    const wantsProducts = target === "product";

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(wantsServices || wantsProducts);

    if (!wantsServices && !wantsProducts) {
      setOptions([]);
      return () => {
        live = false;
      };
    }

    const request = wantsProducts
      ? productService
          .list({ limit: 100, isActive: true, excludeVariants: true })
          .then((result) =>
            result.items.map((row) => ({ id: row._id, name: row.name })),
          )
      : serviceService
          .list({
            limit: 100,
            isActive: true,
            serviceKind: serviceKind ?? undefined,
            serviceType: target === "addon" ? "addon" : "main",
          })
          .then((result) =>
            result.items.map((row) => ({ id: row._id, name: row.name })),
          );

    request
      .then((rows) => {
        if (live) setOptions(rows);
      })
      .catch(() => {
        /*
          SILENT, and the picker simply comes back empty. A benefit can still be
          scoped by kelompok alone — which is the common case — so a red banner
          here would block a form over a list the owner may not have needed.
        */
        if (live) setOptions([]);
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [target, serviceKind]);

  return { options, loading };
}
