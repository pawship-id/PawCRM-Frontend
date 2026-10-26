import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * The lifecycle badge for a customer (active / inactive / deleted, see the
 * model) — a single combined badge, the same shape `BranchStatusBadge` uses,
 * now that a customer has the same `isActive`/`deletedAt` pair a branch does
 * (2 October 2026). It applies the brand tint tokens over the outline badge
 * (ui-rules §9).
 */

/**
 * Terhapus beats Nonaktif beats Aktif — the three states `deletedAt` and
 * `isActive` can combine into, mirroring `BranchStatusBadge` exactly now that
 * a customer carries the same pair (2 October 2026). "Terhapus" is its own
 * word rather than folded into "Nonaktif": a soft-deleted customer was
 * removed and is restorable, not one somebody switched off and can flip back
 * with a checkbox — the two have different remedies and read differently.
 *
 * `isActive === false` IS THE ONLY WAY TO BE NONAKTIF, never its absence. The
 * field is missing entirely on a customer written before it existed (`.lean()`
 * skips Mongoose defaults — see `customer.model.js`), and a customer older
 * than the feature reading as "Nonaktif" the day it ships would be a mass,
 * silent deactivation nobody asked for. `isCustomerActive()` below is the one
 * place that resolves it; nothing else should compare `isActive` directly.
 */
export function isCustomerActive(customer: {
  isActive?: boolean;
}): boolean {
  return customer.isActive !== false;
}

export function CustomerStatusBadge({
  isActive,
  deleted,
}: {
  /** Absent reads as active — see `isCustomerActive`. */
  isActive?: boolean;
  deleted: boolean;
}) {
  const { label, className } = deleted
    ? { label: "Terhapus", className: "bg-tint-neutral text-muted" }
    : isCustomerActive({ isActive })
      ? { label: "Aktif", className: "bg-tint-success text-success" }
      : { label: "Nonaktif", className: "bg-tint-danger text-danger" };

  return (
    <Badge variant="outline" className={cn("border-transparent", className)}>
      {label}
    </Badge>
  );
}
