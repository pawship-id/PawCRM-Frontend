import type { Metadata } from "next";

import {
  MEMBERSHIP_TABS,
  MembershipPlansPanel,
  MembershipSubTabs,
} from "@/features/memberships";
import { RequirePermission } from "@/features/permissions";
import { PromosiModuleHeader } from "@/features/promosi";

export const metadata: Metadata = {
  title: "Paket · Membership · Promosi · Buloo",
};

/**
 * Promosi › Membership › Paket — the CATALOGUE of packages a shop sells, and
 * the tab Membership opens on: nothing can exist until a package does. A role
 * without `membershipPlans:read` is sent on to Anggota.
 */
export default function MembershipPlansPage() {
  return (
    <RequirePermission feature="membershipPlans" redirectTo={MEMBERSHIP_TABS}>
      <div className="flex flex-col gap-6">
        <PromosiModuleHeader />
        <MembershipSubTabs />
        <MembershipPlansPanel />
      </div>
    </RequirePermission>
  );
}
