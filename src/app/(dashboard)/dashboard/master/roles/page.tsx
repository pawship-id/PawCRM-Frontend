import type { Metadata } from "next";
import { SectionPlaceholder } from "@/features/dashboard";
import { RolesIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Roles · Master Data · PawShip" };

export default function MasterRolesPage() {
  return (
    <SectionPlaceholder
      title="Roles"
      description="Define roles and the permissions attached to them."
      icon={RolesIcon}
    />
  );
}
