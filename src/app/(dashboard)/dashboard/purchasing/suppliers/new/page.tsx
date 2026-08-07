import type { Metadata } from "next";

import {
  PageHeading,
  PURCHASING_CRUMBS,
  SupplierForm,
} from "@/features/purchasing";

export const metadata: Metadata = { title: "Supplier baru · PawShip" };

export default function NewSupplierPage() {
  return (
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

      <SupplierForm />
    </div>
  );
}
