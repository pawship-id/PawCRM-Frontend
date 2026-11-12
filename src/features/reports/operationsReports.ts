import { BOOKING_STATUS_LABELS, bookingStatusLabel } from "@/features/booking";
import { membershipService } from "@/services/membership.service";
import { reportService } from "@/services/report.service";
import type { MembershipReport } from "@/types/membership";
import type { BookingStatus } from "@/types/api";
import type {
  BookingRecapRow,
  CommissionPayrollRow,
  CommissionDetailRow,
  ServiceKind,
  StaffPerformanceRow,
  TopServiceRow,
} from "@/types/report";

import type {
  SalesReportColumn,
  SalesReportDefinition,
} from "./components/SalesReportDialog";

/**
 * THE LAPORAN › OPERASIONAL EXPORTS that open as a dialog — the same
 * `SalesReportDialog`, Cabang only: bookings belong to a cabang, not a gudang.
 */

/* --------------------------------------------------------- Performa staf */

/** Who, how much work, what it was worth, and how punctual it was. */
const STAFF_COLUMNS: SalesReportColumn<StaffPerformanceRow>[] = [
  {
    header: "Staf",
    value: (r) => r.staffName,
    width: 22,
    about: "Groomer / staf yang mengerjakan",
  },
  {
    header: "Jumlah booking",
    value: (r) => r.bookingCount,
    type: "number",
    about: "Booking selesai yang ikut dikerjakan",
  },
  {
    header: "Jumlah sesi",
    value: (r) => r.sessionCount,
    type: "number",
    about: "Sesi (giliran kerja) yang diikuti",
  },
  {
    header: "Nilai layanan",
    value: (r) => Number(r.value),
    type: "number",
    width: 16,
    about:
      "Porsi nilai bersih booking, dibagi per sesi dan per kru seperti komisi",
  },
  {
    header: "Rata-rata per booking",
    value: (r) => (r.averageValue === null ? null : Number(r.averageValue)),
    type: "number",
    width: 16,
    about: "Nilai layanan ÷ jumlah booking",
  },
  {
    header: "Menit kerja",
    value: (r) => r.minutes,
    type: "number",
    about: "Porsi durasi estimasi layanan dan add-on, dibagi seperti nilai",
  },
  {
    header: "Booking terukur (mulai)",
    value: (r) => r.measuredStart,
    type: "number",
    about: "Booking yang waktu mulainya tercatat",
  },
  {
    header: "Mulai tepat waktu (%)",
    value: (r) => r.onTimeStartRate,
    type: "number",
    about: "Mulai paling lambat 15 menit setelah jadwal",
  },
  {
    header: "Rata-rata terlambat mulai (menit)",
    value: (r) => r.averageLateMinutes,
    type: "number",
    width: 18,
    about: "Rata-rata keterlambatan mulai; mulai lebih awal dihitung 0",
  },
  {
    header: "Booking terukur (selesai)",
    value: (r) => r.measuredFinish,
    type: "number",
    about: "Booking yang waktu selesainya tercatat",
  },
  {
    header: "Selesai sesuai estimasi (%)",
    value: (r) => r.onTimeFinishRate,
    type: "number",
    about: "Selesai sebelum jadwal + durasi estimasi booking",
  },
];

/**
 * Order, nilai, dan ketepatan waktu per staf — commission is Rekap komisi's.
 */
export const staffPerformanceReport: SalesReportDefinition<
  StaffPerformanceRow,
  never
> = {
  title: "Performa staf",
  description:
    "Order, nilai, dan ketepatan waktu per staf. Komisi ada di Rekap komisi. Diunduh sebagai Excel.",
  fileName: "performa-staf",
  rowNoun: "staf",
  periodLabel: "tanggal jadwal booking",
  locations: "branches",
  note: "Dari booking yang sudah selesai. Ketepatan waktu dihitung per booking dan berlaku untuk semua staf yang mengerjakannya; booking yang jam mulai/selesainya tidak dicatat tidak ikut diukur.",
  columns: STAFF_COLUMNS,
  fetch: async ({ dateFrom, dateTo, branchIds }) =>
    (await reportService.staffPerformance({ dateFrom, dateTo, branchIds }))
      .rows,
};

