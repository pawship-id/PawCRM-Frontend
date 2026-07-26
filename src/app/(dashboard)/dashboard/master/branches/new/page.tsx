import type { Metadata } from "next";

import { Card } from "@/components";
import { BranchCreateForm } from "@/features/branches";

export const metadata: Metadata = {
  title: "New branch · Master Data · PawShip",
};

export default function NewBranchPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Create Branch
        </h1>
        <p className="mt-1 text-sm text-muted">
          Add a new clinic or store location.
        </p>
      </div>

      <Card>
        <BranchCreateForm />
      </Card>
    </div>
  );
}
