import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { CategoryForm } from "@/features/categories";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Kategori baru · Buloo" };

/**
 * Wrapped in RequirePermission so a direct link without `categories:create`
 * shows access-denied rather than a form that cannot save — the same guard the
 * list's create button applies with `<Can>`.
 */
export default function NewCategoryPage() {
  return (
    <RequirePermission feature="categories" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventory", href: "/dashboard/inventory" },
              { label: "Kategori", href: "/dashboard/inventory/categories" },
              // No href: this is the page. See Breadcrumb for why the last
              // crumb must not link to itself.
              { label: "Kategori baru" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Kategori baru
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Nama saja sudah cukup — deskripsi dan gambar bisa ditambah kapan
            saja.
          </p>
        </div>

        <CategoryForm />
      </div>
    </RequirePermission>
  );
}
