import type { Metadata } from "next";

import { BranchEditForm } from "@/features/branches";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Edit branch · Master Data · PawShip",
};

/**
 * Per-branch edit route. In Next 16 the `params` prop is a Promise, so this is
 * an async Server Component that awaits it and hands the id to the client
 * BranchEditForm (which owns the fetch + the edit sections). Mirrors the users
 * per-id route. Wrapped in RequirePermission so a direct link without
 * `branches:update` shows access-denied rather than a form that cannot save.
 */
export default async function EditBranchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="branches" action="update">
      <div className="flex flex-col gap-6">
        <BranchEditForm id={id} />
      </div>
    </RequirePermission>
  );
}
