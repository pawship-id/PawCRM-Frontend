"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { posService } from "@/services/pos.service";
import type { PageResult, PosTransaction } from "@/types/api";
import { formatMoney } from "@/utils/decimal";

/** How many rows the profile shows. The rest live in the till's own list. */
const ROWS = 5;

/** "03 Sep 2026 · 14:02" — a sale is a moment, not a day. */
function when(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return `${date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} · ${date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Days since a date, for the "berapa lama tidak datang" line. */
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * What this customer has actually bought — the mockup's "Riwayat" section.
 *
 * SETTLED TILL SALES, because that is the record that exists for every visit. An
 * invoice is raised only when a sale goes on account, so a list built from
 * receivables would miss the regular who pays cash every Saturday — which is most
 * of them. `status: "paid"` leaves out held baskets (a cart somebody parked is not
 * a visit) and voided sales (a visit that was cancelled and would otherwise be
 * counted twice, once as a sale and once as its reversal).
 *
 * THE COUNT COMES FROM THE PAGER, NOT FROM THE ROWS. Five rows are fetched and
 * `pagination.total` still reports every settled sale this person has ever made,
 * so "Total transaksi" is a true figure on a section that only draws the recent
 * handful. The same trick useRegistryCounts plays for the header tiles.
 *
 * NO ROW LINKS. There is no per-transaction page in the dashboard to open — the
 * till's own screen is the only place a sale can be inspected — and a link that
 * went nowhere useful would be worse than a plain row.
 *
 * Gated by the profile on `posTransactions:read`.
 */
export function CustomerHistorySection({ customerId }: { customerId: string }) {
  const [page, setPage] = useState<PageResult<PosTransaction> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    posService
      .listTransactions({ customerId, status: "paid", page: 1, limit: ROWS })
      .then((result) => {
        if (!active) return;
        setPage(result);
        setError(null);
      })
      .catch(() => {
        if (active) setError("Riwayat transaksi pelanggan ini tidak bisa dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted">
        <Spinner /> Memuat riwayat…
      </div>
    );
  }

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!page) return null;

  const rows = page.items;
  const latest = rows[0]?.paidAt ?? null;

  if (rows.length === 0) {
    return (
      /* §12's empty state: say what is missing, not "no data". */
      <p className="py-6 text-sm text-muted">
        Belum ada transaksi kasir yang tercatat untuk pelanggan ini.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Kunjungan terakhir</dt>
          <dd className="text-sm text-foreground">
            {when(latest)}
            {latest && (
              <span className="text-muted"> · {daysSince(latest)} hari lalu</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Total transaksi</dt>
          <dd className="text-sm tabular-nums text-foreground">
            {page.pagination.total} transaksi kasir
          </dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Nomor</TableHead>
              <TableHead>Kegiatan</TableHead>
              <TableHead className="text-right">Nilai</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((transaction) => (
              <TableRow key={transaction._id}>
                <TableCell className="whitespace-nowrap">
                  {when(transaction.paidAt)}
                </TableCell>
                <TableCell>
                  {transaction.transactionNumber ? (
                    <span className="tabular-nums text-foreground">
                      {transaction.transactionNumber}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </TableCell>
                {/*
                  WHAT WAS BOUGHT, IN ONE LINE — the first item and a count of the
                  rest. The basket in full belongs on a receipt; here the question
                  is only "what did they come in for".
                */}
                <TableCell>{basketLabel(transaction)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(transaction.totals?.grandTotal ?? null)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {page.pagination.total > rows.length && (
        <p className="text-xs text-muted">
          Menampilkan {rows.length} transaksi terbaru dari{" "}
          {page.pagination.total}.
        </p>
      )}

      <div
        aria-disabled="true"
        className="flex items-center gap-2 text-xs text-muted opacity-70"
      >
        <Badge variant="outline" className="font-normal">
          Segera
        </Badge>
        Booking dan jadwal layanan belum ikut di urutan waktu ini — untuk sekarang
        riwayat per hewan ada di profil hewannya.
      </div>
    </div>
  );
}

/** "Basic Grooming + 2 item lain", or a dash when the basket came back empty. */
function basketLabel(transaction: PosTransaction): React.ReactNode {
  const [first, ...rest] = transaction.items;
  if (!first) return <span className="text-muted">—</span>;

  return (
    <span className="text-foreground">
      {first.name}
      {rest.length > 0 && (
        <span className="text-muted"> + {rest.length} item lain</span>
      )}
    </span>
  );
}
