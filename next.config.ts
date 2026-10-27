import type { NextConfig } from "next";

const MOVED: [source: string, destination: string][] = [
  // Module front pages: the bare module address is its Ringkasan.
  ["/dashboard/sales", "/dashboard/sales/summary"],
  ["/dashboard/purchasing", "/dashboard/purchasing/summary"],
  ["/dashboard/promotion", "/dashboard/promotion/summary"],
  ["/dashboard/promotion/membership/paket", "/dashboard/promotion/membership"],
  ["/dashboard/settings", "/dashboard/settings/general"],
  ["/dashboard/pengaturan", "/dashboard/settings/general"],

  // English routes (26 October 2026).
  ["/dashboard/booking/kalender", "/dashboard/booking/calendar"],
  ["/dashboard/layanan/grooming/katalog/:path*", "/dashboard/service/grooming/catalog/:path*"],
  ["/dashboard/layanan/grooming/pengaturan", "/dashboard/service/grooming/settings"],
  ["/dashboard/layanan/antar-jemput/katalog/:path*", "/dashboard/service/pickup-delivery/catalog/:path*"],
  ["/dashboard/layanan/antar-jemput/pengaturan", "/dashboard/service/pickup-delivery/settings"],
  ["/dashboard/layanan/grooming/:path*", "/dashboard/service/grooming/:path*"],
  ["/dashboard/layanan/antar-jemput/:path*", "/dashboard/service/pickup-delivery/:path*"],
  ["/dashboard/hotel/:path*", "/dashboard/service/hotel/:path*"],
  ["/dashboard/promosi", "/dashboard/promotion/summary"],
  ["/dashboard/promosi/ringkasan", "/dashboard/promotion/summary"],
  ["/dashboard/promosi/membership/paket", "/dashboard/promotion/membership"],
  ["/dashboard/promosi/membership/paket/:path+", "/dashboard/promotion/membership/plans/:path+"],
  ["/dashboard/promosi/membership/anggota/:path*", "/dashboard/promotion/membership/member/:path*"],
  ["/dashboard/promosi/:path*", "/dashboard/promotion/:path*"],

  // Membership left Pelanggan for Promosi (16 October 2026).
  ["/dashboard/customers/membership", "/dashboard/promotion/membership"],
  ["/dashboard/customers/membership/kartu/:path*", "/dashboard/promotion/membership/member/:path*"],
  ["/dashboard/customers/membership/perpanjangan", "/dashboard/promotion/summary"],
  ["/dashboard/customers/membership/:path+", "/dashboard/promotion/membership/plans/:path+"],

  // Pelanggan left Master (25 October 2026).
  ["/dashboard/master/customers/ringkasan", "/dashboard/customers/summary"],
  ["/dashboard/master/customers/riwayat", "/dashboard/customers/history"],
  ["/dashboard/master/customers/:path*", "/dashboard/customers/:path*"],
  ["/dashboard/master/pets/:path*", "/dashboard/pets/:path*"],

  // The rest of Master, and Keuangan's set-up screens, moved into Pengaturan.
  ["/dashboard/master/branches/new", "/dashboard/settings/branches"],
  ["/dashboard/master/branches/:path*", "/dashboard/settings/branches/:path*"],
  ["/dashboard/master/users/:path*", "/dashboard/settings/users/:path*"],
  ["/dashboard/master/roles/:path*", "/dashboard/settings/roles/:path*"],
  ["/dashboard/master/warehouses/:path*", "/dashboard/settings/warehouses/:path*"],
  ["/dashboard/master/audit-logs", "/dashboard/settings/activity-log"],
  ["/dashboard/master/layanan/data-hewan", "/dashboard/settings/services"],
  ["/dashboard/master/layanan/tahapan", "/dashboard/settings/services?bagian=tahapan"],
  ["/dashboard/master/layanan/:path*", "/dashboard/settings/services/:path*"],
  ["/dashboard/keuangan/chart-of-accounts/:path*", "/dashboard/settings/chart-of-accounts/:path*"],
  ["/dashboard/keuangan/business-lines", "/dashboard/settings/business-lines"],
  ["/dashboard/keuangan/kas-bank/new", "/dashboard/settings/payment-channels/new"],
  ["/dashboard/keuangan/kas-bank/:id([a-f0-9]{24})", "/dashboard/settings/payment-channels/:id"],
  ["/dashboard/business", "/dashboard/settings/general"],
  ["/dashboard/pengaturan/faktur-dokumen", "/dashboard/settings/branches"],

  // The customer's own invoice link, already sent out over WhatsApp.
  ["/faktur/:token", "/invoice/:token"],

  // Retired pages.
  ["/dashboard/reports/commissions", "/dashboard/finance/commissions"],
  ["/dashboard/booking/:id/hewan/:petId", "/dashboard/booking/:id"],

  // English routes, second pass (26 October 2026): Beranda, Keuangan,
  // Pengaturan and the last Indonesian segments elsewhere.
  ["/dashboard/uang", "/dashboard/money"],
  ["/dashboard/operasional", "/dashboard/operations"],
  ["/dashboard/cabang", "/dashboard/branches"],
  ["/dashboard/booking/perjalanan/:path*", "/dashboard/booking/rides/:path*"],
  ["/dashboard/service/:kind/katalog/:path*", "/dashboard/service/:kind/catalog/:path*"],
  ["/dashboard/service/:kind/pengaturan", "/dashboard/service/:kind/settings"],
  ["/dashboard/promotion/membership/paket/:path+", "/dashboard/promotion/membership/plans/:path+"],
  ["/dashboard/sales/retur", "/dashboard/sales/returns"],
  ["/dashboard/pos/perlu-dicek", "/dashboard/pos/needs-review"],
  ["/dashboard/keuangan/kas-bank/biaya-tetap/:path*", "/dashboard/finance/cash-bank/fixed-costs/:path*"],
  ["/dashboard/keuangan/kas-bank/transaksi/:path*", "/dashboard/finance/cash-bank/transactions/:path*"],
  ["/dashboard/keuangan/kas-bank", "/dashboard/finance/cash-bank"],
  ["/dashboard/keuangan/transaksi/:path*", "/dashboard/finance/transactions/:path*"],
  ["/dashboard/keuangan/komisi/:path*", "/dashboard/finance/commissions/:path*"],
  ["/dashboard/keuangan/laba-rugi", "/dashboard/finance/profit-loss"],
  ["/dashboard/keuangan/neraca", "/dashboard/finance/balance-sheet"],
  ["/dashboard/keuangan/:path*", "/dashboard/finance/:path*"],
  ["/dashboard/pengaturan/data-awal/kas-bank", "/dashboard/settings/opening-balances/cash-bank"],
  ["/dashboard/pengaturan/akses-cabang/:path*", "/dashboard/settings/branch-access/:path*"],
  ["/dashboard/pengaturan/cabang/:path*", "/dashboard/settings/branches/:path*"],
  ["/dashboard/pengaturan/channel-pembayaran/:path*", "/dashboard/settings/payment-channels/:path*"],
  ["/dashboard/pengaturan/daftar-akun/:path*", "/dashboard/settings/chart-of-accounts/:path*"],
  ["/dashboard/pengaturan/data-awal/:path*", "/dashboard/settings/opening-balances/:path*"],
  ["/dashboard/pengaturan/gudang/:path*", "/dashboard/settings/warehouses/:path*"],
  ["/dashboard/pengaturan/identitas/:path*", "/dashboard/settings/business-profile/:path*"],
  ["/dashboard/pengaturan/kategori-supplier/:path*", "/dashboard/settings/supplier-categories/:path*"],
  ["/dashboard/pengaturan/keuangan/:path*", "/dashboard/settings/finance/:path*"],
  ["/dashboard/pengaturan/layanan/:path*", "/dashboard/settings/services/:path*"],
  ["/dashboard/pengaturan/lini-bisnis/:path*", "/dashboard/settings/business-lines/:path*"],
  ["/dashboard/pengaturan/nomor-dokumen/:path*", "/dashboard/settings/document-numbering/:path*"],
  ["/dashboard/pengaturan/notifikasi/:path*", "/dashboard/settings/notifications/:path*"],
  ["/dashboard/pengaturan/pajak/:path*", "/dashboard/settings/tax/:path*"],
  ["/dashboard/pengaturan/pengguna/:path*", "/dashboard/settings/users/:path*"],
  ["/dashboard/pengaturan/peran/:path*", "/dashboard/settings/roles/:path*"],
  ["/dashboard/pengaturan/perangkat-kasir/:path*", "/dashboard/settings/pos-devices/:path*"],
  ["/dashboard/pengaturan/riwayat/:path*", "/dashboard/settings/activity-log/:path*"],
  ["/dashboard/pengaturan/shift-kasir/:path*", "/dashboard/settings/pos-shifts/:path*"],
  ["/dashboard/pengaturan/sistem/:path*", "/dashboard/settings/system/:path*"],
  ["/dashboard/pengaturan/stok-kasir/:path*", "/dashboard/settings/pos-stock/:path*"],
  ["/dashboard/pengaturan/tipe-pelanggan/:path*", "/dashboard/settings/customer-types/:path*"],
  ["/dashboard/pengaturan/tipe-supplier/:path*", "/dashboard/settings/supplier-types/:path*"],
  ["/dashboard/pengaturan/umum/:path*", "/dashboard/settings/general/:path*"],
  ["/dashboard/pengaturan/:path*", "/dashboard/settings/:path*"],
];

const nextConfig: NextConfig = {
  /*
    THE TILL'S SERVICE WORKER (POS offline mode, 19 October 2026) — public/sw.js.
    Never cached by the browser, so a new build's worker is picked up on the
    next load, and served as JavaScript whatever the host guesses.
  */
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  /*
    OLD ADDRESSES FORWARD HERE, AND ONLY HERE (26 October 2026): moved pages no
    longer leave a redirect-only page.tsx behind. Each rule points at the page's
    final address — never at another rule — and query strings ride along. The
    first matching rule wins, so a specific address goes above its prefix.

    These run BEFORE the filesystem: a bare `:id` under a prefix that still has
    real pages (kas-bank) would swallow them, so it is pinned to a Mongo id.
  */
  async redirects() {
    return MOVED.map(([source, destination]) => ({
      source,
      destination,
      permanent: false,
    }));
  },
};

export default nextConfig;
