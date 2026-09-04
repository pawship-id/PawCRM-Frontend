import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/utils/date";

/**
 * How long a lot has left, as a countdown rather than a date.
 *
 * "30 Jun 2027" requires the reader to do the subtraction; "18 hari" is the
 * answer they were actually looking for. The date is still available as the
 * tooltip for anyone reconciling against a physical label.
 *
 * ALREADY-EXPIRED LOTS READ AS NEGATIVE, deliberately, and in the loudest
 * colour. Stock that expired last week and is still sellable on the shelf is
 * the most urgent thing this module can tell anybody, and rounding it to "0
 * hari" would hide exactly how long it has been wrong.
 */
export function ExpiryBadge({ date }: { date: string }) {
  const days = daysUntil(date);

  const tone =
    days < 0
      ? "bg-danger text-danger-foreground"
      : days < 7
        ? "bg-danger/12 text-danger"
        : days < 30
          ? "bg-secondary/30 text-secondary-foreground"
          : "bg-success/12 text-success";

  const label =
    days < 0 ? `lewat ${Math.abs(days)} hari` : `${days} hari`;

  return (
    <Badge
      variant="outline"
      title={new Date(date).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })}
      className={cn("border-transparent tabular-nums", tone)}
    >
      {label}
    </Badge>
  );
}
