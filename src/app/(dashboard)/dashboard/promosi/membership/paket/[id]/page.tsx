import type { Metadata } from "next";

import { MembershipPlanDetail } from "@/features/memberships";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Paket membership · Buloo",
};

export default async function MembershipPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="membershipPlans">
      <MembershipPlanDetail id={id} />
    </RequirePermission>
  );
}
