/**
 * Every address under Pengaturan, in one place.
 *
 * NO "use client" HERE, on `serviceSettingsSections.ts`'s rule: the redirect
 * pages at the old /dashboard/master/… addresses are server components and read
 * these too.
 *
 * TWO KINDS OF ADDRESS (mockup `buloo-navigation-v3`, 22 September 2026). The
 * four TABS are the pages that carry the tab row — Umum, Layanan, Keuangan,
 * Pengguna & Sistem. Everything else is a page one of those tabs opens: it has
 * no tab row, and its breadcrumb's "Pengaturan" leads back to the tab it came
 * from. All of them are flat children of /dashboard/settings rather than
 * nested under their tab, so a page can change tabs without changing address.
 */

const ROOT = "/dashboard/settings";

export const SETTINGS_ROOT = ROOT;

export const SETTINGS_TABS = {
  umum: `${ROOT}/general`,
  /**
   * The Layanan tab IS the shared-vocabulary hub (Opsi Varian, Ras, Tahapan,
   * Add-on, Zona), opened on a section by `?bagian=`. Its rail does the job the
   * mockup gives to five cards, one click shorter.
   */
  layanan: `${ROOT}/services`,
  keuangan: `${ROOT}/finance`,
  sistem: `${ROOT}/system`,
} as const;

export type SettingsTab = keyof typeof SETTINGS_TABS;

export const SETTINGS_PATHS = {
  // Umum
  identitas: `${ROOT}/business-profile`,
  cabang: `${ROOT}/branches`,
  gudang: `${ROOT}/warehouses`,
  stokKasir: `${ROOT}/pos-stock`,
  /* The registered tills (POS offline mode, 19 October 2026). */
  perangkatKasir: `${ROOT}/pos-devices`,
  nomorDokumen: `${ROOT}/document-numbering`,
  notifikasi: `${ROOT}/notifications`,
  tipeSupplier: `${ROOT}/supplier-types`,
  /**
   * The register, not the explainer — `tipeSupplier` above is read-only and
   * answers a different question. Moved off Pembelian's tab row on request
   * (1 October 2026); briefly spelled "kategori-suplier" (one P) by mistake and
   * corrected the same day.
   */
  kategoriSupplier: `${ROOT}/supplier-categories`,
  tipePelanggan: `${ROOT}/customer-types`,
  // Layanan — the service form lives under the hub it is reached from.
  layananBaru: `${ROOT}/services/new`,
  // Keuangan
  daftarAkun: `${ROOT}/chart-of-accounts`,
  channelPembayaran: `${ROOT}/payment-channels`,
  liniBisnis: `${ROOT}/business-lines`,
  pajak: `${ROOT}/tax`,
  /** Kapan uang paket membership jadi pendapatan (26 Oktober 2026). */
  membership: `${ROOT}/membership`,
  // Pengguna & Sistem
  dataAwal: `${ROOT}/opening-balances`,
  /** The Data awal step "Saldo awal kas & bank" — a page that step opens. */
  dataAwalKasBank: `${ROOT}/opening-balances/cash-bank`,
  pengguna: `${ROOT}/users`,
  peran: `${ROOT}/roles`,
  aksesCabang: `${ROOT}/branch-access`,
  riwayat: `${ROOT}/activity-log`,
  /** Read-only: a shift is closed only from the till, by its own cashier. */
  shiftKasir: `${ROOT}/pos-shifts`,
} as const;

/** One service's edit form. */
export function serviceFormPath(serviceId: string): string {
  return `${SETTINGS_TABS.layanan}/${serviceId}`;
}
