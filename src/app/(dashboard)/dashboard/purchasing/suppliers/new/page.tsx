import type { Metadata } from "next";

import {
  PageHeading,
  PURCHASING_CRUMBS,
  SupplierCreateForm,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Supplier baru · Buloo" };

export default function NewSupplierPage() {
  return (
    <RequirePermission feature="suppliers" action="create">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.suppliers,
            // No href: this is the page. See Breadcrumb for why the last crumb
            // must not link to itself.
            { label: "Supplier baru" },
          ]}
          title="Supplier baru"
        >
          Termin pembayaran menentukan tanggal jatuh tempo setiap faktur dari
          supplier ini — dan karenanya, mana yang muncul sebagai lewat tempo.
        </PageHeading>

        <SupplierCreateForm />
      </div>
    </RequirePermission>
  );
}
