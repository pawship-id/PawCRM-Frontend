import type { Metadata } from "next";
import { UsersScreen } from "@/features/users";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "User · Master Data · PawShip" };

export default function MasterUsersPage() {
  return (
    <RequirePermission feature="users">
      <UsersScreen />
    </RequirePermission>
  );
}
