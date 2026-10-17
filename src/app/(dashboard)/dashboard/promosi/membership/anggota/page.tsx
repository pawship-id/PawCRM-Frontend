import type { Metadata } from "next";

import {
  MembershipCardsPanel,
  MembershipSubTabs,
} from "@/features/memberships";
import { RequirePermission } from "@/features/permissions";
import { PromosiModuleHeader } from "@/features/promosi";

export const metadata: Metadata = {
  title: "Anggota · Membership · Promosi · Buloo",
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
        <PromosiModuleHeader />
        <MembershipSubTabs />
        <MembershipCardsPanel />
      </div>
    </RequirePermission>
  );
}
