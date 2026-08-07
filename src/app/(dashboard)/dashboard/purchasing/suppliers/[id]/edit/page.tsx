import type { Metadata } from "next";

import {
  PageHeading,
  PURCHASING_CRUMBS,
  SupplierForm,
  supplierCrumb,
} from "@/features/purchasing";

export const metadata: Metadata = { title: "Edit supplier · PawShip" };

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        crumbs={[
          PURCHASING_CRUMBS.hub,
          PURCHASING_CRUMBS.suppliers,
          supplierCrumb(id),
          { label: "Edit supplier" },
        ]}
        title="Edit supplier"
      />
      <SupplierForm supplierId={id} />
    </div>
  );
}
