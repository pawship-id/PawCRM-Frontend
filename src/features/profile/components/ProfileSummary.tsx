"use client";

import { useAuth } from "@/features/auth";
import type { User } from "@/types/api";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function branchScope(user: User): string {
  if (user.allBranches) return "All branches";
  const count = user.branchAccess.length;
  if (count === 0) return "No branch assigned";
  return `${count} branch${count === 1 ? "" : "es"}`;
}

/** Read-only account facts that the user cannot edit here. */
export function ProfileSummary() {
  const { user } = useAuth();
  if (!user) return null;

  const rows: Array<{ label: string; value: string }> = [
    { label: "Email", value: user.email },
    {
      label: "Status",
      value: user.status === "active" ? "Active" : "Suspended",
    },
    { label: "Branch access", value: branchScope(user) },
    { label: "Last sign-in", value: formatDate(user.lastLoginAt) },
    { label: "Member since", value: formatDate(user.createdAt) },
  ];

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            {row.label}
          </dt>
          <dd className="text-sm text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
