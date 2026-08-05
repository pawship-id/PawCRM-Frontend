import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SupplierType } from "@/types/purchasing";

/**
 * How the tenant works with this supplier — and it is not cosmetic, because it
 * decides whether receiving their goods creates a debt at all.
 *
 * Consignment is amber rather than neutral for that reason: those goods sit in
 * the warehouse looking exactly like owned stock, and the one visual cue that
 * they are not is this badge.
 */
const LABELS: Record<SupplierType, { label: string; tone: string }> = {
  beli_putus: { label: "beli putus", tone: "bg-accent text-muted" },
  konsinyasi: {
    label: "konsinyasi",
    tone: "bg-secondary/25 text-secondary-foreground",
  },
  both: { label: "keduanya", tone: "bg-primary/12 text-primary-hover" },
};

export function SupplierTypeBadge({ type }: { type: SupplierType }) {
  const { label, tone } = LABELS[type];

  return (
    <Badge variant="outline" className={cn("border-transparent", tone)}>
      {label}
    </Badge>
  );
}
