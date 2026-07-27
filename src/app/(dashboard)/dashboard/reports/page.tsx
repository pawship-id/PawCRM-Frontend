import type { Metadata } from "next";
import { SectionPlaceholder } from "@/features/dashboard";
import { ReportsIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Reports · PawShip" };

export default function ReportsPage() {
  return (
    <SectionPlaceholder
      title="Reports"
      description="Business insights and analytics across sales, inventory, and services."
      icon={ReportsIcon}
    />
  );
}
