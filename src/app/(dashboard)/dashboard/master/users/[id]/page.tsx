import type { Metadata } from "next";

import { UserEditForm } from "@/features/users";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Edit user · Master Data · PawShip" };

/**
 * Per-user edit route. In Next 16 the `params` prop is a Promise, so this is an
 * async Server Component that awaits it and hands the id to the client
 * UserEditForm (which owns the fetch + the four edit sections). Wrapped in
 * RequirePermission so a direct link without `users:update` shows access-denied
 * rather than a form that cannot save.
 */
export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="users" action="update">
      <div className="flex flex-col gap-6">
        <UserEditForm id={id} />
      </div>
    </RequirePermission>
  );
}
