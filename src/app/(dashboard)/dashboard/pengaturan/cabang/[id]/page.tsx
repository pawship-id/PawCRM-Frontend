import type { Metadata } from "next";

import { BranchDetail } from "@/features/branches";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Detail cabang · Pengaturan · Buloo",
};

/**
 * One branch, READ-ONLY — its identity, its hours, and the warehouses filed
 * under it (28 September 2026, on request). The edit form that used to live on
 * this address moved to `./edit`.
 *
 * GATED ON `branches:read`, NOT `:update`, which is the point of the split: a
 * role that may look at the branch list can now open a branch and see where its
 * stock sits without being able to change anything. While the form sat here,
 * that role had nowhere to click through to at all.
 */
export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="branches">
      <BranchDetail id={id} />
    </RequirePermission>
  );
}
