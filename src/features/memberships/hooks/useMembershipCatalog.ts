"use client";

import { useEffect, useMemo, useState } from "react";

import { productService } from "@/services/product.service";
import { serviceService } from "@/services/service.service";
import type { Service } from "@/types/api";
import type { BenefitTarget } from "@/types/membership";

/** One pickable row, whichever list it came from. */
export interface CatalogItem {
  id: string;
  name: string;
}

/**
 * What the plan form's benefit options can name — EVERY active service (main
 * and add-on, with its price grid) and the product catalogue — loaded ONCE per
 * form, not once per option row.
 *
 * ─── WHY THE WHOLE SERVICE LIST, AND NOT A SERVER-FILTERED PAGE ────────────
 *
 * The old picker asked the server for one kelompok's services per row. The V1
 * builder needs more than a name per service: the PRICE GRID (to prefill
 * "harga per varian" and to estimate what a package is worth) and WHERE it is
 * done (`serviceLocations`, which decides whether "Biaya kunjungan" applies).
 * A tenant's service catalogue is tens of rows, so every page is read once and
 * the pickers filter it here, with the same rule the server's `serviceKind`
 * filter applies (service.repository.js): a main service by its own kind, an
 * add-on by the kinds it lists — an add-on listing none goes with every kind.
 *
 * Products stay a single page of 100: they are only ever NAMED in a scope
 * (never priced by the estimate), and a shop that sells memberships on more
 * than a hundred products would want a search, not a longer list.
 *
 * FAILS SOFT: an empty list leaves the pickers empty with a hint, and a scope
 * by kelompok — the common case — still works.
 */
export function useMembershipCatalog() {
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;

    async function allServices(): Promise<Service[]> {
      const rows: Service[] = [];
      for (let page = 1; page <= 20; page += 1) {
        const result = await serviceService.list({ page, limit: 100, isActive: true });
        rows.push(...result.items);
        if (page >= (result.pagination?.totalPages ?? 1)) break;
      }
      return rows;
    }

    Promise.allSettled([
      allServices(),
      productService
        .list({ limit: 100, isActive: true, excludeVariants: true })
        .then((result) => result.items.map((row) => ({ id: row._id, name: row.name }))),
    ]).then(([serviceResult, productResult]) => {
      if (!live) return;
      setServices(serviceResult.status === "fulfilled" ? serviceResult.value : []);
      setProducts(productResult.status === "fulfilled" ? productResult.value : []);
      setLoading(false);
    });

    return () => {
      live = false;
    };
  }, []);

  const serviceById = useMemo(
    () => new Map(services.map((service) => [service._id, service])),
    [services],
  );

  return { services, products, serviceById, loading };
}

/** The services a picker offers for a target and (optional) kelompok. */
export function servicesFor(
  services: Service[],
  target: BenefitTarget,
  serviceKind: string | null,
): Service[] {
  if (target === "service") {
    return services.filter(
      (service) =>
        service.serviceType !== "addon" &&
        (!serviceKind ||
          service.serviceKind === serviceKind ||
          (service.serviceKinds ?? []).includes(serviceKind as never)),
    );
  }
  if (target === "addon") {
    return services.filter(
      (service) =>
        service.serviceType === "addon" &&
        (!serviceKind ||
          (service.serviceKinds ?? []).length === 0 ||
          (service.serviceKinds ?? []).includes(serviceKind as never)),
    );
  }
  return [];
}

/** A service done at the customer's home — the only kind with a visit fee. */
export const isHomeService = (service: Service | undefined) =>
  Boolean(service?.serviceLocations?.includes("in_home"));
