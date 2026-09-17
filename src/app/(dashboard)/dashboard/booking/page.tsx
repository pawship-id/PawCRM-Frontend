import type { Metadata } from "next";

import { TodayScreen } from "@/features/booking";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Kalender · Buloo" };

/**
 * Layanan › Kalender — the day board.
 *
 * `?tanggal=` IS READ HERE, as the other deep-linked screens read theirs: the
 * server already has it, so the screen needs no `useSearchParams` and no
 * Suspense boundary. `searchParams` is a Promise in this version of Next — see
 * AGENTS.md.
 *
 * IT IS WHERE A SAVE THAT MADE SEVERAL BOOKINGS LANDS — one booking per animal,
 * all on the same visit — so whoever just took them sees that day's board with
 * every one of them on it.
 *
 * KEYED ON IT, so following a link to another date while already on this route
 * starts from that day rather than keeping the one on screen.
 *
 * ANYTHING THAT IS NOT `yyyy-mm-dd` IS DROPPED rather than used: a bad date
 * would make the board ask the server for a range it cannot answer.
 *
 * GATED ON `read`, the same grant every booking route enforces.
 */
export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ tanggal?: string | string[] }>;
}) {
  const { tanggal } = await searchParams;
  const first = Array.isArray(tanggal) ? tanggal[0] : tanggal;
  const initialDate = first && /^\d{4}-\d{2}-\d{2}$/.test(first) ? first : "";

  return (
    <RequirePermission feature="bookings" action="read">
      <TodayScreen key={initialDate} initialDate={initialDate} />
    </RequirePermission>
  );
}
