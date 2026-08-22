import type { Metadata } from "next";

import {
  PageHeading,
  PURCHASING_CRUMBS,
  SupplierCategoryForm,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Kategori supplier baru · Buloo" };

/**
 * Wrapped in RequirePermission so a direct link without
 * `supplierCategories:create` shows access-denied rather than a form that
 * cannot save — the same guard the list's create button applies with `<Can>`.
 */
export default function NewSupplierCategoryPage() {
  return (
    <RequirePermission feature="supplierCategories" action="create">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.supplierCategories,
            // No href: this is the page. See Breadcrumb for why the last crumb
            // must not link to itself.
            { label: "Kategori baru" },
          ]}
          title="Kategori supplier baru"
        >
          Nama saja — kategori ini cuma dipakai untuk mengelompokkan supplier.
        </PageHeading>

        <SupplierCategoryForm />
      </div>
    </RequirePermission>
  );
}
