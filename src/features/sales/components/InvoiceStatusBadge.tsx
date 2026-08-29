import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CustomerInvoiceStatus } from "@/types/api";

/**
 * Where a receivable stands, as a chip.
 *
 * ONE DEFINITION FOR BOTH SALES SCREENS — the list and the detail. The payables
 * module learned this the hard way: the tone and label maps were written out
 * twice, which is how a "sebagian" chip ends up amber on one screen and grey on
 * the other, a difference a reader interprets as meaning something.
 *
 * `unpaid` IS RED, not neutral. Money owed to the shop that has not arrived is
 * the subject of this screen; a receivables list whose default state looks calm
 * buries its own point. It is a tint rather than a border because it is not an
 * error — it is the ordinary state of a bill just issued.
 *
 * `void` IS GREY, AND IT IS THE ONE STATUS THE PAYABLE DOES NOT HAVE. A voided
 * sale owes nothing, so it must not read as a debt at any glance-distance —
 * neither red (still owed) nor green (settled), because it was neither.
 *
 * OVERDUE IS NOT A STATUS and is not shown here. It is a fact about the due date
 * — the server sends `isOverdue` separately — and folding it in would create a
 * fifth chip that cannot coexist with `partial`, when in truth a part-paid
 * invoice is very often the late one. The table marks lateness on the due date,
 * where a reader is already looking to find out when.
 */
const TONE: Record<CustomerInvoiceStatus, string> = {
  unpaid: "bg-danger/10 text-danger",
  partial: "bg-secondary/25 text-secondary-foreground",
  paid: "bg-success/12 text-success",
  void: "bg-tint-neutral text-muted",
};

const LABEL: Record<CustomerInvoiceStatus, string> = {
  unpaid: "belum dibayar",
  partial: "dp sebagian",
  paid: "lunas",
  void: "void",
};

export function InvoiceStatusBadge({
  status,
}: {
  status: CustomerInvoiceStatus;
}) {
  return (
    <Badge variant="outline" className={cn("border-transparent", TONE[status])}>
      {LABEL[status]}
    </Badge>
  );
}

/**
 * WHO RAISED THE DEBT — manual, or issued automatically by the till.
 *
 * A SEPARATE CHIP FROM THE STATUS, never merged into it: they answer different
 * questions and change independently. A bridged invoice can be in any of the
 * four states, and "where did this come from" is asked when a figure looks
 * unfamiliar, not when deciding who to chase.
 *
 * Both tones are quiet. Neither origin is better or more urgent than the other;
 * colouring one would suggest otherwise.
 */
export function InvoiceSourceBadge({ source }: { source: "manual" | "pos_bridge" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        source === "pos_bridge"
          ? "bg-tint-brand text-primary"
          : "bg-tint-neutral text-muted",
      )}
    >
      {source === "pos_bridge" ? "dari kasir" : "manual"}
    </Badge>
  );
}
