import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { ProductBulkUpdateScreen } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Update massal produk · Buloo" };

const TYPES = ["standalone", "parent"] as const;
const STATUSES = ["active", "inactive"] as const;

const oneOf = <T extends string>(allowed: readonly T[], value?: string) =>
  allowed.find((candidate) => candidate === value) ?? "";

/**
 * Bulk product update. Gated on `products:update`, the commit's own permission.
 *
 * The list's filters arrive in the URL, so the download opens on what the list
 * was showing. A bundle filter is dropped: a bundle is not in this file.
 *
 * `searchParams` is a Promise in this version of Next, like `params`.
 */
export default async function ProductBulkUpdatePage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    categoryId?: string;
    productType?: string;
    status?: string;
  }>;
}) {
  const { search, categoryId, productType, status } = await searchParams;

  return (
    <RequirePermission feature="products" action="update">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventori", href: "/dashboard/inventory" },
              {
                label: "Produk & Varian",
                href: "/dashboard/inventory/products",
              },
              { label: "Update Massal" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Update massal produk
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Ubah nama, harga jual, min stok, akun penjualan, merek, dan status
            banyak produk sekaligus dari satu file.
          </p>
        </div>

        <ProductBulkUpdateScreen
          initialFilters={{
            search: search ?? "",
            categoryId: categoryId ?? "",
            productType: oneOf(TYPES, productType),
            status: oneOf(STATUSES, status),
          }}
        />
      </div>
    </RequirePermission>
  );
}
