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
 * both cards and both worklists, while the period narrows only `summary.paid`.
 * THAT FIGURE IS NO LONGER DRAWN, since `PayablesStatCards` replaced this tab's
 * own three-card row (2 October 2026, on request) with a four-card strip that
 * has no "money paid this period" card — see that component's own doc. The
 * period control stays regardless: nobody has asked for it to go, and it still
 * narrows the request this screen makes even though nothing on screen visibly
 * answers to it right now.
 *
 * "Tanggal bayar", NOT "Tanggal faktur": the identical-looking control on the
 * Faktur tab bounds the day the VENDOR issued a bill; here it bounds the day
 * money moved.
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
