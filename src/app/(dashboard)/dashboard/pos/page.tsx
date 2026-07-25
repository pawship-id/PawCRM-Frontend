import type { Metadata } from "next";
import { SectionPlaceholder } from "@/features/dashboard";
import { PosIcon } from "@/components/icons";

export const metadata: Metadata = { title: "POS · PawShip" };

export default function PosPage() {
  return (
    <SectionPlaceholder
      title="POS"
      description="Point of sale for walk-in purchases and checkout."
      icon={PosIcon}
    />
  );
}
