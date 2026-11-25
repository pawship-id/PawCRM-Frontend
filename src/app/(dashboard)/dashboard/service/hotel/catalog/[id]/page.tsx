import type { Metadata } from "next";

import { HotelServiceDetailScreen } from "@/features/hotel";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail layanan · Hotel · Buloo" };

/** `params` is a Promise in this version of Next. */
export default async function HotelServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequirePermission feature="services">
      <HotelServiceDetailScreen serviceId={id} />
    </RequirePermission>
  );
}
