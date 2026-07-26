import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { VipTier } from "@/types/api";

/**
 * Badges for a customer row. A customer has two independent axes — its VIP tier
 * (a marketing tag, usually absent) and whether it is soft-deleted — so they are
 * two separate badges rather than the single combined one the Branch feature uses
 * (a branch's active/deleted states ARE mutually exclusive). Both apply the brand
 * tokens as a className tint over the outline badge, matching BranchStatusBadge.
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

/** Whether the customer is live or soft-deleted (restorable). */
export function CustomerStatusBadge({ deleted }: { deleted: boolean }) {
  const { label, className } = deleted
    ? { label: "Deleted", className: "bg-muted/40 text-muted" }
    : { label: "Active", className: "bg-success/12 text-success" };

  return (
    <Badge variant="outline" className={cn("border-transparent", className)}>
      {label}
    </Badge>
  );
}
