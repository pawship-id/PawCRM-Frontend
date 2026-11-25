import type { Metadata } from "next";

import { HotelSettingsScreen } from "@/features/hotel";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Pengaturan · Hotel · Buloo" };

/** The night's commission lives on the tenant — gated like Grooming's Pengaturan. */
export default function HotelSettingsPage() {
  return (
    <RequirePermission feature="serviceSettings">
      <HotelSettingsScreen />
    </RequirePermission>
  );
}
