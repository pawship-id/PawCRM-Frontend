import type { Metadata } from "next";

import { PageHeading, SupplierForm } from "@/features/purchasing";

export const metadata: Metadata = { title: "Supplier baru · PawShip" };

export default function NewSupplierPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        backHref="/dashboard/purchasing/suppliers"
        backLabel="Supplier"
        title="Supplier baru"
      >
        Termin pembayaran menentukan tanggal jatuh tempo setiap faktur dari
        supplier ini — dan karenanya, mana yang muncul sebagai lewat tempo.
      </PageHeading>

      <SupplierForm />
    </div>
  );
}
