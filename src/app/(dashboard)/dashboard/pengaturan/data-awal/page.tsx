import type { Metadata } from "next";
import { Rocket } from "lucide-react";

import { SectionPlaceholder } from "@/features/dashboard";

export const metadata: Metadata = { title: "Data Awal · Buloo" };

export default function DataAwalPage() {
  return (
    <SectionPlaceholder
      title="Data Awal"
      description="Angka pembuka sebelum Buloo mulai mencatat: stok, saldo kas, piutang, dan utang pada tanggal mulai."
      icon={Rocket}
    />
  );
}
