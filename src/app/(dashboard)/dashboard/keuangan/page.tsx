import type { Metadata } from "next";
import { SectionPlaceholder } from "@/features/dashboard";
import { FinanceIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Keuangan · PawShip" };

export default function KeuanganPage() {
  return (
    <SectionPlaceholder
      title="Keuangan"
      description="Cash flow, expenses, and financial reporting."
      icon={FinanceIcon}
    />
  );
}
