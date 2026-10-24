"use client";

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";

import { Alert } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  changePct,
  formatPercent,
  marginPct,
  previousPeriod,
  profitLossHeadline,
  type ProfitLossHeadline,
} from "@/features/accounting/financeSummary";
import { cn } from "@/lib/utils";
import { journalEntryService } from "@/services/journalEntry.service";
import { formatMoney, sumDecimals } from "@/utils/decimal";

import { useBerandaScope } from "./BerandaShell";
import { Panel } from "./parts";
import { useRemote } from "./useRemote";

interface BranchRow {
  id: string;
  name: string;
  now: ProfitLossHeadline;
  before: ProfitLossHeadline | null;
}

/**
 * Beranda › Cabang — the laba rugi side by side, one row per cabang.
 *
 * ONE READ PER CABANG. The profit-loss endpoint splits its columns by business
 * line, not by branch, so each row is that endpoint asked for one cabang — the
 * same statement Laba Rugi renders for it. A shop has a handful of cabang;
 * a tenant with dozens would want a per-branch column on the server instead.
 *
 * "TUMBUH" IS OMZET AGAINST THE PERIOD BEFORE — the month before for a whole
 * month, else the same length immediately before (`previousPeriod`). On
 * "Semua" there is no before, and the column says "—".
 */
export function BerandaCabang() {
  const { branches, branchIds, dateFrom, dateTo } = useBerandaScope();

  const picked = useMemo(
    () =>
      branchIds.length
        ? branches.filter((branch) => branchIds.includes(branch._id))
        : branches,
    [branches, branchIds],
  );

  const prior = previousPeriod(dateFrom, dateTo);

  const statement = useRemote(
    ["cabang", picked.map((b) => b._id).join(","), dateFrom, dateTo].join("|"),
    () =>
      Promise.all(
        picked.map(async (branch): Promise<BranchRow> => {
          const [now, before] = await Promise.all([
            journalEntryService.profitLoss({
              dateFrom: dateFrom || undefined,
              dateTo: dateTo || undefined,
              branchIds: [branch._id],
            }),
            prior
              ? journalEntryService
                  .profitLoss({ ...prior, branchIds: [branch._id] })
                  .catch(() => null)
              : Promise.resolve(null),
          ]);
          return {
            id: branch._id,
            name: branch.name,
            now: profitLossHeadline(now),
            before: before ? profitLossHeadline(before) : null,
          };
        }),
      ),
    picked.length > 0,
  );

  const rows = useMemo(() => statement.data ?? [], [statement.data]);

  const total = useMemo(() => {
    const sum = (pick: (h: ProfitLossHeadline) => string) =>
      sumDecimals(rows.map((row) => pick(row.now)));
    return {
      revenue: sum((h) => h.netRevenue),
      hpp: sum((h) => h.hpp),
      gross: sum((h) => h.grossProfit),
      cost: sum((h) => h.operatingExpense),
      net: sum((h) => h.netProfit),
    };
  }, [rows]);

  /* The thinnest margin — the mockup's callout, said only when there is a
     comparison to make. */
  const thinnest = useMemo(() => {
    const ranked = rows
      .map((row) => ({ row, margin: row.now.marginPct }))
      .filter((r): r is { row: BranchRow; margin: number } => r.margin !== null)
      .sort((a, b) => a.margin - b.margin);
    return ranked.length >= 2 ? ranked[0] : null;
  }, [rows]);

  if (statement.failed) {
    return (
      <Alert variant="error">
        Laba rugi per cabang tidak bisa dimuat. Coba muat ulang halaman.
      </Alert>
    );
  }

  const costShare = (cost: string, revenue: string) =>
    formatPercent(marginPct(cost, revenue));

  return (
    <div className="flex flex-col gap-6">
      {thinnest && (
        <div className="rounded-xl border border-border border-l-4 border-l-secondary bg-tint-warning px-4 py-3">
          <p className="font-bold text-foreground">
            {thinnest.row.name} menipis
          </p>
          <p className="mt-0.5 text-sm text-foreground">
            Margin bersihnya {formatPercent(thinnest.margin)}, terendah dari{" "}
            {rows.length} cabang. Biayanya{" "}
            {costShare(thinnest.row.now.operatingExpense, thinnest.row.now.netRevenue)}{" "}
            dari omzet, dibanding rata-rata {costShare(total.cost, total.revenue)}.
          </p>
        </div>
      )}

      <Panel icon={BarChart3} title="Laba rugi per cabang" tag="Periode berjalan">
        {statement.loading ? (
          <p className="py-6 text-center text-sm text-muted">Memuat…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cabang</TableHead>
                  <TableHead className="text-right">Omzet</TableHead>
                  <TableHead className="text-right">HPP</TableHead>
                  <TableHead className="text-right">Laba kotor</TableHead>
                  <TableHead className="text-right">Biaya</TableHead>
                  <TableHead className="text-right">Laba bersih</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Tumbuh</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const growth = row.before
                    ? changePct(row.now.netRevenue, row.before.netRevenue)
                    : null;
                  const margin = row.now.marginPct;
                  const loss = row.now.netProfit.startsWith("-");
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-bold">{row.name}</TableCell>
                      <Money value={row.now.netRevenue} />
                      <Money value={row.now.hpp} />
                      <Money value={row.now.grossProfit} />
                      <Money value={row.now.operatingExpense} />
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          loss && "font-semibold text-danger",
                        )}
                      >
                        {formatMoney(row.now.netProfit)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                            margin === null
                              ? "bg-tint-neutral text-muted"
                              : margin >= 15
                                ? "bg-tint-success text-success"
                                : margin >= 5
                                  ? "bg-tint-warning text-warning"
                                  : "bg-tint-danger text-danger",
                          )}
                        >
                          {formatPercent(margin)}
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          growth === null
                            ? "text-muted"
                            : growth >= 0
                              ? "text-success"
                              : "text-danger",
                        )}
                      >
                        {growth === null
                          ? "—"
                          : `${growth >= 0 ? "↗" : "↘"} ${Math.abs(growth).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-extrabold">Total</TableCell>
                  <Money value={total.revenue} strong />
                  <Money value={total.hpp} strong />
                  <Money value={total.gross} strong />
                  <Money value={total.cost} strong />
                  <Money value={total.net} strong />
                  <TableCell className="text-right font-extrabold tabular-nums">
                    {formatPercent(marginPct(total.net, total.revenue))}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          Omzet di sini sudah dikurangi diskon dan retur — sama dengan
          pendapatan di Laba Rugi.
        </p>
      </Panel>
    </div>
  );
}

function Money({ value, strong = false }: { value: string; strong?: boolean }) {
  return (
    <TableCell
      className={cn("text-right tabular-nums", strong && "font-extrabold")}
    >
      {formatMoney(value)}
    </TableCell>
  );
}
