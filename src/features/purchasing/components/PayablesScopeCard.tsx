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
 * genuinely purchasing's: which dates the range bounds, and the line saying what
 * each control narrows.
 *
 * THE TWO CONTROLS NARROW DIFFERENT THINGS, which is why the note is not
 * boilerplate. The cabang scopes everything — both cards and both worklists —
 * while the period touches ONE card, because the other two are balances and a
 * balance has no period.
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
      note={
        <>
          Cabang menyaring semuanya; periode hanya membatasi kartu{" "}
          <b className="font-semibold">Hutang terbayar</b> — dua kartu lainnya
          saldo berjalan, yang tidak punya periode.
        </>
      }
    />
  );
}
