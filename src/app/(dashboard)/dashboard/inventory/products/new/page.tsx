import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { ProductForm } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Produk baru · Buloo" };

/**
 * `searchParams` is a Promise in this version of Next, like `params`.
 *
 * `?type=` carries the shape chosen in the catalogue's create menu, so picking
 * "Bundle" there opens the bundle form rather than the mode picker with the
 * answer already known. It is a hint, not a contract: ProductForm ignores
 * anything it does not recognise and opens on the default.
 */
export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;

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
              { label: "Produk baru" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Produk baru
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Pilih bentuknya dulu: satuan, varian, atau bundle. Bentuk ini
            dikunci setelah produk dibuat.
          </p>
        </div>

        <ProductForm initialMode={type} />
      </div>
    </RequirePermission>
  );
}