/* --------------------------------------------------------- Rekap booking */

const LOCATION_LABEL: Record<string, string> = {
  in_store: "Di toko",
  in_home: "Di rumah",
};

const ORIGIN_LABEL: Record<string, string> = {
  booking: "Booking",
  pos_adhoc: "Kasir",
  invoice_adhoc: "Faktur",
};

/* Every rung a booking can stand on — `rescheduled` is a note, never a place. */
const RECAP_STATUSES = (
  Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[]
).filter((status) => status !== "rescheduled");

/** Which booking and when, for whom, where it stands, and what happened to it. */
const RECAP_COLUMNS: SalesReportColumn<BookingRecapRow>[] = [
  {
    header: "No. booking",
    value: (r) => r.bookingNumber,
    width: 18,
    about: "Nomor booking",
  },
  {
    header: "Tanggal jadwal",
    value: (r) => r.scheduledDate,
    type: "date",
    width: 14,
    about: "Tanggal jadwal saat ini (setelah jadwal ulang, kalau ada)",
  },
  { header: "Jam", value: (r) => r.scheduledTime, about: "Jam jadwal" },
  {
    header: "Cabang",
    value: (r) => r.branchName,
    width: 16,
    about: "Cabang booking",
  },
  {
    header: "Pelanggan",
    value: (r) => r.customerName,
    width: 22,
    about: "Nama pelanggan",
  },
  {
    header: "No. HP",
    value: (r) => r.customerPhone,
    width: 16,
    about: "Nomor HP pelanggan",
  },
  { header: "Hewan", value: (r) => r.petName, width: 16, about: "Nama hewan" },
  {
    header: "Layanan",
    value: (r) => r.serviceName,
    width: 26,
    about: "Layanan utama",
  },
  {
    header: "Lokasi",
    value: (r) =>
      r.location ? (LOCATION_LABEL[r.location] ?? r.location) : null,
    about: "Di toko atau di rumah pelanggan",
  },
  {
    header: "Asal",
    value: (r) => (r.origin ? (ORIGIN_LABEL[r.origin] ?? r.origin) : null),
    about: "Dibuat dari menu Booking, langsung di kasir, atau dari faktur",
  },
  {
    header: "Status",
    value: (r) => bookingStatusLabel(r.status, { tripLeg: r.tripLeg }),
    width: 18,
    about: "Status booking saat diunduh",
  },
  {
    header: "Staf",
    value: (r) => r.staffNames || null,
    width: 22,
    about: "Groomer / staf di sesi booking",
  },
  {
    header: "Nilai bersih",
    value: (r) => Number(r.netAmount),
    type: "number",
    width: 14,
    about: "Nilai booking setelah diskon",
  },
  {
    header: "Tanggal dibuat",
    value: (r) => r.createdDate,
    type: "date",
    width: 14,
    about: "Kapan booking dibuat",
  },
  {
    header: "Dibuat oleh",
    value: (r) => r.createdByName,
    width: 18,
    about: "Yang membuat booking",
  },
  {
    header: "Jumlah jadwal ulang",
    value: (r) => r.rescheduleCount,
    type: "number",
    about: "Berapa kali jadwalnya dipindah",
  },
  {
    header: "Jadwal ulang terakhir",
    value: (r) => r.lastRescheduledDate,
    type: "date",
    width: 14,
    about: "Kapan jadwal terakhir dipindah (bukan tanggal jadwal lamanya)",
  },
  {
    header: "Tanggal batal",
    value: (r) => r.cancelledDate,
    type: "date",
    width: 14,
    about: "Kapan booking dibatalkan",
  },
  {
    header: "Alasan batal",
    value: (r) => r.cancelReason,
    width: 26,
    about: "Alasan pembatalan",
  },
  {
    header: "Tanggal selesai",
    value: (r) => r.completedDate,
    type: "date",
    width: 14,
    about: "Kapan booking ditandai selesai",
  },
];

/**
 * Booking menurut status, pembatalan, dan jadwal ulang — every booking
 * scheduled in the period.
 */
