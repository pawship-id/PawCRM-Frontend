"use client";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";
import type {
  CustomerInvoiceListSummary,
  CustomerInvoiceStatusFilter,
} from "@/types/api";

/**
 * The four cards over the Penjualan list, in the order a reader asks: how much
 * did we sell, how much is still owed, how much of that is late, how much came
 * in.
 *
 * TWO OF THEM FOLLOW THE TABLE AND TWO DO NOT — see `getListSummary` on the
 * server. Omzet and Tertagih are what the rows below add up to, under every
 * filter. Belum lunas and Lewat jatuh tempo are balances, narrowed only by the
 * cabang / gudang scope: a July debt is still owed while the table shows
 * September.
 *
 * THE TWO BALANCE CARDS ARE BUTTONS. Clicking one shows exactly the invoices
 * behind its number — see `ReceivablesScreen`'s drill, which also lifts the date
 * range, because a card counting every late invoice over a table showing only
 * this month's would be two numbers nobody can reconcile.
 *
 * A FAILED SUMMARY IS A DASH, never "Rp 0" — zero is a confident answer to a
 * question that was never answered.
 */
export function InvoiceStatCards({
  summary,
  failed,
  onDrill,
}: {
  summary: CustomerInvoiceListSummary | null;
  failed: boolean;
  onDrill: (statuses: CustomerInvoiceStatusFilter[], label: string) => void;
}) {
  const overdueCount = summary?.overdue.invoiceCount ?? 0;
  const collectedCount = summary?.collected.invoiceCount ?? 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Omzet periode"
        value={summary && formatMoney(summary.revenue.amount)}
        caption={summary && `${summary.revenue.invoiceCount} faktur`}
        failed={failed}
      />
      <StatCard
        label="Belum lunas"
        value={summary && formatMoney(summary.outstanding.amount)}
        caption={summary && `${summary.outstanding.invoiceCount} faktur`}
        failed={failed}
        onClick={() => onDrill(["unpaid", "partial"], "belum lunas")}
      />
      <StatCard
        label="Lewat jatuh tempo"
        value={summary && `${overdueCount} faktur`}
        caption={summary && formatMoney(summary.overdue.amount)}
        failed={failed}
        tone={overdueCount > 0 ? "danger" : "plain"}
        onClick={() => onDrill(["overdue"], "lewat jatuh tempo")}
      />
      <StatCard
        label="Tertagih"
        value={summary && formatMoney(summary.collected.amount)}
        caption={summary && `dari ${collectedCount} faktur`}
        failed={failed}
        tone={collectedCount > 0 ? "success" : "plain"}
      />
    </div>
  );
}

/**
 * One figure. THE TONE COLOURS THE NUMBER, never the card: a red panel in a row
 * of four turns a dashboard into an alarm, and a red numeral says the same thing
 * while the row stays scannable.
 */
function StatCard({
  label,
  value,
  caption,
  failed,
  tone = "plain",
  onClick,
}: {
  label: string;
  /** Null while loading or after a failure. */
  value: string | null;
  caption: string | null;
  failed: boolean;
  tone?: "plain" | "danger" | "success";
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-extrabold tabular-nums text-foreground",
          tone === "danger" && "text-danger-ink",
          tone === "success" && "text-success",
        )}
      >
        {value ?? "—"}
      </p>
      <p className="mt-1 text-xs text-muted tabular-nums">
        {failed ? "gagal dimuat" : (caption ?? "—")}
      </p>
    </>
  );

  const frame = "rounded-xl border border-border bg-surface p-5 text-left shadow-sm";

  if (!onClick) {
    return <div className={frame}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        frame,
        "transition outline-none hover:-translate-y-px hover:shadow-md",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
      )}
    >
      {body}
    </button>
  );
}
