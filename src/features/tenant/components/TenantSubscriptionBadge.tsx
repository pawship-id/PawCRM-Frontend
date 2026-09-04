import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { TenantSubscription } from "@/types/api";

/**
 * A shadcn Badge for a tenant's subscription status, tinted with the brand
 * feedback tokens the same way BranchStatusBadge is.
 *
 * The three unhappy states are deliberately NOT collapsed into one "inactive"
 * colour: `past_due` is a bill to pay and recoverable in a minute, `suspended`
 * means the service is already withheld, and `cancelled` is the end of the
 * relationship. An owner reading this screen is asking which of those they are
 * in, so the caution tone and the danger tone say different things here.
 *
 * The palette has no dedicated `warning` token, so `past_due` uses the peach
 * `secondary` — the same "attention, not alarm" tone ExpiryBadge and
 * OpnameStatusBadge already use for their caution states.
 */
const STATUS_STYLES: Record<
  TenantSubscription["status"],
  { label: string; className: string }
> = {
  trialing: { label: "Trial", className: "bg-primary/12 text-primary" },
  active: { label: "Active", className: "bg-success/12 text-success" },
  past_due: {
    label: "Past due",
    className: "bg-secondary/25 text-secondary-foreground",
  },
  suspended: { label: "Suspended", className: "bg-danger/12 text-danger" },
  cancelled: { label: "Cancelled", className: "bg-muted/40 text-muted" },
};

export function TenantSubscriptionBadge({
  status,
}: {
  status: TenantSubscription["status"];
}) {
  // An unknown status is shown verbatim rather than dropped: a plan state the
  // backend added and this table has not caught up with should be visible, not
  // silently rendered as nothing.
  const { label, className } = STATUS_STYLES[status] ?? {
    label: status,
    className: "bg-muted/40 text-muted",
  };

  return (
    <Badge variant="outline" className={cn("border-transparent", className)}>
      {label}
    </Badge>
  );
}
