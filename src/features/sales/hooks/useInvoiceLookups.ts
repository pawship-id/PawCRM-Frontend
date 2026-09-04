"use client";

import { useEffect, useState } from "react";

import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { productService } from "@/services/product.service";
import { serviceService } from "@/services/service.service";
import { tenantService } from "@/services/tenant.service";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import { useAuth } from "@/features/auth";
import { accessibleBranches, accessibleWarehouses } from "@/utils/accessScope";
import type { Branch, Customer, Service, TenantSettings } from "@/types/api";
import type { Product, StockWarehouse } from "@/types/inventory";

/**
 * Everything the invoice form has to offer somebody, fetched once on mount.
 *
 * BRANCHES AND WAREHOUSES ARE NARROWED TO THE SIGNED-IN USER. The server refuses
 * a post outside that reach and hides those documents from every read, so
 * offering one here could only produce a rejection after a form was filled in.
 * A courtesy over the server's answer, never the isolation itself.
 *
 * THE TAX SETTINGS COME ALONG, and they are not optional decoration: whether
 * catalogue prices already include PPN decides what the form's own total MEANS.
 * Getting it wrong understates a bill by the whole tax.
 *
 * A FAILURE HERE IS SHOWN, NOT SWALLOWED. Every list below is required to fill
 * in the form — a customer, a branch, something to sell — so their failure IS the
 * form's failure, unlike the accounting section on the product form where a
 * missing list merely disables an optional field.
 */
export interface InvoiceLookups {
  customers: Customer[];
  branches: Branch[];
  warehouses: StockWarehouse[];
  products: Product[];
  services: Service[];
  /** Defaults applied: inclusive pricing, zero rate — the server's own. */
  tax: { priceIncludesTax: boolean; taxRate: number };
  loading: boolean;
  error: string | null;
}

/**
 * The API's page-size cap. Asking for more is a 400, not a bigger page — the
 * same clamp `chartOfAccounts.service.ts` documents.
 */
const MAX_LIMIT = 100;

export function useInvoiceLookups(): InvoiceLookups {
  const { user } = useAuth();
  const [state, setState] = useState<Omit<InvoiceLookups, "loading" | "error">>({
    customers: [],
    branches: [],
    warehouses: [],
    products: [],
    services: [],
    tax: { priceIncludesTax: true, taxRate: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [customers, branches, warehouses, products, services, tenant] =
          await Promise.all([
            customerService.list({ limit: MAX_LIMIT }),
            branchService.list({ limit: MAX_LIMIT }),
            warehouseService.list({ isActive: true }),
            /*
              VARIANTS EXCLUDED, PARENTS INCLUDED — `excludeVariants` is what the
              catalogue's own list sends. A variant is bought by its own SKU
              through the picker's search; offering every colour of every collar
              in one flat dropdown is a list nobody can read.
            */
            productService.list({ limit: MAX_LIMIT, isActive: true }),
            serviceService.list({ limit: MAX_LIMIT, isActive: true }),
            tenantService.me(),
          ]);

        if (!active) return;

        const settings = (tenant.settings ?? {}) as TenantSettings;

        setState({
          customers: customers.items,
          branches: accessibleBranches(user, branches.items),
          warehouses: accessibleWarehouses(user, warehouses.items),
          products: products.items,
          services: services.items,
          tax: {
            // `!== false`, matching the server: a tenant that has never set it
            // prices inclusive of tax, which is the Indonesian shelf norm.
            priceIncludesTax: settings.priceIncludesTax !== false,
            taxRate: Number(settings.taxRate ?? 0),
          },
        });
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Data untuk form faktur gagal dimuat.",
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user]);

  return { ...state, loading, error };
}
