import { bookingService } from "@/services/booking.service";
import { hotelStayService } from "@/services/hotel.service";
import type { HotelStayBooking } from "@/types/api";

import type {
  SalesReportColumn,
  SalesReportDefinition,
} from "@/features/reports/components/SalesReportDialog";
import { STAY_STATUS, isNight, roomText, stayDays } from "./stay";

/**
 * LAPORAN › OPERASIONAL › HOTEL PER MALAM (21 November 2026, PLAN-Hotel-V1.md
 * §4.5): one row per animal per night in the period — the room it slept in,
 * the price of that night, the day's PIC and how much of its checklist was
 * done. Built from /hotel/stays; the server already narrows to the period.
 */
export interface HotelNightRow {
  date: string;
  bookingNumber: string | null;
  petName: string | null;
  customerName: string | null;
  room: string;
  nightPrice: number;
  picName: string | null;
  tasksDone: number;
  status: string;
}

const COLUMNS: SalesReportColumn<HotelNightRow>[] = [
  {
    header: "Tanggal malam",
    value: (r) => r.date,
    width: 14,
    about: "Malam menginap, kalender toko",
  },
  {
    header: "No. booking",
    value: (r) => r.bookingNumber,
    width: 18,
    about: "Nomor booking hotel",
  },
  {
    header: "Hewan",
    value: (r) => r.petName,
    width: 16,
    about: "Hewan yang menginap",
  },
  {
    header: "Pelanggan",
    value: (r) => r.customerName,
    width: 20,
    about: "Pemilik hewan",
  },
  {
    header: "Kamar",
    value: (r) => r.room,
    width: 20,
    about: "Tipe kamar dan nomor kandang (kalau bernomor)",
  },
  {
    header: "Harga per malam",
    value: (r) => r.nightPrice,
    type: "number",
    about: "Harga satu malam saat dipesan, sebelum diskon",
  },
  { header: "PIC", value: (r) => r.picName, width: 18, about: "PIC hari itu" },
  {
    header: "Tugas selesai",
    value: (r) => r.tasksDone,
    type: "number",
    about: "Kegiatan checklist yang dicentang hari itu",
  },
  {
    header: "Status booking",
    value: (r) => r.status,
    width: 14,
    about: "Status booking saat diunduh",
  },
];

export function nightRows(
  stays: HotelStayBooking[],
  from: string,
  to: string,
  nameOf: (userId: string | null) => string | null,
): HotelNightRow[] {
  return stays
    .filter((booking) => booking.status !== "cancelled")
    .flatMap((booking) =>
      stayDays(booking.stay)
        .filter(
          (date) => isNight(booking.stay, date) && date >= from && date <= to,
        )
        .map((date) => {
          const day = booking.stay.days.find((row) => row.date === date);
          return {
            date,
            bookingNumber: booking.bookingNumber ?? null,
            petName: booking.petName ?? null,
            customerName: booking.customerName ?? null,
            room: roomText(booking.stay),
            nightPrice: Number(booking.stay.nightPrice),
            picName: nameOf(day?.picUserId ?? null),
            tasksDone: (day?.tasks ?? []).length,
            status: STAY_STATUS[booking.status]?.label ?? booking.status,
          };
        }),
    )
    .sort((a, b) =>
      a.date === b.date
        ? (a.petName ?? "").localeCompare(b.petName ?? "")
        : a.date < b.date
          ? -1
          : 1,
    );
}

export const hotelNightsReport: SalesReportDefinition<HotelNightRow, never> = {
  title: "Hotel per malam",
  description:
    "Satu baris per hewan per malam: kamar, harga, PIC, dan tugas yang selesai. Diunduh sebagai Excel.",
  fileName: "hotel-per-malam",
  rowNoun: "malam",
  periodLabel: "tanggal malam",
  locations: "branches",
  columns: COLUMNS,
  fetch: async ({ dateFrom, dateTo, branchIds }) => {
    const { items } = await hotelStayService.list({
      from: dateFrom,
      to: dateTo,
      branchIds: branchIds.length ? branchIds : undefined,
      statuses: ["confirmed", "in_progress", "completed"],
    });
    const staff = await bookingService.availability(dateFrom).catch(() => []);
    const names = new Map(
      staff.map((person) => [person._id, person.fullName] as const),
    );
    return nightRows(items, dateFrom, dateTo, (userId) =>
      userId ? (names.get(userId) ?? null) : null,
    );
  },
};
