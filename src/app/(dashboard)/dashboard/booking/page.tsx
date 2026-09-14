import type { Metadata } from "next";

import { BookingsScreen } from "@/features/booking";

export const metadata: Metadata = { title: "Booking · Buloo" };

/**
 * `?groupId=` is read HERE, as the Transaksi page reads its deep links: the
 * server already has it, so the screen needs no `useSearchParams` and no
 * Suspense boundary. `searchParams` is a Promise in this version of Next — see
 * AGENTS.md.
 *
 * IT IS WHERE A SAVE THAT MADE SEVERAL BOOKINGS LANDS — one booking per animal,
 * all in one group — so whoever just took them sees exactly those.
 *
 * KEYED ON IT, so following a link to another group (or to the plain list)
 * while already on this route starts from that address instead of keeping the
 * old filter. Removing the chip does not remount: it rewrites the address with
 * `replaceState`, which does not re-render this page (see `useBookings`).
 *
 * Anything that is not an ObjectId is dropped rather than sent: a bad id would
 * 400 the whole list.
 */
export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string | string[] }>;
}) {
  const { groupId } = await searchParams;
  const first = Array.isArray(groupId) ? groupId[0] : groupId;
  const initialGroupId = first && /^[a-f0-9]{24}$/i.test(first) ? first : "";

  return <BookingsScreen key={initialGroupId} initialGroupId={initialGroupId} />;
}
