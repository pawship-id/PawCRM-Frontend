import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Breadcrumb } from "@/components";
import { Button } from "@/components/ui/button";
import { BookingDetailScreen } from "@/features/booking";
import { GROOMING_BOOKINGS_PATH, GROOMING_PATH } from "@/features/grooming";
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
      {/* The same `gap-6` every other detail page puts between its crumb and
          its content — without it the heading card sat flush under the crumb. */}
      <div className="flex flex-col gap-6">
        {/* The crumb on the left, the way back to the list on the right —
            the Booking tab, not the module's Ringkasan (17 November 2026, on
            request). Its filters are still on: see `usePersistentState`. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Breadcrumb
            items={[
              { label: "Layanan" },
              { label: "Grooming", href: GROOMING_PATH },
              { label: "Booking", href: GROOMING_BOOKINGS_PATH },
              { label: "Detail" },
            ]}
          />
          <Button asChild variant="secondary" size="sm">
            <Link href={GROOMING_BOOKINGS_PATH}>
              <ChevronLeft className="size-4" aria-hidden />
              Kembali ke daftar booking
            </Link>
          </Button>
        </div>
        <BookingDetailScreen id={id} />
      </div>
    </RequirePermission>
  );
}
