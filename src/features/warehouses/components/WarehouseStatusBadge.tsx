import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * A shadcn Badge for a warehouse's state. Deletion is a separate axis from
 * active/inactive (see warehouse.model.js): an inactive warehouse still owns its
 * stock and history, a deleted one is hidden and restorable — so a soft-deleted
 * warehouse shows a neutral "Deleted" badge instead of its active state.
 * Mirrors BranchStatusBadge.
 */
export function WarehouseStatusBadge({
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
