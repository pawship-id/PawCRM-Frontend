import type { Metadata } from "next";
import { SectionPlaceholder } from "@/features/dashboard";
import { BranchIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Branch · Master Data · PawShip" };

export default function MasterBranchesPage() {
  return (
    <SectionPlaceholder
      title="Branch"
      description="Manage clinic and store locations."
      icon={BranchIcon}
    />
  );
}