export const bookingRecapReport: SalesReportDefinition<
  BookingRecapRow,
  BookingStatus
> = {
  title: "Rekap booking",
  description:
    "Booking menurut status, pembatalan, dan jadwal ulang. Diunduh sebagai Excel.",
  fileName: "rekap-booking",
  rowNoun: "booking",
  periodLabel: "tanggal jadwal booking",
  locations: "branches",
  note: "Periode mengikuti tanggal jadwal saat ini. Jadwal ulang dicatat jumlah dan waktunya; tanggal jadwal lama tidak tersimpan.",
  columns: RECAP_COLUMNS,
  choice: {
    label: "Status",
    options: RECAP_STATUSES.map((value) => ({
      value,
      label: bookingStatusLabel(value),
    })),
    defaults: RECAP_STATUSES,
    summary: (values) =>
      values.length === RECAP_STATUSES.length
        ? "Semua status"
        : values.map((v) => bookingStatusLabel(v)).join(", "),
  },
  fetch: async ({ dateFrom, dateTo, branchIds }, statuses) =>
    (
      await reportService.bookingRecap({
        dateFrom,
        dateTo,
        branchIds,
        // Every status ticked is the same as asking for none.
        statuses:
          statuses.length === RECAP_STATUSES.length ? undefined : statuses,
      })
    ).rows,
};

/* ------------------------------------------------------ Layanan terlaris */

const SERVICE_KIND_LABEL: Record<ServiceKind, string> = {
  main: "Layanan utama",
  addon: "Add-on",
};

const SERVICE_KINDS = Object.keys(SERVICE_KIND_LABEL) as ServiceKind[];

/** Kind and rank first — the sheet is a leaderboard — then the figures. */
const TOP_SERVICE_COLUMNS: SalesReportColumn<TopServiceRow>[] = [
  {
    header: "Jenis",
    value: (r) => SERVICE_KIND_LABEL[r.kind],
    width: 14,
    about: "Layanan utama atau add-on — masing-masing diperingkat sendiri",
  },
  {
    header: "Peringkat (jumlah)",
    value: (r) => r.rankByCount,
    type: "number",
    about: "Urutan menurut berapa kali dikerjakan",
  },
  {
    header: "Peringkat (nilai)",
    value: (r) => r.rankByValue,
    type: "number",
    about: "Urutan menurut nilai bersih",
  },
  {
    header: "Layanan",
    value: (r) => r.name,
    width: 28,
    about: "Nama layanan atau add-on",
  },
  {
    header: "Kategori",
    value: (r) => r.categoryName,
    width: 18,
    about: "Kategori di katalog layanan",
  },
  {
    header: "Jumlah dikerjakan",
    value: (r) => r.count,
    type: "number",
    about: "Berapa kali dikerjakan",
  },
  {
    header: "Jumlah booking",
    value: (r) => r.bookingCount,
    type: "number",
    about: "Berapa booking yang memuatnya",
  },
  {
    header: "Nilai kotor",
    value: (r) => Number(r.gross),
    type: "number",
    width: 16,
    about: "Harga saat dibooking, sebelum diskon",
  },
  {
    header: "Diskon",
    value: (r) => Number(r.discount),
    type: "number",
    width: 14,
    about:
      "Diskon di layanan/add-on itu (diskon seluruh booking tidak termasuk)",
  },
  {
    header: "Nilai bersih",
    value: (r) => Number(r.net),
    type: "number",
    width: 16,
    about: "Nilai kotor − diskon",
  },
  {
    header: "Harga rata-rata",
    value: (r) => (r.averagePrice === null ? null : Number(r.averagePrice)),
    type: "number",
    width: 14,
    about: "Nilai bersih ÷ jumlah dikerjakan",
  },
  {
    header: "% dari total jenisnya",
    value: (r) => r.share,
    type: "number",
    about: "Porsi dari nilai bersih semua layanan utama, atau semua add-on",
  },
];

/**
 * Peringkat layanan dan add-on menurut jumlah dan nilai — from the period's
 * finished bookings.
 */
export const topServicesReport: SalesReportDefinition<
  TopServiceRow,
  ServiceKind
