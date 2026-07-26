import type { Metadata } from "next";

import { Card } from "@/components";
import { UserCreateForm } from "@/features/users";

export const metadata: Metadata = { title: "New user · Master Data · PawShip" };

export default function NewUserPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Create User</h1>
        <p className="mt-1 text-sm text-muted">
          Add a new staff account with its role and branch access.
        </p>
      </div>

      <Card>
        <UserCreateForm />
      </Card>
    </div>
  );
}
