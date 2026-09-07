import type { Metadata } from "next";
import { Scissors } from "lucide-react";

import { SectionPlaceholder } from "@/features/dashboard";

export const metadata: Metadata = { title: "Grooming · Buloo" };

export default function GroomingPage() {
  return (
    <SectionPlaceholder
      title="Grooming"
      description="Antrean, jadwal, daftar layanan, dan pengaturan yang hanya berlaku untuk grooming."
      icon={Scissors}
    />
  );
}
