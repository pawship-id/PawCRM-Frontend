import type { Metadata } from "next";

import { MembershipReportScreen } from "@/features/memberships";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Laporan Membership · Buloo",
};

/**
 * Laporan Membership — what the packages brought in and gave away.
 *
 * GATED ON `membershipPlans:read`, not on a reports grant: the report is about
 * what the packages did, and whoever may see the catalogue is who is asking.
 */
export default function MembershipReportPage() {
  return (
    <RequirePermission feature="membershipPlans">
      <MembershipReportScreen />
    </RequirePermission>
  );
}
