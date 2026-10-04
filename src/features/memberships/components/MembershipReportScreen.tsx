"use client";

import { useEffect, useState } from "react";

import { Alert, Card, FilterDateRange, Spinner, StatTile } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/services/api-error";
import { membershipService } from "@/services/membership.service";
import type { MembershipReport } from "@/types/membership";

import { formatDate, formatRupiah } from "../labels";

/**
 * Laporan Membership — what the packages brought in, and what they gave away.
 *
 * ─── THE ONE QUESTION IT EXISTS FOR ────────────────────────────────────────
 *
 * A package is sold once and honoured for a year, so "did it make money" cannot
 * be read off revenue alone. It is revenue set against the benefits spent, and
 * the second half is only answerable because every redemption recorded what it
 * was worth at the time.
 *
 * ─── AND THE ONE IT MAKES VISIBLE BY ACCIDENT ──────────────────────────────
 *
 * The benefit table is built from the redemption ledger, so a benefit NOBODY
 * HAS EVER USED has no row in it. That absence is not a gap — it is the finding:
 * a benefit nobody spends was either worthless to customers or unknown to
 * whoever is on the till, and neither shows up in revenue. The caption under the
 * table says so, because an empty row is easy to read as "nothing happened".
 */
export function MembershipReportScreen() {
  const [range, setRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  const [report, setReport] = useState<MembershipReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    membershipService
      .report({
        dateFrom: range.from || undefined,
        dateTo: range.to || undefined,
      })
      .then((result) => {
        if (live) setReport(result);
      })
      .catch((err) => {
        if (!live) return;
        setReport(null);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat laporan membership.",
        );
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [range]);

  return (
    <div className="flex flex-col gap-6">
      <FilterDateRange
        label="Periode"
        from={range.from}
        to={range.to}
        onApply={(next) => setRange({ from: next.from, to: next.to })}
      />

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size={24} />
        </div>
      ) : !report ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Kartu terjual" value={String(report.summary.cards)} />
            <StatTile
              label="Nilai paket terjual"
              value={formatRupiah(report.summary.revenue)}
            />
            <StatTile
              label="Benefit yang diberikan"
              value={formatRupiah(report.summary.benefitValue)}
            />
            {/*
              NOT CALLED "LABA". It is what came in less what the benefits cost
              at list price, and it ignores the cost of actually doing those
              baths — which the ledger knows and this report does not. A tile
              headed "Laba" would be taken to an accountant.
            */}
            <StatTile
              label="Selisih (belum dikurangi biaya kerja)"
              value={formatRupiah(report.summary.margin)}
            />
          </div>

          <Card
            title="Per paket"
            description="Diurutkan dari yang paling banyak terjual."
          >
            {report.plans.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                Belum ada kartu terjual pada periode ini.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paket</TableHead>
                    <TableHead className="text-right">Kartu</TableHead>
                    <TableHead className="text-right">Nilai terjual</TableHead>
                    <TableHead className="text-right">Benefit dipakai</TableHead>
                    <TableHead className="text-right">Nilai diberikan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.plans.map((row) => (
                    <TableRow key={row.planId}>
                      {/*
                        THE NAME THE CARD WAS SOLD UNDER, not the catalogue's
                        today — a package renamed last month would otherwise
                        re-label every card it ever sold.
                      */}
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.cards}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(row.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.benefitsUsed}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(row.benefitValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card
            title="Per benefit"
            description="Seberapa sering tiap benefit benar-benar dipakai."
          >
            {report.benefits.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                Belum ada benefit yang dipakai pada periode ini.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Benefit</TableHead>
                    <TableHead>Paket</TableHead>
                    <TableHead className="text-right">Dipakai</TableHead>
                    <TableHead className="text-right">Nilai</TableHead>
                    <TableHead>Terakhir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.benefits.map((row) => (
                    <TableRow key={`${row.planId}-${row.benefitId}`}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell>{row.planName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.used}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(row.value)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDate(row.lastUsedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <p className="mt-4 text-sm text-muted">
              Benefit yang <strong>tidak muncul di sini sama sekali</strong>
              {" "}belum pernah dipakai seorang pun. Itu temuan, bukan kekosongan
              data: benefit yang tak pernah dipakai berarti tidak menarik bagi
              pelanggan, atau tidak diketahui orang di kasir.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
