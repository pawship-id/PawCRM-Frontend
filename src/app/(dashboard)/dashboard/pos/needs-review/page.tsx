import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { OfflineReviewScreen } from "@/features/pos";

export const metadata: Metadata = { title: "Perlu dicek · Kasir · Buloo" };

/** Gated on `posTransactions:reviewOffline`, the grant its routes enforce. */
export default function OfflineReviewPage() {
  return (
    <RequirePermission feature="posTransactions" action="reviewOffline">
      <OfflineReviewScreen />
    </RequirePermission>
  );
}
