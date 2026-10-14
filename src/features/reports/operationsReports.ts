import { BOOKING_STATUS_LABELS, bookingStatusLabel } from "@/features/booking";
import { reportService } from "@/services/report.service";
import type { BookingStatus } from "@/types/api";
import type {
  BookingRecapRow,
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
