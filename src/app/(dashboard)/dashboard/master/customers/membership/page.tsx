import type { Metadata } from "next";
import { IdCard } from "lucide-react";

import { CustomerModuleHeader } from "@/features/customers";
import { ModuleTabPlaceholder } from "@/features/dashboard";

export const metadata: Metadata = {
  title: "Membership · Pelanggan · Buloo",
};

/**
 * The Membership tab. UNGATED, like the other placeholders in the app: there is
 * no membership feature in the RBAC catalogue to gate it on, and the page holds
 * no data to protect. It gains a `RequirePermission` the day it gains a list.
 */
export default function CustomerMembershipPage() {
  return (
    <ModuleTabPlaceholder
      header={<CustomerModuleHeader />}
      title="Membership"
      note="Paket keanggotaan, masa berlaku, dan pengingat perpanjangan. Untuk sekarang, tier VIP tiap pelanggan ada di tab Pelanggan."
      icon={IdCard}
    />
  );
}
