import type { Metadata } from "next";
import { UsersScreen } from "@/features/users";

export const metadata: Metadata = { title: "User · Master Data · PawShip" };

export default function MasterUsersPage() {
  return <UsersScreen />;
}
