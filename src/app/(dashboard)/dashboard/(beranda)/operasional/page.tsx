import type { Metadata } from "next";

import { BerandaOperasional } from "@/features/dashboard";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Operasional · Beranda · Buloo" };

/** Beranda › Operasional — read off the period's bookings. */
export default function BerandaOperasionalPage() {
  return (
    <RequirePermission feature="bookings" action="read">
      <BerandaOperasional />
    </RequirePermission>
  );
}
