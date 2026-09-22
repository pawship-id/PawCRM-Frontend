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
 * from. All of them are flat children of /dashboard/pengaturan rather than
 * nested under their tab, so a page can change tabs without changing address.
 */

const ROOT = "/dashboard/pengaturan";

export const SETTINGS_ROOT = ROOT;

export const SETTINGS_TABS = {
  umum: `${ROOT}/umum`,
  /**
   * The Layanan tab IS the shared-vocabulary hub (Opsi Varian, Ras, Tahapan,
   * Add-on, Zona), opened on a section by `?bagian=`. Its rail does the job the
   * mockup gives to five cards, one click shorter.
   */
  layanan: `${ROOT}/layanan`,
  keuangan: `${ROOT}/keuangan`,
  sistem: `${ROOT}/sistem`,
} as const;

export type SettingsTab = keyof typeof SETTINGS_TABS;

export const SETTINGS_PATHS = {
  // Umum
  cabang: `${ROOT}/cabang`,
  gudang: `${ROOT}/gudang`,
  stokKasir: `${ROOT}/stok-kasir`,
  fakturDokumen: `${ROOT}/faktur-dokumen`,
  // Layanan — the service form lives under the hub it is reached from.
  layananBaru: `${ROOT}/layanan/new`,
  // Keuangan
  daftarAkun: `${ROOT}/daftar-akun`,
  channelPembayaran: `${ROOT}/channel-pembayaran`,
  liniBisnis: `${ROOT}/lini-bisnis`,
  pajak: `${ROOT}/pajak`,
  // Pengguna & Sistem
  dataAwal: `${ROOT}/data-awal`,
  pengguna: `${ROOT}/pengguna`,
  peran: `${ROOT}/peran`,
  aksesCabang: `${ROOT}/akses-cabang`,
  riwayat: `${ROOT}/riwayat`,
} as const;

/** One service's edit form. */
export function serviceFormPath(serviceId: string): string {
  return `${SETTINGS_TABS.layanan}/${serviceId}`;
}
