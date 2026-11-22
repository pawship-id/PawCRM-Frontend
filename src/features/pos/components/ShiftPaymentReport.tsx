"use client";

import "../print/receipt.css";

import type { PosShift, PosTransaction, PosXReport } from "@/types/api";
import {
  formatMoney,
  isPositive,
  subtractDecimals,
  sumDecimals,
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

interface ItemRow {
  key: string;
  name: string;
  sku: string | null;
  qty: string;
  total: string;
}

const DATE_TIME = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const QTY = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

const at = (iso: string | null) => (iso ? DATE_TIME.format(new Date(iso)) : "—");

/**
 * A decimal as a string, whether it came as one or as Mongo's
 * `{ $numberDecimal }` (a corrected sale's `originalItems` are stored Mixed).
 */
function decimalOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "$numberDecimal" in value) {
    return String((value as { $numberDecimal: unknown }).$numberDecimal);
  }
  return "0";
}

/**
 * Every line the shift sold, added up per item (19 November 2026): what was
 * bought, how many, and for how much.
 *
 * THE TOTAL IS THE LINE AFTER ITS OWN DISCOUNT (manual, promo, membership —
 * `discount.resolvedAmount` holds them all). A cart-level discount and other
 * charges belong to the basket, not to any one item, so they are not spread
 * here; the payment figures above are where the money adds up.
 *
 * A SALE CORRECTED FROM ITS FAKTUR COUNTS ITS ORIGINAL LINES. The shift keeps
 * the figures it took that day (BO, 18 November 2026) — the X-Report above
 * does — so the items have to be the ones behind those figures, not the
 * corrected lines whose difference went to the faktur as piutang.
 */
function itemsSold(sales: PosTransaction[]): ItemRow[] {
  const rows = new Map<string, ItemRow>();

  for (const sale of sales) {
    const lines = sale.correction?.originalItems ?? sale.items ?? [];

    for (const item of lines) {
      const key = `${item.kind}:${item.refId}`;
      const qty = decimalOf(item.qty);
      const net = subtractDecimals(
        decimalOf(item.lineTotal),
        decimalOf(item.discount?.resolvedAmount),
      );
      const row = rows.get(key);

      if (row) {
        row.qty = sumDecimals([row.qty, qty]);
        row.total = sumDecimals([row.total, net]);
      } else {
        rows.set(key, {
          key,
          name: item.name,
          sku: item.sku,
          qty,
          total: net,
        });
      }
    }
  }

  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "id"));
}

/**
 * Laporan shift kasir — what Tutup Kasir prints (17 November 2026; isinya
 * diganti 19 November 2026).
 *
 * THE X-REPORT ON PAPER, then the items: the same figures the X-Report dialog
 * shows (gross, returns, net; per payment method; the drawer), read from the
 * same `/x-report`, followed by every item the shift's paid sales bought.
 *
 * Printed through the browser like the struk's Unduh PDF, so it is a "save as
 * PDF" for the owner's archive as much as a printout.
 */
export function ShiftPaymentReport({ data }: { data: ShiftReportData }) {
  const { shift, report } = data;
  const items = data.sales ? itemsSold(data.sales) : [];
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
          <p className="text-lg font-bold">LAPORAN SHIFT KASIR</p>
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
      </dl>

      {offline.length > 0 && (
        <p className="mt-4 border border-black px-3 py-2 text-xs font-semibold">
          Perhatian: masih ada penjualan offline yang belum terkirim (
          {offline.map((d) => `${d.name ?? d.code}: ${d.count}`).join(", ")}),
          belum termasuk di laporan ini.
        </p>
      )}

      {/* The X-Report dialog, line for line. */}
      <section className="mt-6 space-y-4 text-xs">
        <dl className="space-y-1">
          <Line label="Transaksi">{report.transactionCount}</Line>
          <Line label="Penjualan kotor">
            {formatMoney(report.totals.takings)}
          </Line>
          {isPositive(report.refunds.total ?? "0") && (
            <Line label={`Retur (${report.refunds.returnCount ?? 0})`}>
              −{formatMoney(report.refunds.total ?? "0")}
            </Line>
          )}
          <Line label="Penjualan bersih" bold>
            {formatMoney(report.totals.netSales ?? report.totals.takings)}
          </Line>
        </dl>

        <div>
          <p className="mb-1 font-bold">Per metode bayar</p>
          {report.breakdown.length === 0 ? (
            <p className="text-neutral-600">Belum ada pembayaran.</p>
          ) : (
            <dl className="space-y-1">
              {report.breakdown.map((row) => (
                <Line key={row.channelId} label={row.channelName}>
                  {formatMoney(row.netAfterRefunds ?? row.net)}
                  {isPositive(row.refunded ?? "0") && (
                    <span className="block text-neutral-600">
                      {formatMoney(row.net)} − retur{" "}
                      {formatMoney(row.refunded ?? "0")}
                    </span>
                  )}
                </Line>
              ))}
            </dl>
          )}
        </div>

        <dl className="space-y-1 border-t border-black pt-2">
          <Line label="Saldo awal">{formatMoney(shift.openingCash)}</Line>
          {report.refunds.count > 0 && (
            <Line label={`Retur tunai (${report.refunds.count})`}>
              −{formatMoney(report.refunds.cashRefunds)}
            </Line>
          )}
          <Line label="Penjualan tunai bersih">
            {formatMoney(report.totals.cashTakings)}
          </Line>
          <Line label="Kas seharusnya" bold>
            {formatMoney(report.totals.expectedCash)}
          </Line>
        </dl>
      </section>

      <h2 className="mt-6 text-sm font-bold">Item terjual</h2>
      {data.sales === null ? (
        <p className="mt-2 text-xs text-neutral-600">
          Daftar item tidak bisa dimuat untuk akun ini. Ringkasan di atas tetap
          lengkap.
        </p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-xs text-neutral-600">
          Tidak ada item terjual di shift ini.
        </p>
      ) : (
        <>
          <table className="mt-2 w-full table-fixed border-collapse text-xs">
            <colgroup>
              <col className="w-[6%]" />
              <col />
              <col className="w-[12%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead>
              <tr className="border-y border-black">
                <Th className="text-left">No</Th>
                <Th className="text-left">Item</Th>
                <Th>Qty</Th>
                <Th>Total</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.key} className="border-b border-neutral-300">
                  <td className="py-1 pr-2 align-top tabular-nums">
                    {index + 1}
                  </td>
                  <td className="py-1 pr-2 align-top">
                    {item.name}
                    {item.sku && (
                      <span className="block text-neutral-600">{item.sku}</span>
                    )}
                  </td>
                  <Num>{QTY.format(Number(item.qty))}</Num>
                  <Num>{formatMoney(item.total)}</Num>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-y border-black font-bold">
                <td colSpan={3} className="py-1.5 pr-2 text-right">
                  Total item
                </td>
                <Num>{formatMoney(sumDecimals(items.map((i) => i.total)))}</Num>
              </tr>
            </tfoot>
          </table>
          <p className="mt-1.5 text-xs text-neutral-600">
            Total per item sudah dipotong diskon item. Diskon keranjang dan
            biaya lain tidak dibagi ke item.
          </p>
        </>
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

function Line({
  label,
  bold = false,
  children,
}: {
  label: string;
  bold?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? "font-bold" : ""}`}>
      <dt className={bold ? "" : "text-neutral-700"}>{label}</dt>
      <dd className="shrink-0 text-right tabular-nums">{children}</dd>
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
