import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { CategoryForm } from "@/features/categories";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Ubah kategori · Buloo" };

/**
 * The edit route.
 *
 * `[id]` IS THE EDIT PAGE, not `[id]/edit`, because a category has no detail
 * view to occupy `[id]` — it carries no price, no stock and no history, so
 * there is nothing a read-only page would show that the list row does not.
 * Products split the two because they genuinely have both. Adding an `/edit`
 * segment here would leave `/categories/<id>` as a URL that 404s, which is
 * worse than no segment at all. Branches make the same call.
 *
 * `params` is a Promise in this version of Next — awaited before use, matching
 * every other dynamic route in the app.
 */
export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="categories" action="update">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventory", href: "/dashboard/inventory" },
              { label: "Kategori", href: "/dashboard/inventory/categories" },
              { label: "Ubah kategori" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Ubah kategori
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Perubahan langsung berlaku untuk semua produk yang sudah difilekan
            di sini.
          </p>
        </div>

        <CategoryForm categoryId={id} />
      </div>
    </RequirePermission>
  );
}
