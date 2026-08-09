import type { Metadata } from "next";

import {
  PageHeading,
  PURCHASING_CRUMBS,
  SupplierEditForm,
  supplierCrumb,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Ubah supplier · PawShip" };

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="suppliers" action="update">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.suppliers,
            supplierCrumb(id),
            { label: "Ubah supplier" },
          ]}
          title="Ubah supplier"
        >
          Mengubah termin atau tipe kerja sama tidak berlaku surut — penerimaan
          yang sudah tercatat tetap memakai ketentuan saat itu.
        </PageHeading>

        <SupplierEditForm supplierId={id} />
      </div>
    </RequirePermission>
  );
}
