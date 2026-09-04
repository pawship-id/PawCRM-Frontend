import type { Metadata } from "next";

import { BookingPetWorkScreen } from "@/features/booking";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Pekerjaan Hewan · Buloo" };

/**
 * ONE ANIMAL'S WORK IN ONE VISIT.
 *
 * UNDER THE BOOKING, NOT UNDER THE PET, and the address says which question it
 * answers: Coco may be on ten bookings, and "how is Coco's grooming going" only
 * means something inside one of them. `/dashboard/master/pets/:id` is the other
 * page — the animal in general, for its whole life.
 *
 * GATED ON `read`. Moving the work needs `advanceStatus` or `update` and
 * correcting the clock needs `update`; both are enforced on the server and
 * mirrored by the controls, so somebody who may only look still gets the page
 * they were sent to rather than a refusal.
 *
 * `params` IS A PROMISE in this version of Next — see AGENTS.md.
 */
export default async function BookingPetWorkPage({
  params,
}: {
  params: Promise<{ id: string; petId: string }>;
}) {
  const { id, petId } = await params;

  return (
    <RequirePermission feature="bookings" action="read">
      <BookingPetWorkScreen bookingId={id} petId={petId} />
    </RequirePermission>
  );
}
