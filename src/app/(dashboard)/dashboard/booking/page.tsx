import type { Metadata } from "next";
import { SectionPlaceholder } from "@/features/dashboard";
import { BookingIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Booking · PawShip" };

export default function BookingPage() {
  return (
    <SectionPlaceholder
      title="Booking"
      description="Appointments and scheduling for grooming and clinic visits."
      icon={BookingIcon}
    />
  );
}
