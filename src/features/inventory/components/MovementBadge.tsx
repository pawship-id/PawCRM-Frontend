import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MovementType } from "@/types/inventory";

/**
 * A movement type, rendered in the vocabulary staff actually use rather than
 * the ledger's enum value.
 *
 * The colours carry meaning: green brings goods IN, red takes them OUT, and
 * amber is a correction — an adjustment or an opname difference, the two types
 * that may go either way. A reader scanning a stock card should be able to tell
 * direction before reading the number.
 */
const LABELS: Record<MovementType, { label: string; tone: string }> = {
  receipt: { label: "Penerimaan", tone: "bg-success/12 text-success" },
  customer_return: { label: "Retur customer", tone: "bg-success/12 text-success" },
  transfer_in: { label: "Transfer masuk", tone: "bg-secondary/25 text-secondary-foreground" },
  pos_sale: { label: "Penjualan", tone: "bg-danger/10 text-danger" },
  // Green, because the goods come back in — but its own label rather than
  // "Retur customer", which means a customer brought something back. Nothing
  // came back here: the sale is being unwound because it should not have
  // happened, and a stock card that conflated the two would make "what do
  // customers actually return" unanswerable.
  pos_void: { label: "Batal penjualan", tone: "bg-success/12 text-success" },
  purchase_return: { label: "Retur supplier", tone: "bg-danger/10 text-danger" },
  transfer_out: { label: "Transfer keluar", tone: "bg-secondary/25 text-secondary-foreground" },
  bundle_consume: { label: "Bundle consume", tone: "bg-danger/10 text-danger" },
  opname_diff: { label: "Selisih opname", tone: "bg-primary/12 text-primary-hover" },
  adjustment: { label: "Penyesuaian", tone: "bg-primary/12 text-primary-hover" },
  // Green, because it brings goods in — but its own label rather than
  // "Penerimaan", which means a purchase. This is the stock a tenant already
  // owned on its first day, and the distinction is the whole reason it stopped
  // being an "adjustment": its journal credits capital, not an inventory loss.
  opening_balance: { label: "Saldo awal", tone: "bg-success/12 text-success" },
};

export function MovementBadge({ type }: { type: MovementType }) {
  const { label, tone } = LABELS[type];

  return (
    <Badge variant="outline" className={cn("border-transparent", tone)}>
      {label}
    </Badge>
  );
}
