import type { Metadata } from "next";
import { BranchesScreen } from "@/features/branches";

export const metadata: Metadata = { title: "Branch · Master Data · PawShip" };

export default function MasterBranchesPage() {
  return <BranchesScreen />;
}
