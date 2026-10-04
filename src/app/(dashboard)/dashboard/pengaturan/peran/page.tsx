import type { Metadata } from "next";
import { RolesScreen } from "@/features/roles";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Peran · Pengaturan · Buloo" };

export default function MasterRolesPage() {
  return (
    <RequirePermission feature="roles">
      <RolesScreen />
    </RequirePermission>
  );
}
