import type { Metadata } from "next";

import { MembershipCardDetail } from "@/features/memberships";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Kartu membership · Buloo",
};

export default async function MembershipCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="petMemberships">
      <MembershipCardDetail id={id} />
    </RequirePermission>
  );
}