> = {
  title: "Layanan terlaris",
  description:
    "Peringkat layanan dan add-on menurut jumlah dan nilai. Diunduh sebagai Excel.",
  fileName: "layanan-terlaris",
  rowNoun: "layanan",
  periodLabel: "tanggal jadwal booking",
  locations: "branches",
  note: "Dari booking yang sudah selesai, termasuk yang belum ditagih. Diskon seluruh booking tidak dibagi ke layanan.",
  columns: TOP_SERVICE_COLUMNS,
  choice: {
    label: "Jenis",
    options: SERVICE_KINDS.map((value) => ({
      value,
      label: SERVICE_KIND_LABEL[value],
    })),
    defaults: SERVICE_KINDS,
    summary: (values) =>
      values.length === SERVICE_KINDS.length
        ? "Layanan utama & add-on"
        : values.map((v) => SERVICE_KIND_LABEL[v]).join(", "),
  },
  fetch: async ({ dateFrom, dateTo, branchIds }, kinds) =>
    (await reportService.topServices({ dateFrom, dateTo, branchIds, kinds }))
      .rows,
};

/* ------------------------------------------------------------ Membership */

/**
 * One line of the membership sheet: a package, a benefit spent under one, or
 * the total — told apart by `section`, so the sheet can be filtered by it.
 */
export interface MembershipSheetRow {
  section: "Paket" | "Benefit" | "Total";
  rank: number | null;
  planName: string | null;
  benefit: string | null;
  cards: number | null;
  revenue: string | null;
  used: number | null;
  benefitValue: string | null;
  margin: string | null;
  lastUsedAt: string | null;
}

const blankMembershipRow = {
  rank: null,
  planName: null,
  benefit: null,
  cards: null,
  revenue: null,
  used: null,
  benefitValue: null,
  margin: null,
  lastUsedAt: null,
};

/**
 * The packages (best-selling first, as the server orders them), then every
 * benefit spent, then the total. A benefit nobody used has no row — the
 * redemption ledger has nothing for it, and that absence is the finding.
 */
export function membershipRows(report: MembershipReport): MembershipSheetRow[] {
  const minus = (a: string, b: string) => String(Number(a) - Number(b));

  return [
    ...report.plans.map((plan, index) => ({
      ...blankMembershipRow,
      section: "Paket" as const,
      rank: index + 1,
      planName: plan.name,
      cards: plan.cards,
      revenue: plan.revenue,
      used: plan.benefitsUsed,
      benefitValue: plan.benefitValue,
      margin: minus(plan.revenue, plan.benefitValue),
    })),
    ...report.benefits.map((benefit) => ({
      ...blankMembershipRow,
      section: "Benefit" as const,
      planName: benefit.planName,
      benefit: benefit.label,
      used: benefit.used,
      benefitValue: benefit.value,
      lastUsedAt: benefit.lastUsedAt ? benefit.lastUsedAt.slice(0, 10) : null,
    })),
    {
      ...blankMembershipRow,
      section: "Total" as const,
      planName: "Semua paket",
      cards: report.summary.cards,
      revenue: report.summary.revenue,
      benefitValue: report.summary.benefitValue,
      margin: report.summary.margin,
    },
  ];
}

const asNumber = (value: string | null) =>
  value === null ? null : Number(value);

