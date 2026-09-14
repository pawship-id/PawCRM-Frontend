import { redirect } from "next/navigation";

/**
 * AN OLD ADDRESS, KEPT SO LINKS DO NOT BREAK.
 *
 * This was one animal's work inside a visit that could hold several. A booking
 * is one animal and one main service now, so the booking's own page IS that
 * work — and a bookmark or a WhatsApp'd link to the old address lands there.
 *
 * A SERVER REDIRECT, before anything renders: there is nothing on this route to
 * show, and a client component bouncing after a paint would flash an empty page.
 * `params` IS A PROMISE in this version of Next — see AGENTS.md.
 */
export default async function BookingPetWorkRedirect({
  params,
}: {
  params: Promise<{ id: string; petId: string }>;
}) {
  const { id } = await params;

  redirect(`/dashboard/booking/${id}`);
}
