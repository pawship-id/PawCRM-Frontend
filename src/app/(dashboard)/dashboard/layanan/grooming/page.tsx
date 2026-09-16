import type { Metadata } from "next";

import { GroomingBookingsScreen } from "@/features/grooming";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Grooming · Buloo" };

export default function GroomingPage() {
  return (
    <RequirePermission feature="bookings">
      <GroomingBookingsScreen />
    </RequirePermission>
  );
}
