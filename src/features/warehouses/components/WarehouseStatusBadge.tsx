import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * A shadcn Badge for a warehouse's state. Deletion is a separate axis from
 * active/inactive (see warehouse.model.js): an inactive warehouse still owns its
 * stock and history, a deleted one is hidden and restorable — so a soft-deleted
 * warehouse shows a neutral "Terhapus" badge instead of its active state.
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
    ? { label: "Terhapus", className: "bg-tint-neutral text-muted" }
    : isActive
      ? { label: "Aktif", className: "bg-tint-success text-success" }
      : { label: "Nonaktif", className: "bg-tint-danger text-danger" };

  return (
    <Badge variant="outline" className={cn("border-transparent", className)}>
      {label}
    </Badge>
  );
}
