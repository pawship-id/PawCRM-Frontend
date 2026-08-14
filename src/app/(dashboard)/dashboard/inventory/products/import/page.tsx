import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { ImportScreen } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Import produk · PawShip" };

/**
 * Bulk product import.
 *
 * Gated on `products:create`, matching the two write endpoints behind it. The
 * toolbar already hides the entry point for a role without it; this covers
 * direct URL entry, so the user sees access-denied rather than a screen that
 * only ever returns a 403.
 *
 * The template download is a `products:read` on the server, deliberately more
 * open than the screen it sits on — but there is no route that serves only the
 * template, so nothing is lost by gating the page on the stricter of the two.
 */
export default function ImportProductsPage() {
  return (
    <RequirePermission feature="products" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventory", href: "/dashboard/inventory" },
              {
                label: "Produk & Varian",
                href: "/dashboard/inventory/products",
              },
              // No href: this is the page. See Breadcrumb for why the last crumb
              // must not link to itself.
              { label: "Import" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Import produk
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Buat banyak produk sekaligus dari satu file — produk biasa maupun
            produk bervarian. Bundle tetap dibuat lewat form.
          </p>
        </div>

        <ImportScreen />
      </div>
    </RequirePermission>
  );
}