const MEMBERSHIP_COLUMNS: SalesReportColumn<MembershipSheetRow>[] = [
  {
    header: "Bagian",
    value: (r) => r.section,
    about: "Paket, Benefit, atau Total",
  },
  {
    header: "Peringkat",
    value: (r) => r.rank,
    type: "number",
    about: "Urutan paket menurut kartu terjual",
  },
  {
    header: "Paket",
    value: (r) => r.planName,
    width: 26,
    about: "Nama paket saat dijual",
  },
  {
    header: "Benefit",
    value: (r) => r.benefit,
    width: 28,
    about: "Benefit yang dipakai (baris Benefit)",
  },
  {
    header: "Kartu terjual",
    value: (r) => r.cards,
    type: "number",
    about: "Kartu membership yang terjual",
  },
  {
    header: "Nilai terjual",
    value: (r) => asNumber(r.revenue),
    type: "number",
    width: 16,
    about: "Nilai paket yang terjual",
  },
  {
    header: "Benefit dipakai",
    value: (r) => r.used,
    type: "number",
    about: "Berapa kali benefit dipakai",
  },
  {
    header: "Nilai benefit",
    value: (r) => asNumber(r.benefitValue),
    type: "number",
    width: 16,
    about: "Nilai benefit yang sudah diberikan, menurut harga saat dipakai",
  },
  {
    header: "Selisih",
    value: (r) => asNumber(r.margin),
    type: "number",
    width: 16,
    about:
      "Nilai terjual − nilai benefit. Belum dikurangi biaya kerja, jadi bukan laba",
  },
  {
    header: "Terakhir dipakai",
    value: (r) => r.lastUsedAt,
    type: "date",
    width: 14,
    about: "Kapan benefit itu terakhir dipakai",
  },
];

/**
 * Paket terlaris, dan berapa nilai benefit yang sudah diberikan — the same
 * figures the old Laporan Membership page drew.
 */
export const membershipReport: SalesReportDefinition<
  MembershipSheetRow,
  never
> = {
  title: "Membership",
  description:
    "Paket terlaris, dan berapa nilai benefit yang sudah diberikan. Diunduh sebagai Excel.",
  fileName: "membership",
  rowNoun: "baris",
  periodLabel: "tanggal",
  // A card follows the animal, not the cabang that sold it.
  locations: "none",
  note: "Benefit yang belum pernah dipakai tidak muncul — itu tandanya benefit tersebut tidak dikenal pelanggan atau kasir. Selisih belum dikurangi biaya kerja.",
  columns: MEMBERSHIP_COLUMNS,
  fetch: async ({ dateFrom, dateTo }) =>
    membershipRows(await membershipService.report({ dateFrom, dateTo })),
};

/* ---------------------------------------------------------- Rekap komisi */

/** `2026-09` → `September 2026`, the way a payslip names a month. */
function monthName(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
}

const money = (value: string) => Number(value);

/** Whose month, then what was earned, then where it stands — a payslip. */
const PAYROLL_COLUMNS: SalesReportColumn<CommissionPayrollRow>[] = [
  {
    header: "Bulan",
    value: (r) => monthName(r.period),
    width: 16,
    about: "Bulan komisi — bulan booking selesai",
  },
  {
    header: "Groomer",
    value: (r) => r.staffName,
    width: 22,
    about: "Groomer / staf penerima komisi",
  },
  {
    header: "Cabang",
    value: (r) => r.branchName,
    width: 16,
    about: "Cabang booking",
  },
  {
    header: "Jumlah booking",
    value: (r) => r.bookingCount,
    type: "number",
    about: "Booking selesai yang menghasilkan komisi",
  },
  {
    header: "Dasar komisi",
    value: (r) => money(r.basis),
    type: "number",
    width: 16,
    about: "Nilai layanan yang menjadi dasar perhitungan",
  },
  {
    header: "Komisi",
    value: (r) => money(r.amount),
    type: "number",
    width: 16,
    about: "Komisi final — nilai yang diubah manual dipakai kalau ada",
  },
  {
    header: "Menunggu persetujuan",
    value: (r) => money(r.pending),
    type: "number",
    width: 16,
    about: "Bagian komisi yang belum disetujui",
  },
  {
    header: "Disetujui",
    value: (r) => money(r.approved),
    type: "number",
    width: 16,
    about: "Sudah disetujui, siap dibayar",
  },
  {
    header: "Sudah dibayar",
    value: (r) => money(r.paid),
    type: "number",
    width: 16,
    about: "Sudah dibayarkan",
  },
  {
    header: "Belum dibayar",
    value: (r) => money(r.unpaid),
    type: "number",
    width: 16,
    about: "Komisi − sudah dibayar",
  },
  {
    header: "Diubah manual",
    value: (r) => r.overriddenCount,
    type: "number",
    about: "Berapa baris komisi yang nilainya diubah manual",
  },
  {
    header: "Dibatalkan",
    value: (r) => r.reversedCount,
    type: "number",
    about:
      "Baris komisi yang dibatalkan (booking dibatalkan setelah selesai) — tidak ikut dijumlah",
  },
];

