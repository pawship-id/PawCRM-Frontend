import type { Metadata } from "next";

import { HelpFaqScreen } from "@/features/help";

export const metadata: Metadata = { title: "Tanya jawab · Panduan · Buloo" };

export default function HelpFaqPage() {
  return <HelpFaqScreen />;
}
