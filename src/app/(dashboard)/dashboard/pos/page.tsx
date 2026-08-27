import type { Metadata } from "next";

import { PosScreen } from "@/features/pos";

export const metadata: Metadata = { title: "Kasir · Buloo" };

export default function PosPage() {
  return <PosScreen />;
}
