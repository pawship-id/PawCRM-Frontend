import type { Metadata } from "next";

import { CustomerModuleHeader } from "@/features/customers";
import { MembershipPlansPanel, MembershipSubTabs } from "@/features/memberships";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Membership · Pelanggan · Buloo",
};

/**
 * The Membership tab — the CATALOGUE of packages a shop sells.
 *
 * GATED ON `membershipPlans:read`, unlike the placeholder it replaced: this one
 * reads real packages and their prices, so it is a screen with something to
 * protect.
 *
 * WHY THE CATALOGUE IS THE LANDING TAB rather than the cards: nothing can exist
 * until a package does, and the first thing anybody does in this module is
 * define what is for sale. The cards live one tab over.
 */
export default function CustomerMembershipPage() {
  return (
    <RequirePermission feature="membershipPlans">
      <div className="flex flex-col gap-6">
        <CustomerModuleHeader />
        <MembershipSubTabs />
        <MembershipPlansPanel />
      </div>
    </RequirePermission>
  );
}
