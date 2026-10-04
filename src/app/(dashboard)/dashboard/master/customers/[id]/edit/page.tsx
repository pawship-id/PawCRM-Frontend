import type { Metadata } from "next";

import { CustomerEditForm } from "@/features/customers";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Ubah pelanggan · Pelanggan · Buloo",
};

/**
 * The customer edit form, on its own route under the profile.
 *
 * SPLIT OUT OF `../page.tsx` so that reading a customer and changing one are two
 * screens behind two grants — the same split the pet module made at
 * `/master/pets/:id/edit`. Wrapped in RequirePermission so a direct link without
 * `customers:update` shows access-denied rather than a form that cannot save.
 */
export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="customers" action="update">
      <div className="flex flex-col gap-6">
        <CustomerEditForm id={id} />
      </div>
    </RequirePermission>
  );
}
