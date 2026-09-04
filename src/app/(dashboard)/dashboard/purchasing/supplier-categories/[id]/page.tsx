import type { Metadata } from "next";

import {
  PageHeading,
  PURCHASING_CRUMBS,
  SupplierCategoryForm,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Ubah kategori supplier · Buloo" };

/**
 * The edit route.
 *
 * `[id]` IS THE EDIT PAGE, not `[id]/edit`, because a supplier category has no
 * detail view to occupy `[id]` — it is a name and a status, so there is nothing
 * a read-only page would show that the list row does not. Suppliers themselves
 * split the two because they genuinely have both. Adding an `/edit` segment
 * here would leave `/supplier-categories/<id>` as a URL that 404s, which is
 * worse than no segment at all. Product categories make the same call.
 *
 * `params` is a Promise in this version of Next — awaited before use, matching
 * every other dynamic route in the app.
 */
export default async function EditSupplierCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="supplierCategories" action="update">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.supplierCategories,
            { label: "Ubah kategori" },
          ]}
          title="Ubah kategori supplier"
        >
          Perubahan langsung berlaku untuk semua supplier yang sudah
          dikelompokkan di sini.
        </PageHeading>

        <SupplierCategoryForm categoryId={id} />
      </div>
    </RequirePermission>
  );
}
