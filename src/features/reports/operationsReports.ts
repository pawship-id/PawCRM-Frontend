import { reportService } from "@/services/report.service";
import type { StaffPerformanceRow } from "@/types/report";

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
