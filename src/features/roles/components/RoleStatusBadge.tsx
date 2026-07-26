import { Badge } from "@/components/ui/badge";
import type { Role } from "@/types/api";

/**
 * Status badges for a role. Deletion, "system" and "super admin" are orthogonal
 * axes rather than one status, so a role can show more than one — a deleted
 * badge alongside a system badge. Mirrors the users StatusBadge tinting: a brand
 * feedback token applied as a className over the outline badge.
 */
export function RoleStatusBadge({ role }: { role: Role }) {
  const deleted = role.deletedAt != null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {deleted && (
        <Badge
          variant="outline"
          className="border-transparent bg-muted/40 text-muted"
        >
          Deleted
        </Badge>
      )}
      {role.isSuperAdmin && (
        <Badge
          variant="outline"
          className="border-transparent bg-success/12 text-success"
        >
          Super admin
        </Badge>
      )}
      {role.isSystem && (
        <Badge
          variant="outline"
          className="border-transparent bg-primary/10 text-primary"
        >
          System
        </Badge>
      )}
    </div>
  );
}
