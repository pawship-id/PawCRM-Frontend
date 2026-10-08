import { Suspense } from "react";
import type { Metadata } from "next";

import { GroomerBookingScreen } from "@/features/groomer";

export const metadata: Metadata = { title: "Detail Job · Buloo" };

/**
 * Detail job — one booking, every session, and the notes and photos.
 *
 * The screen reads the id and the `?sesi=` hint on the client, and
 * `useSearchParams` needs a Suspense boundary above it so the page can still be
 * prerendered.
 */
export default function GroomerBookingPage() {
  return (
    <Suspense>
      <GroomerBookingScreen />
    </Suspense>
  );
}
