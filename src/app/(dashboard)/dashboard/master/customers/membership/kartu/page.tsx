import type { Metadata } from "next";

import { CustomerModuleHeader } from "@/features/customers";
import { MembershipCardsPanel, MembershipSubTabs } from "@/features/memberships";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Kartu membership · Pelanggan · Buloo",
};

/**
 * Every card in the shop. A card is issued from a PET's profile — that is where
 * the animal is, and a card belongs to an animal — so this screen lists and
 * finds rather than creates.
 */
export default function MembershipCardsPage() {
  return (
    <RequirePermission feature="petMemberships">
      <div className="flex flex-col gap-6">
        <CustomerModuleHeader />
        <MembershipSubTabs />
        <MembershipCardsPanel />
      </div>
    </RequirePermission>
  );
}
