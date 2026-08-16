import type { Metadata } from "next";

import { FinanceDashboardScreen } from "@/features/accounting";

export const metadata: Metadata = { title: "Keuangan · Buloo" };

export default function KeuanganPage() {
  return <FinanceDashboardScreen />;
}
