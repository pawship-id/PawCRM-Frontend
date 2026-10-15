import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GoodsReceiptLineStatus, GoodsReceiptStatus } from "@/types/api";

/**
 * Whether the goods are on the shelf yet. Amber while something is still
 * expected — `pending` (nothing posted) and `partial` (some lines, or part of a
 * line, posted) — green once everything is `received`, neutral when the
 * delivery was `closed` short and the rest will never come.
 */
const STATUS: Record<GoodsReceiptStatus, { label: string; tone: string }> = {
  pending: {
    label: "belum diterima",
    tone: "bg-secondary/25 text-secondary-foreground",
  },
  partial: { label: "diterima sebagian", tone: "bg-tint-warning text-warning" },
  received: { label: "diterima", tone: "bg-success/15 text-success" },
  closed: { label: "ditutup", tone: "bg-tint-neutral text-muted" },
};

export function ReceiptStatusBadge({ status }: { status: GoodsReceiptStatus }) {
  const { label, tone } = STATUS[status] ?? STATUS.received;

  return (
    <Badge variant="outline" className={cn("border-transparent", tone)}>
      {label}
    </Badge>
  );
}

/** Where one line stands — the receiving page and the detail table. */
const LINE_STATUS: Record<
  GoodsReceiptLineStatus,
  { label: string; tone: string }
> = {
  pending: { label: "belum", tone: "bg-tint-neutral text-muted" },
  partial: { label: "sebagian", tone: "bg-tint-warning text-warning" },
  received: { label: "lengkap", tone: "bg-tint-success text-success" },
  cancelled: { label: "dibatalkan sisanya", tone: "bg-tint-danger text-danger" },
};

export function ReceiptLineStatusBadge({
  status,
}: {
  status: GoodsReceiptLineStatus;
}) {
  const { label, tone } = LINE_STATUS[status] ?? LINE_STATUS.pending;

  return (
    <Badge
      variant="outline"
      className={cn("border-transparent whitespace-nowrap", tone)}
    >
      {label}
    </Badge>
  );
}
