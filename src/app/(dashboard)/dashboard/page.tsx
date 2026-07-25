import type { Metadata } from "next";
import { DashboardOverview } from "@/features/dashboard";

export const metadata: Metadata = { title: "Dashboard · PawShip" };

export default function DashboardPage() {
  return <DashboardOverview />;
}
