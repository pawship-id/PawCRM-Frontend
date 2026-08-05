import type { Metadata } from "next";

import { PageHeading, SupplierForm } from "@/features/purchasing";

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
        backHref={`/dashboard/purchasing/suppliers/${id}`}
        backLabel="Detail supplier"
        title="Edit supplier"
      />
      <SupplierForm supplierId={id} />
    </div>
  );
}
