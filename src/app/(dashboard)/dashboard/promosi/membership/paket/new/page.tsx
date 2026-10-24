import type { Metadata } from "next";

import { MembershipPlanForm } from "@/features/memberships";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Paket membership baru · Buloo",
};

export default function NewMembershipPlanPage() {
  return (
    <RequirePermission feature="membershipPlans" action="create">
      <MembershipPlanForm />
    </RequirePermission>
  );
}
