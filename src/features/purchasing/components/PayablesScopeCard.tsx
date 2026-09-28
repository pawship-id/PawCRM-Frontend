"use client";

import { ScopePeriodCard } from "@/components";
import type { Branch } from "@/types/api";

import type { PayablesSummaryQuery } from "../hooks/usePayablesSummary";

/**
 * The Pembelian › Ringkasan scope row — the shared card, wearing this module's
 * own words.
 *
 * THE CARD ITSELF MOVED to `components/ScopePeriodCard` on 29 September 2026,
 * when Penjualan › Ringkasan was asked for the same row (ui-rules §14: promote
 * on the second caller, do not copy). What is left here is the part that is
 * genuinely purchasing's: which dates the range bounds.
 *
 * THE TWO CONTROLS STILL NARROW DIFFERENT THINGS — the cabang scopes everything,
 * both cards and both worklists, while the period touches only "Hutang terbayar"
 * because the other two cards are balances. The line that used to say so under
 * the row was dropped on request; the caption on each card is where that now
 * lives, beside the figure it is about.
 *
 * "Tanggal bayar", NOT "Tanggal faktur": the identical-looking control on the
 * Faktur Pembelian tab bounds the day the VENDOR issued a bill; here it bounds
 * the day money moved.
 */
export function PayablesScopeCard({
  query,
  branches,
  onChange,
}: {
  query: PayablesSummaryQuery;
  branches: Branch[];
  onChange: (patch: Partial<PayablesSummaryQuery>) => void;
}) {
  return (
    <ScopePeriodCard
      branchId={query.branchId}
      branches={branches}
      onBranchChange={(branchId) => onChange({ branchId })}
      period={query.period}
      onPeriodChange={(period) => onChange({ period })}
      dateFrom={query.dateFrom}
      dateTo={query.dateTo}
      onDateRangeChange={({ from, to }) =>
        onChange({ dateFrom: from, dateTo: to })
      }
      dateLabel="Tanggal bayar"
    />
  );
}
