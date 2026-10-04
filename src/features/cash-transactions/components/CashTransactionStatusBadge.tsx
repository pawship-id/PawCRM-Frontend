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
  showPosted = true,
  className,
}: {
  transaction: Pick<CashTransaction, "status" | "recordedVia">;
  /**
   * `false` DROPS THE "Tercatat" CHIP and keeps "Dibatalkan" — for the list,
   * whose Status column went on 20 September 2026. The list hides the cancelled
   * rows by default, so a chip on every row would say "this one is not one of
   * the ones that are not here", which is nothing. The exception still needs its
   * word, and the detail page leaves this alone: there a single transaction is
   * being read, and "Tercatat" is the answer to a question somebody has.
   */
  showPosted?: boolean;
  className?: string;
}) {
  const voided = transaction.status === "void";
  const till = transaction.recordedVia === "pos";

  // Nothing to say — no empty span for a layout to leave a gap around.
  if (!voided && !till && !showPosted) return null;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {(voided || showPosted) && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
            voided ? "bg-tint-neutral text-muted" : "bg-tint-success text-success",
          )}
        >
          {voided ? "Dibatalkan" : "Tercatat"}
        </span>
      )}
      {till && (
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
