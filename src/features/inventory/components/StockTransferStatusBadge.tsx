import { Badge } from "@/components/ui/badge";
import type { StockTransferStatus } from "@/types/inventory";

/**
 * Where a transfer is in its life, in the words a storekeeper uses.
 *
 * THE LABEL IS THE STATE OF THE GOODS, not the API's word: "Belum diterima" says
 * the boxes are on the road and the transfer can still be corrected, which is
 * the one thing somebody looking at this badge needs to know before reaching for
 * the edit button.
 *
 * Tones follow the convention the other badges here use — a pale tint, an ink
 * that clears 4.5:1 and a transparent border — and every one carries a WORD, so
 * status is never colour alone (ui-rules §1.3, §9). Orange is `warning`, the one
 * orange that may be text: it is the state that asks a human to act.
 */
const STATES: Record<StockTransferStatus, { label: string; tone: string }> = {
  in_transit: {
    label: "Belum diterima",
    tone: "bg-tint-warning text-warning",
  },
  received: { label: "Diterima", tone: "bg-tint-success text-success" },
  cancelled: { label: "Dibatalkan", tone: "bg-tint-neutral text-muted" },
};

export function StockTransferStatusBadge({
  status,
}: {
  status: StockTransferStatus;
}) {
  // A status this build has never heard of must not white-screen a list of
  // transfers — the same lesson MovementBadge paid for. Said as the raw word.
  const state = STATES[status] ?? { label: status, tone: "bg-tint-neutral text-muted" };

  return (
    <Badge variant="outline" className={`border-transparent ${state.tone}`}>
      {state.label}
    </Badge>
  );
}
