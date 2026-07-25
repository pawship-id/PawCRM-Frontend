import type { Metadata } from "next";
import { SectionPlaceholder } from "@/features/dashboard";
import { UsersIcon } from "@/components/icons";

export const metadata: Metadata = { title: "User · Master Data · PawShip" };

export default function MasterUsersPage() {
  return (
    <SectionPlaceholder
      title="User"
      description="Manage staff accounts, their roles and branch access."
      icon={UsersIcon}
    />
  );
}
