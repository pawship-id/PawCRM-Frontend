import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { ProductForm } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Edit produk · PawShip" };

/**
 * `params` is a Promise in this version of Next — awaited before use, matching
 * the other dynamic routes in the app (master/branches/[id] and friends).
 */
export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="products" action="update">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventory", href: "/dashboard/inventory" },
              {
                label: "Produk & Varian",
                href: "/dashboard/inventory/products",
              },
              { label: "Edit produk" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Edit produk
          </h1>
        </div>

        <ProductForm productId={id} />
      </div>
    </RequirePermission>
  );
}
