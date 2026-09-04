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
  /*
    RED, like a till sale, because the goods leave either way — but its own
    label, because a stock card is read to answer "where did this go". Folding it
    under "Penjualan" would make "how much went out over the counter" a question
    the card cannot answer.
  */
  invoice_sale: { label: "Faktur penjualan", tone: "bg-danger/10 text-danger" },
  // Green, because the goods come back in — but its own label rather than
  // "Retur customer", which means a customer brought something back. Nothing
  // came back here: the invoice is being unwound because it should not have been
  // issued. The same distinction `pos_void` draws.
  invoice_void: { label: "Batal faktur", tone: "bg-success/12 text-success" },
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

/**
 * The badge for a type this build has never heard of.
 *
 * WHY THIS EXISTS, and it was paid for: the backend's `MOVEMENT_TYPES` and this
 * file's `MovementType` are two lists, and NOTHING checks that they agree. When
 * `invoice_sale` shipped on the server, the union here still had ten types — so
 * TypeScript was satisfied, the label lookup returned `undefined`, and
 * destructuring it threw. A stock card that contained one such row **white-
 * screened the whole page**.
 *
 * A ledger row is a fact that already happened. Refusing to draw the entire card
 * because one row is unfamiliar is the worst possible response to it: the reader
 * loses the ten rows this build understands perfectly well. Showing the raw enum
 * in a neutral badge is legible enough to act on and impossible to crash on.
 */
const UNKNOWN_TONE = "bg-tint-neutral text-muted";

export function MovementBadge({ type }: { type: MovementType }) {
  const { label, tone } = LABELS[type] ?? { label: type, tone: UNKNOWN_TONE };

  return (
    <Badge variant="outline" className={cn("border-transparent", tone)}>
      {label}
    </Badge>
  );
}
