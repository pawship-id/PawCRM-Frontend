import type { Metadata } from "next";
import { BranchesScreen } from "@/features/branches";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Branch · Master Data · PawShip" };

export default function MasterBranchesPage() {
  return (
    <RequirePermission feature="branches">
      <BranchesScreen />
    </RequirePermission>
  );
}
