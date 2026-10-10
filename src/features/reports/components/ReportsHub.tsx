"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

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

const TABS: { key: TabKey; label: string }[] = [
  { key: "penjualan", label: "Penjualan" },
  { key: "keuangan", label: "Keuangan" },
  { key: "inventori", label: "Inventori" },
  { key: "operasional", label: "Operasional" },
];

interface ReportRow {
  title: string;
  description: string;
  /** Omitted = no screen yet; the row renders as "Segera". */
  href?: string;
  /**
   * Omitted when the report needs no grant at all ("Komisi Saya" answers only
   * about the signed-in person; requiring a grant would hand a groomer the staff
   * register to be told what they themselves earned).
   */
  feature?: Feature;
  action?: Action;
}

const SOON = "Segera";

const ROWS: Record<TabKey, ReportRow[]> = {
  penjualan: [
    {
      title: "Penjualan per invoice",
      description: "Daftar faktur dengan total, diskon, pajak, dan status bayar.",
    },
    {
      title: "Penjualan per produk & layanan",
      description: "Kuantitas dan nilai penjualan per SKU atau layanan.",
    },
    {
      title: "Batch terjual",
      description:
        "Batch dan tanggal kedaluwarsa yang keluar lewat penjualan, untuk telusur balik.",
    },
    {
      title: "Penjualan POS",
      description: "Penutupan shift dan rekap per metode pembayaran.",
    },
    {
      title: "Penjualan konsinyasi",
      description:
        "Penjualan produk titipan per supplier, dasar perhitungan setoran.",
    },
    {
      title: "Rincian pendapatan per produk",
      description: "Pendapatan, diskon, HPP, dan profit per produk.",
    },
  ],
  /*
    The three statements keep `journalEntries:read`, the grant their routes
    enforce. Arus Kas is in the mockup list without a screen of its own there;
    here the screen exists, so it opens.
  */
  keuangan: [
    {
      title: "Laba rugi",
      description: "Hasil usaha per bulan, gabungan atau per lini bisnis.",
      href: "/dashboard/keuangan/laba-rugi",
      feature: "journalEntries",
      action: "read",
    },
    {
      title: "Arus kas",
      description:
        "Kas awal sampai kas akhir: operasional, investasi, pendanaan.",
      href: "/dashboard/keuangan/arus-kas",
      feature: "journalEntries",
      action: "read",
    },
    {
      title: "Neraca",
      description: "Aset, kewajiban, dan ekuitas pada satu tanggal.",
      href: "/dashboard/keuangan/neraca",
      feature: "journalEntries",
      action: "read",
    },
    {
      title: "Saldo per akun",
      description: "Saldo tiap akun dengan rincian ke mutasi jurnal.",
    },
    {
      title: "Biaya per kategori",
      description: "Biaya per kategori, termasuk alokasi biaya bersama.",
    },
    {
      title: "Umur piutang & utang",
      description:
        "Piutang dan utang menurut umur: 0–30, 31–60, 61–90, lebih dari 90 hari.",
    },
  ],
  inventori: [
    {
      title: "Posisi stok",
      description:
        "Stok tiap SKU per gudang, dikelompokkan per cabang, termasuk nilai persediaannya.",
      href: "/dashboard/reports/stock-on-hand",
      feature: "products",
      action: "read",
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
      feature: "products",
      action: "read",
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
      description: "Riwayat penyesuaian hasil hitung stok, dan jurnal yang terbentuk.",
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
      feature: "productBatches",
      action: "read",
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
      feature: "membershipPlans",
      action: "read",
    },
    {
      title: "Rekap komisi",
      description:
        "Komisi groomer per bulan, dihitung dari booking yang selesai. Siap diunduh untuk payroll.",
      href: "/dashboard/keuangan/komisi",
      // Payroll data: whoever may read the staff register, and nobody else.
      feature: "users",
      action: "read",
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
  const params = useSearchParams();
  const raw = params?.get("tab") ?? null;
  const active: TabKey = isTabKey(raw) ? raw : "penjualan";

  /*
    Rows without a screen are always listed (they are the mockup's table of
    contents and carry no data). Rows with a screen are filtered on the grant
    their destination enforces — a row that leads to a 403 is worse than none.
  */
  const rows = ROWS[active].filter(
    (row) =>
      !row.href ||
      row.feature === undefined ||
      row.action === undefined ||
      can(row.feature, row.action),
  );

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Jenis laporan" className="overflow-x-auto border-b border-border">
        <ul className="flex gap-1">
          {TABS.map((tab) => {
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
                  {row.href ? (
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

      <div className="rounded-xl border border-border border-l-[3px] border-l-primary bg-surface px-4 py-3">
        <p className="text-sm font-bold text-foreground">Cara kerja</p>
        <p className="mt-0.5 text-xs text-muted">
          Laporan yang bertanda Buka tampil di layar, lengkap dengan filter dan
          tombol unduh Excel di dalamnya. Yang bertanda Segera belum dibangun —
          semuanya akan memakai dimensi yang sama dengan yang tersimpan di tiap
          transaksi: cabang, gudang, lini bisnis, channel, konsinyasi, SKU, tipe
          layanan atau produk, dan akun.
        </p>
      </div>
    </div>
  );
}
