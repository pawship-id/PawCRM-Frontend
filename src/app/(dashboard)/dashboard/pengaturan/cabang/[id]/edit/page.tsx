import type { Metadata } from "next";

import { BranchEditForm } from "@/features/branches";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Ubah cabang · Pengaturan · Buloo",
};

/**
 * The branch EDIT form, moved off `/cabang/:id` on 28 September 2026 so that
 * address could become the read-only detail — the same split Kas & Bank makes
 * between a transaction and its `/edit` (docs/ui-rules.md §16).
 *
 * In Next 16 the `params` prop is a Promise, so this is an async Server
 * Component that awaits it and hands the id to the client BranchEditForm
 * (which owns the fetch + the edit sections). Wrapped in RequirePermission so a
 * direct link without `branches:update` shows access-denied rather than a form
 * that cannot save.
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
