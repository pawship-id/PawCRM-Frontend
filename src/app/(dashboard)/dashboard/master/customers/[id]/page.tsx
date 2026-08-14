import type { Metadata } from "next";

import { CustomerEditForm } from "@/features/customers";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Edit customer · Master Data · Buloo",
};

/**
 * Per-customer edit route. In Next 16 the `params` prop is a Promise, so this is
 * an async Server Component that awaits it and hands the id to the client
 * CustomerEditForm (which owns the fetch + the edit sections). Mirrors the
 * branches per-id route. Wrapped in RequirePermission so a direct link without
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
