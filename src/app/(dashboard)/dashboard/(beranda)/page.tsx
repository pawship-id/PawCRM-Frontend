import type { Metadata } from "next";

import { BerandaHariIni } from "@/features/dashboard";

export const metadata: Metadata = { title: "Beranda · Buloo" };

/** Beranda › Hari Ini — from `buloo-navigation-v3`. */
export default function BerandaPage() {
  return <BerandaHariIni />;
}
