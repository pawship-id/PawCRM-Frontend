import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * A shadcn Badge for a branch's state. Deletion is a separate axis from
 * active/inactive (see branch.model.js), so a soft-deleted branch shows a
 * neutral "Terhapus" badge instead of its active state. The brand feedback tokens
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
