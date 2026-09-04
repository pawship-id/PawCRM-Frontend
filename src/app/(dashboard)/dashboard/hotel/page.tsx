import type { Metadata } from "next";
import { SectionPlaceholder } from "@/features/dashboard";
import { HotelIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Hotel · Buloo" };

export default function HotelPage() {
  return (
    <SectionPlaceholder
      title="Hotel"
      description="Pet boarding — room availability, check-in, and check-out."
      icon={HotelIcon}
    />
  );
}
