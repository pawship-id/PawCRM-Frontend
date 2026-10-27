import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { PROMOSI_TABS, PromosiSummaryScreen } from "@/features/promosi";

export const metadata: Metadata = {
  title: "Ringkasan · Promosi · Buloo",
};

/** The Ringkasan tab — Promosi's front page. */
export default function PromosiSummaryPage() {
  return (
    <RequirePermission
      anyOf={[{ feature: "membershipReports" }, { feature: "petMemberships" }]}
      redirectTo={PROMOSI_TABS}
    >
      <PromosiSummaryScreen />
    </RequirePermission>
  );
}
