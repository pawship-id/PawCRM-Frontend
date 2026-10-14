"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/features/permissions";
import type { Action, Feature } from "@/features/permissions/types";

import {
  consignmentSalesReport,
  posSalesReport,
  salesBatchReport,
  salesInvoiceReport,
  salesItemReport,
  salesRevenueReport,
} from "../salesReports";
import {
  agingReport,
  cashFlowReport,
  expenseReport,
  ledgerReport,
} from "../financeReports";
import { stockOnHandReport } from "../stockReports";
import { SalesReportDialog } from "./SalesReportDialog";

/**
 * The Laporan landing page, as the v3 mockup draws it: four tabs (Penjualan,
 * Keuangan, Inventori, Operasional), each a table of Laporan / Tujuan / action.
 * Reports that have no screen yet are listed and marked "Segera" rather than
 * left out, so the table of contents matches the mockup and the gap is visible.
 *
 * MOST OF THESE LINK SOMEWHERE THAT ALREADY EXISTS, and that is the design
 * rather than a shortcut. The stock card, the expiry list and the opname history
 * are full screens with their own filters and exports; building "report"
 * versions of them here would be the fastest possible way to end up with two
 * screens that answer the same question and slowly stop agreeing. Reports is a
 * table of contents for them plus the three that had no home.
 *
 * PERMISSIONS ARE PER CARD, not on the page. A groomer with `products:read` and
 * nothing else should see the stock reports and not the consignment one, so each
 * card names the grant its destination actually enforces — the same grant, not a
 * looser one, because a card that leads to a 403 is worse than no card.
 */

type TabKey = "penjualan" | "keuangan" | "inventori" | "operasional";

/*
  Each tab answers to its Laporan grant in the role editor (14 October 2026).
  Operasional has none: it holds "Komisi saya", which every staff member may
  read about themselves, so it is always there and its other rows are gated.
*/
const TABS: { key: TabKey; label: string; feature?: Feature }[] = [
  { key: "penjualan", label: "Penjualan", feature: "salesReports" },
  { key: "keuangan", label: "Keuangan", feature: "financeReports" },
  { key: "inventori", label: "Inventori", feature: "stockReports" },
  { key: "operasional", label: "Operasional" },
];

interface ReportRow {
  title: string;
  description: string;
  /** Omitted (with `dialog`) = no screen yet; the row renders as "Segera". */
  href?: string;
  /**
   * An export-only report opens a DIALOG on this page instead of a page of its
   * own (14 October 2026, on request) — it has nothing to show, only a file.
   */
  dialog?: ReportDialog;
  /**
   * Omitted when the report needs no grant at all ("Komisi Saya" answers only
   * about the signed-in person; requiring a grant would hand a groomer the staff
   * register to be told what they themselves earned).
   */
  feature?: Feature;
  action?: Action;
  /**
   * Opens when ANY of these is granted. Wins over `feature`/`action` when set.
   * The report rows list their Laporan grant alone (14 October 2026) — the
   * routes behind them still take the old data grants too.
   */
  anyOf?: { feature: Feature; action: Action }[];
}

type ReportDialog =
  | "salesInvoices"
  | "salesItems"
  | "salesBatches"
  | "posSales"
  | "consignmentSales"
  | "salesRevenue"
  | "cashFlow"
  | "ledger"
  | "expenses"
  | "aging"
  | "stockOnHand";

/**
 * Each export dialog, its report definition already bound — a map of
 * components rather than of definitions, so each keeps its own row type.
 */
