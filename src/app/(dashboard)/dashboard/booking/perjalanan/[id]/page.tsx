import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { BOOKING_CRUMBS, HomeTripDetailScreen } from "@/features/booking";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Perjalanan Home Grooming · Buloo" };

/**
 * One home-grooming trip — `/dashboard/booking/perjalanan/:tripId` (11 October
 * 2026, on request). The booking page links here from its "Kunjungan ke rumah"
 * card.
 *
 * GATED ON `read`, like the booking page: moving the trip is `advanceStatus` or
 * `update`, and the button carries that gate itself.
 *
 * THE CRUMB ONLY — THE SCREEN OWNS THE HEADING, for the reason the booking page
 * gives: only the screen has fetched the customer the trip is for.
 */
export default async function HomeTripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="bookings" action="read">
      <div className="flex flex-col gap-6">
        <Breadcrumb items={[...BOOKING_CRUMBS, { label: "Perjalanan" }]} />
        <HomeTripDetailScreen id={id} />
      </div>
    </RequirePermission>
  );
}
