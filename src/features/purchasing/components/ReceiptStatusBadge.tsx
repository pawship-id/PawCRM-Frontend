import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GoodsReceiptStatus } from "@/types/api";

/**
 * Whether the goods are on the shelf yet. Amber while `pending` — nothing is
 * posted, so stock and the payable do not include this delivery — and green
 * once `received`.
 */
const STATUS: Record<GoodsReceiptStatus, { label: string; tone: string }> = {
  pending: {
    label: "belum diterima",
    tone: "bg-secondary/25 text-secondary-foreground",
  },
  received: { label: "diterima", tone: "bg-success/15 text-success" },
};

export function ReceiptStatusBadge({ status }: { status: GoodsReceiptStatus }) {
  const { label, tone } = STATUS[status];

  return (
    <Badge variant="outline" className={cn("border-transparent", tone)}>
      {label}
    </Badge>
  );
}
