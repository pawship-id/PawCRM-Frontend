import type { Metadata } from "next";

import { PageHeading, SupplierDetail } from "@/features/purchasing";

export const metadata: Metadata = { title: "Detail supplier · PawShip" };

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        backHref="/dashboard/purchasing/suppliers"
        backLabel="Supplier"
        title="Detail supplier"
      />
      <SupplierDetail supplierId={id} />
    </div>
  );
}
