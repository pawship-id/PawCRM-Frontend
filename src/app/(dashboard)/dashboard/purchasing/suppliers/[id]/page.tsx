import type { Metadata } from "next";

import {
  PageHeading,
  PURCHASING_CRUMBS,
  SupplierDetail,
} from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail supplier · PawShip" };

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="suppliers">
      <div className="flex flex-col gap-6">
        <PageHeading
          crumbs={[
            PURCHASING_CRUMBS.hub,
            PURCHASING_CRUMBS.suppliers,
            { label: "Detail supplier" },
          ]}
          title="Detail supplier"
        />
        <SupplierDetail supplierId={id} />
      </div>
    </RequirePermission>
  );
}
