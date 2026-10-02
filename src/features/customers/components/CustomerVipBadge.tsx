import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { VipTier } from "@/types/api";

/**
 * Badges for a customer row. A customer has two independent axes — its VIP tier
 * (a marketing tag, usually absent) and its lifecycle state (active / inactive /
 * deleted, see the model) — so they are two separate badges. The lifecycle one
 * is a single combined badge, the same shape `BranchStatusBadge` uses, now that
 * a customer has the same `isActive`/`deletedAt` pair a branch does (2 October
 * 2026). Both apply the brand tint tokens over the outline badge (ui-rules §9).
 */

const TIER_STYLES: Record<VipTier, string> = {
  bronze: "bg-secondary text-secondary-foreground",
  silver: "bg-muted/60 text-foreground",
  gold: "bg-accent text-accent-foreground",
  platinum: "bg-primary/12 text-primary",
};

const TIER_LABELS: Record<VipTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

/** The customer's VIP tier, or a muted dash when they have none. */
export function CustomerVipBadge({ tier }: { tier: VipTier | null }) {
  if (!tier) return <span className="text-muted-foreground">—</span>;

  return (
    <Badge
      variant="outline"
      className={cn("border-transparent capitalize", TIER_STYLES[tier])}
    >
      {TIER_LABELS[tier]}
    </Badge>
  );
}

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
