import type { Metadata } from "next";

import { BusinessLinesScreen } from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Lini Bisnis · Buloo" };

export default function BusinessLinesPage() {
  return (
    <RequirePermission feature="businessLines">
      <BusinessLinesScreen />
    </RequirePermission>
  );
}