/**
 * Komisi groomer per bulan, dihitung dari booking yang selesai — the payroll
 * sheet. Approving and paying stay on the Komisi screen.
 */
export const commissionPayrollReport: SalesReportDefinition<
  CommissionPayrollRow,
  never
> = {
  title: "Rekap komisi",
  description:
    "Komisi groomer per bulan, dihitung dari booking yang selesai. Siap diunduh untuk payroll. Diunduh sebagai Excel.",
  fileName: "rekap-komisi",
  rowNoun: "baris",
  periodLabel: "bulan komisi",
  locations: "branches",
  note: "Komisi dicatat per bulan booking selesai, jadi periode dibulatkan ke bulan penuh. Menyetujui dan membayar komisi tetap di layar Keuangan › Komisi.",
  columns: PAYROLL_COLUMNS,
  fetch: async ({ dateFrom, dateTo, branchIds }) =>
    (await reportService.commissionPayroll({ dateFrom, dateTo, branchIds }))
      .rows,
};

/* --------------------------------------------------- Rekap komisi detail */

const SESSION_STATUS_LABEL: Record<string, string> = {
  pending: "Belum mulai",
  in_progress: "Sedang dikerjakan",
  done: "Selesai",
};

const LOCATION_TYPE_LABEL: Record<string, string> = {
  in_store: "In Store",
  in_home: "In Home",
};

const text = (
  header: string,
  value: (r: CommissionDetailRow) => string | null,
  about: string,
  width = 16,
): SalesReportColumn<CommissionDetailRow> => ({ header, value, width, about });

const rupiah = (
  header: string,
  value: (r: CommissionDetailRow) => string,
  about: string,
): SalesReportColumn<CommissionDetailRow> => ({
  header,
  value: (r) => money(value(r)),
  type: "number",
  width: 16,
  about,
});

const count = (
  header: string,
  value: (r: CommissionDetailRow) => number | null,
  about: string,
): SalesReportColumn<CommissionDetailRow> => ({
  header,
  value,
  type: "number",
  width: 14,
  about,
});

