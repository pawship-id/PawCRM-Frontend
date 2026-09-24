import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { BranchAccessScreen } from "@/features/users";

export const metadata: Metadata = { title: "Akses Cabang · Pengaturan · Buloo" };

export default function BranchAccessPage() {
  return (
    <RequirePermission feature="users">
      <BranchAccessScreen />
    </RequirePermission>
  );
}
