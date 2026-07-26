import type { Metadata } from "next";
import { RolesScreen } from "@/features/roles";

export const metadata: Metadata = { title: "Roles · Master Data · PawShip" };

export default function MasterRolesPage() {
  return <RolesScreen />;
}
