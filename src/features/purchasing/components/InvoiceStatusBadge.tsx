import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/types/api";

/**
 * Where a payable stands, as a chip.
 *
 * ONE DEFINITION FOR BOTH PAYABLES SCREENS. The tone and label maps were
 * previously written out in the list and again in the detail, which is how a
 * "sebagian" chip ends up amber on one screen and grey on the other — a
 * difference a reader interprets as meaning something.
 *
 * `unpaid` IS RED, not neutral, and that is a deliberate reading of the domain:
 * an unpaid bill is money the tenant owes and has not yet moved. It is not an
 * error, so the tone is a tint rather than a border, but a payables screen whose
 * default state looks calm buries its own subject.
 *
 * OVERDUE IS NOT A STATUS and is not shown here. It is a fact about the due date
 * — the server sends `isOverdue` separately — and folding it in would create a
 * fourth chip that cannot coexist with `partial`, when in truth a partly-paid
 * bill is very often the late one. The table marks lateness on the due date,
 * where a reader is already looking to find out when.
 */
const TONE: Record<InvoiceStatus, string> = {
  unpaid: "bg-danger/10 text-danger",
  partial: "bg-secondary/25 text-secondary-foreground",
  paid: "bg-success/12 text-success",
};

const LABEL: Record<InvoiceStatus, string> = {
  unpaid: "belum dibayar",
  partial: "sebagian",
  paid: "lunas",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", TONE[status])}>
      {LABEL[status]}
    </Badge>
  );
}
