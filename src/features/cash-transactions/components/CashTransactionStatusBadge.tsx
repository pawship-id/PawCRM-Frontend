import { cn } from "@/lib/utils";
import type { CashTransaction } from "@/types/api";

/**
 * Tercatat / Dibatalkan, and a "Kasir" hint for money taken at the till.
 *
 * Always a word (§9): a cancelled row keeps its colour muted, but the badge is
 * what says so. "Dibatalkan", never "void" — the API's word stays in the API.
 */
export function CashTransactionStatusBadge({
  transaction,
  className,
}: {
  transaction: Pick<CashTransaction, "status" | "recordedVia">;
  className?: string;
}) {
  const voided = transaction.status === "void";

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
          voided ? "bg-tint-neutral text-muted" : "bg-tint-success text-success",
        )}
      >
        {voided ? "Dibatalkan" : "Tercatat"}
      </span>
      {transaction.recordedVia === "pos" && (
        <span
          className="rounded-full bg-tint-brand px-2 py-0.5 text-xs font-medium whitespace-nowrap text-primary"
          title="Dicatat di kasir"
        >
          Kasir
        </span>
      )}
    </span>
  );
}
