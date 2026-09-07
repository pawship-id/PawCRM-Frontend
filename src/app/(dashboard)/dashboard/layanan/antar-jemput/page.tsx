import type { Metadata } from "next";
import { Car } from "lucide-react";

import { SectionPlaceholder } from "@/features/dashboard";

export const metadata: Metadata = { title: "Antar-Jemput · Buloo" };

export default function AntarJemputPage() {
  return (
    <SectionPlaceholder
      title="Antar-Jemput"
      description="Jemputan dan antaran hari ini, beserta zona dan tarifnya."
      icon={Car}
    />
  );
}
