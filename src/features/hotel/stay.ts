import type { BookingAddon, HotelStay, HotelStayBooking } from "@/types/api";
import { toDecimalString, toMinor } from "@/utils/decimal";

/**
 * A hotel stay's arithmetic on the client (21 November 2026) — the same rules
 * as `utils/hotelStay.js` on the server, so a preview says what the save will
 * store. PURE, tested in `src/tests/hotelStay.test.ts`.
 */

const DAY_MS = 86_400_000;
const toUtc = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

export function addDays(date: string, days: number): string {
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Today on THIS device's calendar — "YYYY-MM-DD", never `toISOString()`. */
export function localToday(now = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

type StayDates = Pick<HotelStay, "checkInDate" | "checkOutDate" | "leftDate">;

export function stayEnd(stay: StayDates): string {
  return stay.leftDate && stay.leftDate < stay.checkOutDate
    ? stay.leftDate
    : stay.checkOutDate;
}

export function nightsOf(stay: StayDates): number {
  return Math.max(1, daysBetween(stay.checkInDate, stayEnd(stay)));
}

export function isNight(stay: StayDates, date: string): boolean {
  return date >= stay.checkInDate && date < stayEnd(stay);
}

/** Every day of the stay, check-out day included — the checklist's day tabs. */
export function stayDays(stay: StayDates): string[] {
  const out: string[] = [];
  for (
    let date = stay.checkInDate;
    date <= stayEnd(stay);
    date = addDays(date, 1)
  )
    out.push(date);
  return out;
}

/** How many nights or times a hotel add-on bills — `addonCount` on the server. */
export function addonCount(
  hotel:
    { unit: "night" | "time"; qty: number; date: string } | null | undefined,
  stay: StayDates,
): number {
  if (!hotel) return 1;
  if (hotel.unit === "time") return Math.max(1, hotel.qty || 1);
  const start = hotel.date > stay.checkInDate ? hotel.date : stay.checkInDate;
  return Math.max(0, daysBetween(start, stayEnd(stay)));
}

/** `unit` × `count` as a decimal string. */
export function times(unit: string | null | undefined, count: number): string {
  return toDecimalString((toMinor(unit ?? "0") ?? 0n) * BigInt(count));
}

/** A typed discount's rupiah off `price` — percent or amount, never more than the price. */
export function discountOff(
  price: string,
  discount: { mode: "percent" | "amount"; value: string } | null | undefined,
): bigint {
  const base = toMinor(price) ?? 0n;
  if (!discount || !discount.value) return 0n;
  const value = toMinor(discount.value) ?? 0n;
  const off = discount.mode === "percent" ? (base * value) / 1_000_000n : value;
  return off > base ? base : off < 0n ? 0n : off;
}

export interface DayItem {
  key: string;
  kind: "step" | "medicine" | "addon";
  label: string;
  detail?: string;
  time: string | null;
  addonId?: string;
}

/** What the checklist holds on one day — `dayItems` on the server. */
export function dayItems(
  booking: Pick<HotelStayBooking, "stay"> & {
    service: { addons: BookingAddon[] };
  },
  date: string,
): DayItem[] {
  const stay = booking.stay;
  if (!isNight(stay, date)) return [];
  const items: DayItem[] = stay.stepTimes.map((step) => ({
    key: `step:${step.stepName}`,
    kind: "step",
    label: step.stepName,
    time: step.time,
  }));
  if (stay.care?.medicine) {
    items.push({
      key: "medicine",
      kind: "medicine",
      label: "Beri obat",
      detail: stay.care.medicine,
      time: stay.care.medicineTime,
    });
  }
  booking.service.addons.forEach((addon) => {
    const hotel = addon.hotel;
    if (!hotel || addon.commissionable === false) return;
    const due =
      hotel.unit === "time" ? hotel.date === date : date >= hotel.date;
    if (!due) return;
    items.push({
      key: `addon:${addon.itemId}`,
      kind: "addon",
      label:
        hotel.unit === "time" && hotel.qty > 1
          ? `${addon.name} ×${hotel.qty}`
          : addon.name,
      time: hotel.time,
      addonId: addon.itemId,
    });
  });
  return items.sort((a, b) =>
    (a.time ?? "99:99").localeCompare(b.time ?? "99:99"),
  );
}

/* ─── words ──────────────────────────────────────────────────────────── */

/** The stay's three rungs in the shop's words, and Batal. */
export const STAY_STATUS: Record<string, { label: string; className: string }> =
  {
    confirmed: { label: "Dipesan", className: "bg-tint-brand text-primary" },
    in_progress: {
      label: "Menginap",
      className: "bg-tint-warning text-warning",
    },
    completed: { label: "Selesai", className: "bg-tint-success text-success" },
    cancelled: { label: "Batal", className: "bg-tint-neutral text-muted" },
  };

/** What needs doing today, said on the row — or null. */
export function stayFlag(
  booking: Pick<HotelStayBooking, "status" | "stay">,
  today: string,
): string | null {
  const { status, stay } = booking;
  if (status === "confirmed" && stay.checkInDate === today)
    return "Datang hari ini";
  if (status === "confirmed" && stay.checkInDate < today) return "Belum datang";
  if (status === "in_progress" && stay.checkOutDate === today)
    return "Pulang hari ini";
  if (status === "in_progress" && stay.checkOutDate < today)
    return "Lewat jadwal pulang";
  return null;
}

/** "12 Nov" — the short day the lists print. */
export function shortDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  return `${day} ${names[month - 1]}`;
}

/** "Kam, 12 Nov 2026". */
export function longDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][
    new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  ];
  return `${weekday}, ${shortDate(date)} ${year}`;
}

/** "Kandang Standar · A-01" / "Ruang Kucing". */
export function roomText(
  stay: Pick<HotelStay, "roomTypeName" | "unitCode">,
): string {
  return stay.unitCode
    ? `${stay.roomTypeName} · ${stay.unitCode}`
    : stay.roomTypeName;
}
