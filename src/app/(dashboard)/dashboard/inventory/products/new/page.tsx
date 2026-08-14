import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { ProductForm } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Produk baru · Buloo" };

export default function NewProductPage() {
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
            Pilih bentuknya dulu: produk biasa, produk yang punya varian, atau
            bundle. Bentuk ini dikunci setelah produk dibuat.
          </p>
        </div>

        <ProductForm />
      </div>
    </RequirePermission>
  );
}
