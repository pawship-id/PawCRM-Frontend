"use client";

import "../print/receipt.css";

import type { PosShift, PosTransaction, PosXReport } from "@/types/api";
import {
  formatMoney,
  isPositive,
  subtractDecimals,
  sumDecimals,
  toMinor,
} from "@/utils/decimal";

/**
 * Everything one shift's payment report is drawn from. Loaded by
 * `useShiftReportDownload`; nothing here fetches.
 */
export interface ShiftReportData {
  /** The shift as closed — its counts and differences are what it stored. */
  shift: PosShift;
  /** The same figures Tutup Kasir counted against (`/x-report`). */
  report: PosXReport;
  tenantName: string | null;
  branchName: string | null;
  cashierName: string | null;
  /**
   * The shift's paid sales, or null when they could not be read — a viewer
   * with `posShifts` but not `posTransactions` still gets the summary, and the
   * sheet says the list is missing rather than printing an empty one.
   */
  sales: PosTransaction[] | null;
  /** When the file was made — printed in the footer. */
  printedAt: string;
}

/** The drawer is one row whatever cash channels the shift used — as on Tutup Kasir. */
const CASH = "cash";

interface MethodRow {
  key: string;
  name: string;
  count: number;
  sales: string;
  refunded: string;
  expected: string;
  counted: string | null;
  difference: string | null;
}

const DATE_TIME = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const TIME = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
});

const at = (iso: string | null) => (iso ? DATE_TIME.format(new Date(iso)) : "—");
const timeOf = (iso: string | null) => (iso ? TIME.format(new Date(iso)) : "—");

/** "+Rp 5.000" for a surplus, "−Rp 5.000" for a shortfall, "Rp 0" when it matches. */
function signed(value: string | null): string {
  if (value === null) return "—";
  return isPositive(value) ? `+${formatMoney(value)}` : formatMoney(value);
}

/**
 * One row per payment method, the way Tutup Kasir counted them: the drawer as
 * one "Kas" row (its expected figure includes the opening float), every other
 * channel as its own, with what the shift stored as counted and the gap.
 */
function methodRows(shift: PosShift, report: PosXReport): MethodRow[] {
  const cashRows = report.breakdown.filter((row) => row.channelType === CASH);

  const cash: MethodRow = {
    key: CASH,
    name: "Kas",
    count: cashRows.reduce((sum, row) => sum + row.count, 0),
    sales: sumDecimals(cashRows.map((row) => row.net)),
    refunded: report.refunds.cashRefunds,
    expected: shift.expectedCash ?? report.totals.expectedCash,
    counted: shift.countedCash,
    difference: shift.difference,
  };

  const others = report.breakdown
    .filter((row) => row.channelType !== CASH)
    .map<MethodRow>((row) => {
      const stored = (shift.channelCounts ?? []).find(
        (count) => count.channelId === row.channelId,
      );

      return {
        key: row.channelId,
        name: row.channelName,
        count: row.count,
        sales: row.net,
        refunded: row.refunded ?? "0",
        expected: stored?.expected ?? row.netAfterRefunds ?? row.net,
        counted: stored?.counted ?? null,
        difference: stored?.difference ?? null,
      };
    });

  return [cash, ...others];
}

interface SaleLine {
  id: string;
  number: string | null;
  paidAt: string | null;
  customer: string | null;
  amount: string;
}

/**
 * The shift's sales grouped by the method that took the money — what a cashier
 * ticks off against the EDC batch or the QRIS dashboard. A split payment
 * appears under each method, with only that method's share.
 *
 * Change given is not takings: a cash line is what stayed in the drawer.
 */
function salesByMethod(
  sales: PosTransaction[],
  methods: MethodRow[],
): Array<{ method: MethodRow; lines: SaleLine[]; total: string }> {
  return methods
    .map((method) => {
      const lines = sales
        .map<SaleLine | null>((sale) => {
          const taken = sale.payments
            .filter((payment) =>
              method.key === CASH
                ? payment.channelType === CASH
                : payment.channelId === method.key,
            )
            .map((payment) =>
              subtractDecimals(payment.amount, payment.change ?? "0"),
            );
          const amount = sumDecimals(taken);

          return isPositive(amount)
            ? {
                id: sale._id,
                number: sale.transactionNumber,
                paidAt: sale.paidAt,
                customer: sale.customer?.name ?? null,
                amount,
              }
            : null;
        })
        .filter((line): line is SaleLine => line !== null)
        .sort((a, b) => (a.paidAt ?? "").localeCompare(b.paidAt ?? ""));

      return {
        method,
        lines,
        total: sumDecimals(lines.map((line) => line.amount)),
      };
    })
    .filter((group) => group.lines.length > 0);
}

