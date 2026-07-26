import type { Metadata } from "next";

import { Card } from "@/components";
import { RoleCreateForm } from "@/features/roles";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "New role · Master Data · PawShip" };

export default function NewRolePage() {
  return (
    <RequirePermission feature="roles" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Create Role</h1>
          <p className="mt-1 text-sm text-muted">
            Add a new role and choose the permissions it grants.
          </p>
        </div>

        <Card>
          <RoleCreateForm />
        </Card>
      </div>
    </RequirePermission>
  );
}
