import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import {
  AntarJemputBookingDetailScreen,
  ANTAR_JEMPUT_CRUMBS,
} from "@/features/antar-jemput";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Detail perjalanan · Antar-Jemput · Buloo",
};

/**
 * One ride, whole — `/dashboard/layanan/antar-jemput/:bookingId`
 * (23 September 2026, on request).
 *
 * GATED ON `read`, like the booking page: moving the ride along its ladder is
 * `update`, and the controls carry that gate themselves — so a driver who may
 * read the day's trips can open one without being able to reschedule it.
 *
 * DECLARED AFTER the static segments, but Next matches static ahead of dynamic
 * regardless: "katalog", "pengaturan" and "new" are never read as booking ids.
 *
 * THE CRUMB ONLY — THE SCREEN OWNS THE HEADING, for the reason the booking
 * page gives at length: a document's title is its number, and only the screen
 * has fetched it.
 */
export default async function AntarJemputBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="bookings" action="read">
      <div className="flex flex-col gap-6">
        <Breadcrumb items={[...ANTAR_JEMPUT_CRUMBS, { label: "Detail" }]} />
        <AntarJemputBookingDetailScreen id={id} />
      </div>
    </RequirePermission>
  );
}
