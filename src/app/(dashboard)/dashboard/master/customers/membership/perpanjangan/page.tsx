import type { Metadata } from "next";

import { CustomerModuleHeader } from "@/features/customers";
import { MembershipSubTabs, RenewalPanel } from "@/features/memberships";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Perpanjangan · Membership · Buloo",
};

/**
 * TAWARAN PERPANJANGAN — a call list, not a report. Nothing here sends anything:
 * this system has no scheduler and no message blaster. What it gives is the
 * right list, in the place somebody is already standing, with the owner's number
 * on every row.
 */
export default function MembershipRenewalsPage() {
  return (
    <RequirePermission feature="petMemberships">
      <div className="flex flex-col gap-6">
        <CustomerModuleHeader />
        <MembershipSubTabs />
        <RenewalPanel />
      </div>
    </RequirePermission>
  );
}