const REPORT_DIALOGS: Record<
  ReportDialog,
  (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => React.ReactNode
> = {
  salesInvoices: (props) => (
    <SalesReportDialog report={salesInvoiceReport} {...props} />
  ),
  stockOnHand: (props) => (
    <SalesReportDialog report={stockOnHandReport} {...props} />
  ),
  aging: (props) => <SalesReportDialog report={agingReport} {...props} />,
  expenses: (props) => <SalesReportDialog report={expenseReport} {...props} />,
  ledger: (props) => <SalesReportDialog report={ledgerReport} {...props} />,
  cashFlow: (props) => <SalesReportDialog report={cashFlowReport} {...props} />,
  salesRevenue: (props) => (
    <SalesReportDialog report={salesRevenueReport} {...props} />
  ),
  consignmentSales: (props) => (
    <SalesReportDialog report={consignmentSalesReport} {...props} />
  ),
  posSales: (props) => <SalesReportDialog report={posSalesReport} {...props} />,
  salesBatches: (props) => (
    <SalesReportDialog report={salesBatchReport} {...props} />
  ),
  salesItems: (props) => (
    <SalesReportDialog report={salesItemReport} {...props} />
  ),
};

const SOON = "Segera";

const ROWS: Record<TabKey, ReportRow[]> = {
  penjualan: [
    {
      title: "Penjualan per invoice",
      description:
        "Daftar faktur dengan total, diskon, pajak, dan status bayar.",
      dialog: "salesInvoices",
      anyOf: [
        { feature: "salesReports", action: "read" },
        { feature: "customerInvoices", action: "read" },
      ],
    },
    {
      title: "Penjualan per produk & layanan",
      description: "Kuantitas dan nilai penjualan per SKU atau layanan.",
      dialog: "salesItems",
      anyOf: [
        { feature: "salesReports", action: "read" },
        { feature: "customerInvoices", action: "read" },
      ],
    },
    {
      title: "Batch terjual",
      description:
        "Batch dan tanggal kedaluwarsa yang keluar lewat penjualan, untuk telusur balik.",
      dialog: "salesBatches",
      anyOf: [
        { feature: "salesReports", action: "read" },
        { feature: "customerInvoices", action: "read" },
      ],
    },
    {
      title: "Penjualan POS",
      description: "Penutupan shift dan rekap per metode pembayaran.",
      dialog: "posSales",
      anyOf: [
        { feature: "salesReports", action: "read" },
        { feature: "posShifts", action: "read" },
      ],
    },
    {
      title: "Penjualan konsinyasi",
      description:
        "Penjualan produk titipan per supplier, dasar perhitungan setoran.",
      dialog: "consignmentSales",
      anyOf: [
        { feature: "salesReports", action: "read" },
        { feature: "purchaseInvoices", action: "read" },
      ],
    },
    {
      title: "Rincian pendapatan per produk",
      description: "Pendapatan, diskon, HPP, dan profit per produk.",
      dialog: "salesRevenue",
      anyOf: [
        { feature: "salesReports", action: "read" },
        { feature: "journalEntries", action: "read" },
      ],
    },
  ],
  /*
    The three statements keep `journalEntries:read`, the grant their routes
    enforce. Arus kas has no page: it opens as an export dialog like the
    Penjualan reports (14 October 2026, on request).
  */
  keuangan: [
    {
      title: "Laba rugi",
      description: "Hasil usaha per bulan, gabungan atau per lini bisnis.",
      href: "/dashboard/keuangan/laba-rugi",
      anyOf: [{ feature: "financeReports", action: "read" }],
    },
    {
      title: "Neraca",
      description: "Aset, kewajiban, dan ekuitas pada satu tanggal.",
      href: "/dashboard/keuangan/neraca",
      anyOf: [{ feature: "financeReports", action: "read" }],
    },
    {
      title: "Arus kas",
      description:
        "Kas awal sampai kas akhir: operasional, investasi, pendanaan.",
      dialog: "cashFlow",
      anyOf: [
        { feature: "financeReports", action: "read" },
        { feature: "journalEntries", action: "read" },
      ],
    },
    {
      title: "Saldo per akun",
      description: "Saldo tiap akun dengan rincian ke mutasi jurnal.",
      dialog: "ledger",
      anyOf: [
        { feature: "financeReports", action: "read" },
        { feature: "journalEntries", action: "read" },
      ],
    },
    {
      title: "Biaya per kategori",
      description: "Biaya per kategori, termasuk alokasi biaya bersama.",
      dialog: "expenses",
      anyOf: [
        { feature: "financeReports", action: "read" },
        { feature: "journalEntries", action: "read" },
      ],
    },
    {
      title: "Umur piutang & utang",
      description:
        "Piutang dan utang menurut umur: 0–30, 31–60, 61–90, lebih dari 90 hari.",
      dialog: "aging",
      anyOf: [
        { feature: "financeReports", action: "read" },
        { feature: "journalEntries", action: "read" },
      ],
    },
  ],
  inventori: [
    {
      title: "Posisi stok",
      description:
        "Stok tiap SKU per gudang, dikelompokkan per cabang, termasuk nilai persediaannya.",
      dialog: "stockOnHand",
      anyOf: [{ feature: "stockReports", action: "read" }],
    },
    {
      title: "Kartu stok",
      description: "Riwayat setiap pergerakan stok per SKU per gudang.",
      href: "/dashboard/inventory/stock-card",
      feature: "stockMovements",
      action: "read",
    },
    {
      title: "Stok minim",
      description:
        "Produk yang sudah di bawah batas restock, paling mendesak di atas.",
      href: "/dashboard/reports/low-stock",
      anyOf: [{ feature: "stockReports", action: "read" }],
    },
    {
      title: "Nilai persediaan",
      description:
        "Nilai stok pada satu tanggal, cocok dengan akun persediaan di Neraca.",
    },
    {
      title: "Batch & kedaluwarsa",
      description: "Sisa umur simpan per batch dan risiko kerugian.",
      href: "/dashboard/inventory/batches",
      feature: "productBatches",
      action: "read",
    },
    {
      title: "Selisih opname",
      description:
        "Riwayat penyesuaian hasil hitung stok, dan jurnal yang terbentuk.",
      href: "/dashboard/inventory/opname",
      feature: "stockOpnames",
      action: "read",
    },
    {
      title: "Transfer antar gudang",
      description: "Perpindahan stok antar gudang dan cabang.",
      href: "/dashboard/inventory/transfers",
      feature: "stockMovements",
      action: "read",
    },
    {
      title: "Konsinyasi outstanding",
      description:
        "Barang titipan yang masih di gudang, per supplier. Belum jadi utang — utang muncul saat barangnya laku.",
      href: "/dashboard/reports/consignment",
      anyOf: [{ feature: "stockReports", action: "read" }],
    },
    {
      title: "Pembelian per supplier",
      description: "Nilai dan kuantitas pembelian per supplier dan SKU.",
    },
  ],
  operasional: [
    {
      title: "Performa staf",
      description:
        "Order, nilai, dan ketepatan waktu per staf. Komisi ada di Rekap komisi.",
    },
    {
      title: "Rekap booking",
      description: "Booking menurut status, pembatalan, dan jadwal ulang.",
    },
    {
      title: "Layanan terlaris",
      description: "Peringkat layanan dan add-on menurut jumlah dan nilai.",
    },
    {
      title: "Okupansi hotel",
      description: "Kamar terisi dan lama menginap.",
    },
    {
      title: "Membership",
      description:
        "Paket terlaris, dan berapa nilai benefit yang sudah diberikan.",
      href: "/dashboard/reports/membership",
      anyOf: [{ feature: "membershipReports", action: "read" }],
    },
    {
      title: "Rekap komisi",
      description:
        "Komisi groomer per bulan, dihitung dari booking yang selesai. Siap diunduh untuk payroll.",
      href: "/dashboard/keuangan/komisi",
      // Payroll data: the report's own grant, or the staff register it used to need.
      anyOf: [{ feature: "commissionReports", action: "read" }],
    },
    {
      title: "Komisi saya",
      description:
        "Berapa yang Anda hasilkan bulan ini, dan berapa yang belum dibayar. Hanya milik Anda sendiri.",
      href: "/dashboard/reports/commissions/mine",
    },
  ],
};

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

export function ReportsHub() {
  const { can } = usePermissions();
  const [openDialog, setOpenDialog] = useState<ReportDialog | null>(null);
  const params = useSearchParams();
  const raw = params?.get("tab") ?? null;
  const tabs = TABS.filter((tab) => !tab.feature || can(tab.feature, "read"));
  const active: TabKey =
    isTabKey(raw) && tabs.some((tab) => tab.key === raw)
      ? raw
      : (tabs[0]?.key ?? "operasional");

  /*
    Rows without a screen are always listed (they are the mockup's table of
    contents and carry no data). Rows with a screen are filtered on the grant
    their destination enforces — a row that leads to a 403 is worse than none.
  */
  const rows = ROWS[active].filter((row) =>
    !row.href && !row.dialog
      ? true
      : row.anyOf
        ? row.anyOf.some((grant) => can(grant.feature, grant.action))
        : row.feature === undefined ||
          row.action === undefined ||
          can(row.feature, row.action),
  );

  return (
    <div className="flex flex-col gap-4">
      <nav
        aria-label="Jenis laporan"
        className="overflow-x-auto border-b border-border"
      >
        <ul className="flex gap-1">
          {tabs.map((tab) => {
            const current = tab.key === active;
            return (
              <li key={tab.key}>
                <Link
                  href={`/dashboard/reports?tab=${tab.key}`}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-block whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-bold transition-colors",
                    current
                      ? "border-primary text-primary"
                      : "border-transparent text-muted hover:text-primary",
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[26%]">Laporan</TableHead>
              <TableHead>Tujuan</TableHead>
              <TableHead className="w-[140px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.title}>
                <TableCell className="font-bold text-foreground">
                  {row.title}
                </TableCell>
                <TableCell className="text-muted">{row.description}</TableCell>
                <TableCell className="text-right">
                  {row.dialog ? (
                    <button
                      type="button"
                      onClick={() => setOpenDialog(row.dialog ?? null)}
                      className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      Unduh
                    </button>
                  ) : row.href ? (
                    <Link
                      href={row.href}
                      className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:opacity-90"
                    >
                      Buka
                    </Link>
                  ) : (
                    <Badge variant="outline">{SOON}</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {(Object.keys(REPORT_DIALOGS) as ReportDialog[]).map((key) => {
        const ReportDialogFor = REPORT_DIALOGS[key];
        return (
          <ReportDialogFor
            key={key}
            open={openDialog === key}
            onOpenChange={(open) => setOpenDialog(open ? key : null)}
          />
        );
      })}
    </div>
  );
}
