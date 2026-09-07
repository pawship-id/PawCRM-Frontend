import type { Metadata } from "next";
import { Wrench } from "lucide-react";

import { SectionPlaceholder } from "@/features/dashboard";

export const metadata: Metadata = { title: "Pengaturan Umum · Buloo" };

export default function PengaturanUmumPage() {
  return (
    <SectionPlaceholder
      title="Umum"
      description="Identitas usaha, penomoran dokumen, dan hal lain yang diatur sekali lalu ditinggal."
      icon={Wrench}
    />
  );
}
