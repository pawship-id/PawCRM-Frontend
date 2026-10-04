"use client";

import { StatTile } from "@/components";
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
 * THE TWO BALANCE CARDS ARE BUTTONS WHEN `onDrill` IS GIVEN. Clicking one shows
 * exactly the invoices behind its number — see `ReceivablesScreen`'s drill,
 * which also lifts the date range, because a card counting every late invoice
 * over a table showing only this month's would be two numbers nobody can
 * reconcile. THE RINGKASAN TAB OMITS `onDrill` (1 October 2026): it carries no
 * invoice table of its own to drill into, so the two balance cards render as
 * plain figures there, same as Omzet and Tertagih always have.
 *
 * A FAILED SUMMARY IS A DASH, never "Rp 0" — zero is a confident answer to a
 * question that was never answered.
 *
 * BUILT ON THE SHARED `<StatTile>` (2 October 2026) — this used to carry its
 * own `StatCard`, which is where Penjualan's cards picked up an `uppercase`
 * label and a `rounded-xl` shell that Pembelian's (built straight on
 * `StatTile`) never had. Moving onto the same tile is the fix, not a rule to
 * remember next to a second implementation — see ui-rules §2.
 */
export function InvoiceStatCards({
  summary,
  failed,
  onDrill,
}: {
  summary: CustomerInvoiceListSummary | null;
  failed: boolean;
  onDrill?: (statuses: CustomerInvoiceStatusFilter[], label: string) => void;
}) {
  const loading = !summary && !failed;
  const overdueCount = summary?.overdue.invoiceCount ?? 0;
  const collectedCount = summary?.collected.invoiceCount ?? 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Omzet periode"
        value={summary ? formatMoney(summary.revenue.amount) : "—"}
        caption={summary ? `${summary.revenue.invoiceCount} faktur` : undefined}
        loading={loading}
        error={failed}
      />
      <StatTile
        label="Belum lunas"
        value={summary ? formatMoney(summary.outstanding.amount) : "—"}
        caption={
          summary ? `${summary.outstanding.invoiceCount} faktur` : undefined
        }
        loading={loading}
        error={failed}
        onClick={
          onDrill ? () => onDrill(["unpaid", "partial"], "belum lunas") : undefined
        }
      />
      <StatTile
        label="Lewat jatuh tempo"
        value={summary ? `${overdueCount} faktur` : "—"}
        caption={summary ? formatMoney(summary.overdue.amount) : undefined}
        loading={loading}
        error={failed}
        tone={overdueCount > 0 ? "danger" : "plain"}
        onClick={onDrill ? () => onDrill(["overdue"], "lewat jatuh tempo") : undefined}
      />
      <StatTile
        label="Tertagih"
        value={summary ? formatMoney(summary.collected.amount) : "—"}
        caption={summary ? `dari ${collectedCount} faktur` : undefined}
        loading={loading}
        error={failed}
        tone={collectedCount > 0 ? "success" : "plain"}
      />
    </div>
  );
}
