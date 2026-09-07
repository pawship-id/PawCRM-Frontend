import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { BookingDetailScreen, BOOKING_CRUMBS } from "@/features/booking";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail Booking · Buloo" };

/**
 * One booking, whole.
 *
 * GATED ON `read`. Moving it along the ladder is `update`, and the actions on
 * the page carry that gate themselves — so a groomer who may read the day sheet
 * can open a booking and see the allergy list without being able to reschedule
 * it.
 *
 * DECLARED AFTER the static segments in the filesystem, but Next matches static
 * ahead of dynamic regardless — "new", "kalender" and "availability" are never
 * read as booking ids.
 *
 * `params` is a Promise in this version of Next, awaited here so the screen
 * stays a client component that only receives the id.
 */
export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="bookings" action="read">
      {/*
        ─── THE CRUMB ONLY. THE SCREEN OWNS THE HEADING ──────────────────────

        This used to be a `PageHeading` titled "Detail booking" with a sentence
        under it — and the screen rendered its OWN `<h1>` with the booking number
        below that. Two h1s, and four stacked lines of heading before any content,
        with the one thing that identifies the document — BK-260905-003 — arriving
        fourth.

        A DOCUMENT'S TITLE IS ITS NUMBER. "Detail booking" is a category label
        that stops adding anything the moment the number is on screen, and the
        breadcrumb already says which module this is. So the crumb stays here,
        where it is static and server-rendered, and the number is the heading —
        which only the screen can know, because only the screen has fetched it.
      */}
      <Breadcrumb items={[...BOOKING_CRUMBS, { label: "Detail" }]} />
      <BookingDetailScreen id={id} />
    </RequirePermission>
  );
}
