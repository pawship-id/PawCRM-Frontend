import type { Metadata } from "next";
import { SectionPlaceholder } from "@/features/dashboard";
import { HotelIcon } from "@/components/icons";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Hotel · Buloo" };

export default function HotelPage() {
  return (
    <RequirePermission feature="hotel">
      <SectionPlaceholder
        title="Hotel"
        description="Penitipan hewan — ketersediaan kamar, check-in, dan check-out."
        icon={HotelIcon}
      />
    </RequirePermission>
  );
}
