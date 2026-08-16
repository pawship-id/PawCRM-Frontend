import type { Metadata } from "next";

import { AccountingHub } from "@/features/accounting";

export const metadata: Metadata = { title: "Keuangan · Buloo" };

export default function KeuanganPage() {
  return <AccountingHub />;
}
