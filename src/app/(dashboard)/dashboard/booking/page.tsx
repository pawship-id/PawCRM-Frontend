import type { Metadata } from "next";

import { BookingsScreen } from "@/features/booking";

export const metadata: Metadata = { title: "Booking · Buloo" };

export default function BookingPage() {
  return <BookingsScreen />;
}