/**
 * Laporan pembayaran kasir — one closed shift on A4 (17 November 2026).
 *
 * WHAT TUTUP KASIR COUNTED, ON PAPER: per payment method, what the books
 * expected, what the cashier counted and the gap, then the sales behind each
 * method. The counts and gaps are the ones the shift STORED when it closed; the
 * takings are recomputed by the x-report, the same source Tutup Kasir and
 * Laporan › Penjualan POS read, so the three cannot disagree.
 *
 * Printed through the browser like the struk's Unduh PDF, so it is a "save as
 * PDF" for the owner's archive as much as a printout.
 */
export function ShiftPaymentReport({ data }: { data: ShiftReportData }) {
  const { shift, report } = data;
  const methods = methodRows(shift, report);

  const total = (pick: (row: MethodRow) => string | null) => {
    const values = methods.map(pick);
    return values.every((value) => value === null)
      ? null
      : sumDecimals(values.map((value) => value ?? "0"));
  };

  const groups = data.sales ? salesByMethod(data.sales, methods) : [];
  const offline = (report.offlinePending ?? []).filter((d) => d.count > 0);

  return (
    <div
      data-receipt-sheet="a4"
      data-multi-page
      className="mx-auto w-full bg-white p-4 text-sm wrap-anywhere text-black sm:p-8"
    >
      <header className="flex flex-col gap-3 border-b-2 border-black pb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          {data.tenantName && (
            <p className="text-base font-bold">{data.tenantName}</p>
          )}
          {data.branchName && <p className="text-sm">{data.branchName}</p>}
        </div>
        <div className="sm:max-w-[50%] sm:shrink-0 sm:text-right">
          <p className="text-lg font-bold">LAPORAN PEMBAYARAN KASIR</p>
          <p className="text-sm font-semibold tabular-nums">
            {shift.shiftNumber}
          </p>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-1.5 text-xs sm:grid-cols-2">
        <Info label="Kasir">{data.cashierName ?? "—"}</Info>
        <Info label="Cabang">{data.branchName ?? "—"}</Info>
        <Info label="Dibuka">{at(shift.openedAt)}</Info>
        <Info label="Ditutup">
          {shift.status === "closed" ? at(shift.closedAt) : "Masih buka"}
        </Info>
        <Info label="Kas awal">{formatMoney(shift.openingCash)}</Info>
        <Info label="Jumlah transaksi">{report.transactionCount}</Info>
      </dl>

      {offline.length > 0 && (
        <p className="mt-4 border border-black px-3 py-2 text-xs font-semibold">
          Perhatian: masih ada penjualan offline yang belum terkirim (
          {offline.map((d) => `${d.name ?? d.code}: ${d.count}`).join(", ")}),
          belum termasuk di laporan ini.
        </p>
      )}

      <h2 className="mt-6 text-sm font-bold">Rekap per metode pembayaran</h2>
      <table className="mt-2 w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-black">
            <Th className="text-left">Metode</Th>
            <Th>Trx</Th>
            <Th>Penjualan</Th>
            <Th>Retur</Th>
            <Th>Seharusnya</Th>
            <Th>Dihitung</Th>
            <Th>Selisih</Th>
          </tr>
        </thead>
        <tbody>
          {methods.map((row) => (
            <tr key={row.key} className="border-b border-neutral-300">
              <td className="py-1.5 pr-2 align-top font-medium">{row.name}</td>
              <Num>{row.count}</Num>
              <Num>{formatMoney(row.sales)}</Num>
              <Num>
                {isPositive(row.refunded) ? `−${formatMoney(row.refunded)}` : "—"}
              </Num>
              <Num>{formatMoney(row.expected)}</Num>
              <Num>{row.counted === null ? "—" : formatMoney(row.counted)}</Num>
              <Num bold={row.difference !== null && toMinor(row.difference) !== 0n}>
                {signed(row.difference)}
              </Num>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-y border-black font-bold">
            <td className="py-1.5 pr-2">Total</td>
            <Num>{methods.reduce((sum, row) => sum + row.count, 0)}</Num>
            <Num>{formatMoney(total((row) => row.sales))}</Num>
            <Num>
              {isPositive(total((row) => row.refunded) ?? "0")
                ? `−${formatMoney(total((row) => row.refunded))}`
                : "—"}
            </Num>
            <Num>{formatMoney(total((row) => row.expected))}</Num>
            <Num>{formatMoney(total((row) => row.counted))}</Num>
            <Num>{signed(total((row) => row.difference))}</Num>
          </tr>
        </tfoot>
      </table>
      <p className="mt-1.5 text-xs text-neutral-600">
        &quot;Seharusnya&quot; untuk Kas sudah termasuk kas awal{" "}
        {formatMoney(shift.openingCash)}. Selisih plus berarti uang lebih, minus
        berarti kurang.
      </p>

      {report.refunds.count > 0 && (
        <p className="mt-3 text-xs">
          <span className="font-semibold">Retur:</span> {report.refunds.count}{" "}
          transaksi
          {report.refunds.total ? `, total ${formatMoney(report.refunds.total)}` : ""}
          .
        </p>
      )}

      {shift.closingNotes && (
        <div className="mt-3 text-xs">
          <p className="font-semibold">Catatan penutupan:</p>
          <p className="whitespace-pre-line">{shift.closingNotes}</p>
        </div>
      )}

      <h2 className="mt-6 text-sm font-bold">Daftar transaksi per metode</h2>
      {data.sales === null ? (
        <p className="mt-2 text-xs text-neutral-600">
          Daftar transaksi tidak bisa dimuat untuk akun ini. Rekap di atas tetap
          lengkap.
        </p>
      ) : groups.length === 0 ? (
        <p className="mt-2 text-xs text-neutral-600">
          Tidak ada transaksi di shift ini.
        </p>
      ) : (
        groups.map(({ method, lines, total: groupTotal }) => (
          <section key={method.key} className="mt-3">
            {/*
              FIXED COLUMNS, THE SAME IN EVERY METHOD'S TABLE, so the figures
              line up down the page instead of each table sizing to its own
              longest customer name.
            */}
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col className="w-[6%]" />
                <col className="w-[36%]" />
                <col className="w-[9%]" />
                <col />
                <col className="w-[17%]" />
              </colgroup>
              <thead>
                <tr>
                  <th
                    colSpan={5}
                    className="pb-1 text-left text-xs font-bold"
                  >
                    {method.name} · {lines.length} transaksi
                  </th>
                </tr>
                <tr className="border-y border-black">
                  <Th className="text-left">No</Th>
                  <Th className="text-left">No. transaksi</Th>
                  <Th className="text-left">Jam</Th>
                  <Th className="text-left">Pelanggan</Th>
                  <Th>Nominal</Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.id} className="border-b border-neutral-300">
                    <td className="py-1 pr-2 align-top tabular-nums">
                      {index + 1}
                    </td>
                    <td className="py-1 pr-2 align-top whitespace-nowrap tabular-nums">
                      {line.number ?? "—"}
                    </td>
                    <td className="py-1 pr-2 align-top whitespace-nowrap tabular-nums">
                      {timeOf(line.paidAt)}
                    </td>
                    <td className="py-1 pr-2 align-top">
                      {line.customer ?? "Pelanggan umum"}
                    </td>
                    <Num>{formatMoney(line.amount)}</Num>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td colSpan={4} className="py-1 pr-2 text-right">
                    Subtotal {method.name}
                  </td>
                  <Num>{formatMoney(groupTotal)}</Num>
                </tr>
              </tfoot>
            </table>
          </section>
        ))
      )}

      <footer className="mt-10 flex flex-wrap items-end justify-between gap-6 text-xs">
        <p className="text-neutral-600">Dicetak {at(data.printedAt)}</p>
        <div className="flex gap-8">
          <Signature label="Kasir" name={data.cashierName} />
          <Signature label="Diperiksa oleh" name={null} />
        </div>
      </footer>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-neutral-600">{label}</dt>
      <dd className="min-w-0 font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function Th({
  className = "text-right",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <th
      className={`py-1.5 pr-2 font-semibold whitespace-nowrap last:pr-0 ${className}`}
    >
      {children}
    </th>
  );
}

/** A figure cell: right-aligned and never broken mid-number. */
function Num({
  children,
  bold = false,
}: {
  children: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <td
      className={`py-1.5 pr-2 text-right align-top whitespace-nowrap tabular-nums last:pr-0 ${bold ? "font-bold" : ""}`}
    >
      {children}
    </td>
  );
}

function Signature({ label, name }: { label: string; name: string | null }) {
  return (
    <div className="w-40 text-center">
      <p>{label}</p>
      <div className="mt-12 border-t border-black pt-1">{name ?? " "}</div>
    </div>
  );
}