/** The order and the headers the shop's own commission sheet uses. */
const COMMISSION_DETAIL_COLUMNS: SalesReportColumn<CommissionDetailRow>[] = [
  text("Kode Booking", (r) => r.bookingNumber, "Nomor booking"),
  text("Tanggal Booking", (r) => r.bookingDate, "Tanggal booking dibuat"),
  text("Tanggal Mulai", (r) => r.startDate, "Tanggal jadwal booking"),
  text("Tanggal Selesai", (r) => r.endDate, "Tanggal booking selesai dikerjakan (aktual)"),
  text("Time Slot", (r) => r.timeSlot, "Jam mulai – jam selesai menurut estimasi durasi"),
  text(
    "Tipe (In Store/In Home)",
    (r) => (r.location ? (LOCATION_TYPE_LABEL[r.location] ?? r.location) : null),
    "Di toko atau di rumah pelanggan",
  ),
  text(
    "Status Booking",
    (r) => (r.bookingStatus ? bookingStatusLabel(r.bookingStatus as BookingStatus) : null),
    "Status booking saat diunduh",
  ),
  text("Nama Sesi", (r) => r.sessionName, "Sesi pengerjaan, mis. Bathing"),
  text("Groomer Sesi", (r) => r.groomerName, "Groomer penerima komisi sesi ini", 22),
  text(
    "Status Sesi",
    (r) => (r.sessionStatus ? (SESSION_STATUS_LABEL[r.sessionStatus] ?? r.sessionStatus) : null),
    "Status pengerjaan sesi",
  ),
  text("Waktu Mulai Aktual", (r) => r.actualStart, "Waktu sesi mulai dikerjakan", 18),
  text("Waktu Selesai Aktual", (r) => r.actualEnd, "Waktu sesi selesai dikerjakan", 18),
  count("Durasi Aktual", (r) => r.actualDurationMin, "Menit, dari mulai sampai selesai sesi"),
  text("Metode Pembayaran", (r) => r.paymentMethod, "Dari transaksi kasir atau pembayaran faktur", 20),
  text("Kode Referral", (r) => r.referralCode, "Belum tersedia untuk booking — kosong"),
  text("Kode Cabang", (r) => r.branchCode, "Kode cabang booking"),
  text("Nama Cabang", (r) => r.branchName, "Nama cabang booking"),
  text("Kode Customer", (r) => r.customerCode, "Kode pelanggan"),
  text("Nama Customer", (r) => r.customerName, "Nama pelanggan", 22),
  text("No. HP Customer", (r) => r.customerPhone, "Nomor HP pelanggan"),
  text("Kategori Customer", (r) => r.customerCategory, "Tipe pelanggan di profil pelanggan"),
  text("Kode Pet", (r) => r.petCode, "Kode hewan (PET-0001)"),
  text("Nama Pet", (r) => r.petName, "Nama hewan"),
  text(
    "Tipe Member",
    (r) => r.memberType,
    "Paket membership yang dipakai, atau yang aktif di hewan pada tanggal booking",
    20,
  ),
  text("Kode Layanan", (r) => r.serviceCode, "Kode layanan"),
  text("Layanan", (r) => r.serviceName, "Layanan utama", 22),
  text("Kategori Layanan", (r) => r.serviceCategory, "Kategori layanan"),
  count("Est. Durasi (menit)", (r) => r.estDurationMin, "Estimasi durasi layanan + add-on"),
  text("Add-on", (r) => r.addonNames, "Add-on booking, dipisah koma", 22),
  rupiah("Harga Layanan", (r) => r.servicePrice, "Harga layanan utama"),
  rupiah("Harga Add-on", (r) => r.addonPrice, "Jumlah harga add-on"),
  rupiah(
    "Sub Total Layanan (Harga Layanan + Add-on)",
    (r) => r.subtotal,
    "Harga layanan + harga add-on",
  ),
  rupiah(
    "Biaya Perjalanan",
    (r) => r.travelFee,
    "Biaya kunjungan home grooming; biaya per kunjungan dibagi rata ke booking dalam satu perjalanan",
  ),
  rupiah("Gross Total", (r) => r.grossTotal, "Sub total + biaya perjalanan"),
  text("Kode Promo", (r) => r.promoCode, "Promo yang dipakai saat ditagih"),
  rupiah("Diskon Promo", (r) => r.promoDiscount, "Potongan dari promo"),
  rupiah("Benefit Membership", (r) => r.membershipBenefit, "Potongan dari benefit membership"),
  rupiah(
    "Total Diskon",
    (r) => r.totalDiscount,
    "Semua diskon saat ditagih (promo, membership, diskon manual); diskon booking kalau belum ditagih",
  ),
  rupiah("Net Total (Dibayar)", (r) => r.netTotal, "Gross total − total diskon"),
  rupiah(
    "Komisi Base Groomer",
    (r) => r.commission,
    "Komisi groomer untuk sesi ini — nilai yang diubah manual dipakai kalau ada",
  ),
];

/**
 * The payroll sheet's working rows — one per booking × session × groomer,
 * with the booking, customer, pet, service and bill beside each.
 */
export const commissionDetailReport: SalesReportDefinition<
  CommissionDetailRow,
  never
> = {
  title: "Rekap komisi detail",
  description:
    "Satu baris per sesi per groomer, lengkap dengan data booking, pelanggan, hewan, layanan, dan pembayaran. Diunduh sebagai Excel.",
  fileName: "rekap-komisi-detail",
  rowNoun: "baris",
  periodLabel: "tanggal booking",
  locations: "branches",
  note: "Data booking (harga, diskon, net) diulang di setiap baris sesi/groomer booking itu — jangan dijumlah langsung per kolom. Komisi yang dibatalkan tidak ikut.",
  columns: COMMISSION_DETAIL_COLUMNS,
  fetch: async ({ dateFrom, dateTo, branchIds }) =>
    (await reportService.commissionDetailRecap({ dateFrom, dateTo, branchIds }))
      .rows,
};
