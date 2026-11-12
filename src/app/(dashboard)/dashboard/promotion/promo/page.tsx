import type { Metadata } from "next";

import { Can, RequirePermission } from "@/features/permissions";
import { NewPromoButton, PromoListPanel } from "@/features/promos";
import { PROMOSI_TABS, PromosiModuleHeader } from "@/features/promosi";

export const metadata: Metadata = {
  title: "Promo · Promosi · Buloo",
};

/** Promosi › Promo — the promo list (Promo V1). */
export default function PromoListPage() {
  return (
    <RequirePermission feature="promos" redirectTo={PROMOSI_TABS}>
      <div className="flex flex-col gap-6">
        <PromosiModuleHeader
          action={
            <Can feature="promos" action="create">
              <NewPromoButton />
            </Can>
          }
        />
        <PromoListPanel />
      </div>
    </RequirePermission>
  );
}
