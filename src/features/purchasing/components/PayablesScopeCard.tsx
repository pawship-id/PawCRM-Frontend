"use client";

import { ScopeFilterCard } from "@/components";
import { Button } from "@/components/ui/button";
import type { Branch } from "@/types/api";

import {
  DEFAULT_PAYABLES_QUERY,
  type PayablesSummaryQuery,
} from "../hooks/usePayablesSummary";

/**
 * The Pembelian › Ringkasan scope row — the shared card, wearing this module's
 * own words.
 *
 * THE CARD ITSELF IS `components/ScopeFilterCard` since 12 October 2026 (on
 * request) — the row Penjualan and Inventori wear, so the cabang takes several.
 * What is left here is the part that is genuinely purchasing's: which dates the
 * range bounds, and what Reset returns to.
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
  /*
    WHAT "RESET FILTER" COUNTS AND PUTS BACK (12 October 2026, on request) —
    the same button the Penjualan tabs wear. The period counts only off this
    tab's default, Bulan ini, which is where Reset returns it.
  */
  const filterCount =
    (query.branchIds.length > 0 ? 1 : 0) +
    (query.period !== DEFAULT_PAYABLES_QUERY.period ? 1 : 0);

  return (
    <ScopeFilterCard
      branches={branches}
      branchIds={query.branchIds}
      onScopeChange={({ branchIds }) => onChange({ branchIds })}
      period={{
        value: query.period,
        /* Leaving Custom drops the typed dates: a named period carries its
           own, and stale ones would travel beside it. */
        onChange: (period) =>
          onChange(
            period === "custom"
              ? { period }
              : { period, dateFrom: "", dateTo: "" },
          ),
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        onDateRangeChange: ({ from, to }) =>
          onChange({ dateFrom: from, dateTo: to }),
        dateLabel: "Tanggal bayar",
      }}
      trailing={
        filterCount > 0 ? (
          <Button
            type="button"
            variant="link"
            className="min-h-11 px-0"
            onClick={() =>
              onChange({
                branchIds: [],
                period: DEFAULT_PAYABLES_QUERY.period,
                dateFrom: "",
                dateTo: "",
              })
            }
          >
            Reset filter ({filterCount})
          </Button>
        ) : undefined
      }
    />
  );
}
