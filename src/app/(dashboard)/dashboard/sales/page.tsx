import type { Metadata } from "next";
import { SectionPlaceholder } from "@/features/dashboard";
import { SalesIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Sales & Invoice · PawShip" };

export default function SalesPage() {
  return (
    <SectionPlaceholder
      title="Sales & Invoice"
      description="Revenue reporting and customer invoices."
      icon={SalesIcon}
    />
  );
}
