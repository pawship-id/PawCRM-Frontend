import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * A shadcn Badge for a branch's state. Deletion is a separate axis from
 * active/inactive (see branch.model.js), so a soft-deleted branch shows a
 * neutral "Deleted" badge instead of its active state. The brand feedback tokens
 * are applied as a className tint over the outline badge — matching StatusBadge
 * in the users feature.
 */
export function BranchStatusBadge({
  isActive,
  deleted = false,
}: {
  isActive: boolean;
  deleted?: boolean;
}) {
  const { label, className } = deleted
    ? { label: "Deleted", className: "bg-muted/40 text-muted" }
    : isActive
      ? { label: "Active", className: "bg-success/12 text-success" }
      : { label: "Inactive", className: "bg-danger/12 text-danger" };

  return (
    <Badge variant="outline" className={cn("border-transparent", className)}>
      {label}
    </Badge>
  );
}
