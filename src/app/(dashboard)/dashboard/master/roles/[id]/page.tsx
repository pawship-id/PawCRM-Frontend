import type { Metadata } from "next";

import { RoleEditForm } from "@/features/roles";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Edit role · Master Data · PawShip" };

/**
 * Per-role edit route. In Next 16 the `params` prop is a Promise, so this is an
 * async Server Component that awaits it and hands the id to the client
 * RoleEditForm (which owns the fetch + the edit sections). Mirrors the users
 * per-id route. Wrapped in RequirePermission so a direct link without
 * `roles:update` shows access-denied rather than a form that cannot save.
 */
export default async function EditRolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="roles" action="update">
      <div className="flex flex-col gap-6">
        <RoleEditForm id={id} />
      </div>
    </RequirePermission>
  );
}
