import type { Metadata } from "next";

import { InitialDataScreen } from "@/features/settings";

export const metadata: Metadata = { title: "Data Awal · Pengaturan · Buloo" };

/**
 * UNGATED for the same reason the Umum hub is: each step reads the grant its own
 * destination enforces and says "tidak bisa dilihat" where the reader holds
 * none. The checklist itself is a description of the setup order, which is not
 * privileged information — the numbers on it are, and those are gated one by
 * one.
 */
export default function InitialDataPage() {
  return <InitialDataScreen />;
}
