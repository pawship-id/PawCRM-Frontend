import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { User } from "@/types/api";

/**
 * A shadcn Badge for a user's account status. Deletion is a separate axis from
 * status, so a soft-deleted row shows a neutral "Terhapus" badge instead. The
 * brand feedback tokens are applied as a className tint over the outline badge.
 */
export function StatusBadge({
  status,
  deleted = false,
}: {
  status: User["status"];
  deleted?: boolean;
}) {
  const { label, className } = deleted
    ? { label: "Terhapus", className: "bg-muted/40 text-muted" }
    : status === "active"
      ? { label: "Aktif", className: "bg-success/12 text-success" }
      : { label: "Ditangguhkan", className: "bg-danger/12 text-danger" };

  return (
    <Badge variant="outline" className={cn("border-transparent", className)}>
      {label}
    </Badge>
  );
}
