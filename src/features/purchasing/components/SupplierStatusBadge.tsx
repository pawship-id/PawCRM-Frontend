import { Badge } from "@/components/ui/badge";
import { isSupplierActive } from "@/types/api";
import type { Supplier } from "@/types/api";

/**
 * A supplier's lifecycle state, in one badge.
 *
 * TWO INDEPENDENT AXES COLLAPSED FOR DISPLAY ONLY. A supplier can be deleted,
 * deactivated, both, or neither; the badge shows the more consequential one
 * first, because "terhapus" already implies the vendor is unavailable while
 * "nonaktif" says nothing about whether the record still exists.
 *
 * An active, live supplier gets NO badge. A column where every ordinary row
 * shouts "aktif" is a column nobody reads, and the two states worth noticing
 * would then be lost among them.
 */
export function SupplierStatusBadge({
  supplier,
}: {
  supplier: Pick<Supplier, "isActive" | "deletedAt">;
}) {
  if (supplier.deletedAt !== null) {
    return (
      <Badge variant="outline" className="border-danger/40 text-danger">
        terhapus
      </Badge>
    );
  }

  if (!isSupplierActive(supplier)) {
    return <Badge variant="outline">nonaktif</Badge>;
  }

  return null;
}
