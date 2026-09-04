import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { ProductDetail } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail produk · Buloo" };

/**
 * One product, read-only. Editing lives one level deeper, at `[id]/edit` — the
 * same split the supplier routes use, and for the same reason: arriving at a
 * product from a low-stock alert or a search means wanting to LOOK at it, and a
 * URL that opened a form full of live inputs is an edit nobody asked for.
 *
 * `params` is a Promise in this version of Next — awaited before use, matching
 * the other dynamic routes in the app.
 */
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="products">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventory", href: "/dashboard/inventory" },
              {
                label: "Produk & Varian",
                href: "/dashboard/inventory/products",
              },
              { label: "Detail produk" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Detail produk
          </h1>
        </div>

        <ProductDetail productId={id} />
      </div>
    </RequirePermission>
  );
}
