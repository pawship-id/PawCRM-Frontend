import type {
  HotelAddonInput,
  HotelCare,
  HotelStayBooking,
  HotelStayPetInput,
  Service,
  VariantChoice,
} from "@/types/api";
import { toDecimalString, toMinor } from "@/utils/decimal";

import { addonCount, discountOff, times } from "./stay";

/**
 * One animal's part of a hotel booking, as the form holds it (21 November
 * 2026) — PURE, tested in `src/tests/hotelStayDraft.test.ts`. Shared by Booking
 * hotel baru and Ubah booking.
 */

export interface DiscountDraft {
  mode: "percent" | "amount";
  value: string;
}

export interface AddonDraft {
  /** A stable key for the row; the stored add-on's id when it has one. */
  key: string;
  _id?: string;
  serviceId: string;
  name: string;
  unit: "night" | "time";
  unitPrice: string;
  qty: string;
  date: string;
  time: string;
  discount: DiscountDraft;
  commissionable: boolean;
  /** Already on an invoice — kept exactly as it is. */
  billed: boolean;
}

export interface PetDraft {
  serviceId: string;
  roomTypeId: string;
  unitId: string;
  choices: VariantChoice[];
  /** Per night, as typed; "" = the catalogue's. */
  nightPrice: string;
  discount: DiscountDraft;
  bookingDiscount: DiscountDraft;
  addons: AddonDraft[];
  care: HotelCare;
  /** Tahapan name → clock time this booking does it at. */
  stepTimes: Record<string, string>;
  internalNotes: string;
}

export const BLANK_DISCOUNT: DiscountDraft = { mode: "amount", value: "" };

export const BLANK_CARE: HotelCare = {
  food: "owner",
  portion: null,
  medicine: null,
  medicineTime: null,
  behaviour: null,
};

export function blankPet(): PetDraft {
  return {
    serviceId: "",
    roomTypeId: "",
    unitId: "",
    choices: [],
    nightPrice: "",
    discount: { ...BLANK_DISCOUNT },
    bookingDiscount: { ...BLANK_DISCOUNT },
    addons: [],
    care: { ...BLANK_CARE },
    stepTimes: {},
    internalNotes: "",
  };
}

/** "10.000" → "10000"; "" stays "". */
export function digits(text: string): string {
  return text.replace(/[^\d]/g, "");
}

function discountIn(
  draft: DiscountDraft,
): { mode: "percent" | "amount"; value: string } | null {
  const value =
    draft.mode === "percent"
      ? draft.value.replace(",", ".").trim()
      : digits(draft.value);
  return value && Number(value) > 0 ? { mode: draft.mode, value } : null;
}

function discountDraft(
  discount: { mode: "percent" | "amount"; value: string } | null | undefined,
): DiscountDraft {
  return discount
    ? { mode: discount.mode, value: String(Number(discount.value)) }
    : { ...BLANK_DISCOUNT };
}

/** A catalogue add-on's first draft — per night from check-in, or once on check-in day. */
export function addonFromService(
  service: Service,
  checkInDate: string,
): AddonDraft {
  const unit = service.billingUnit === "per_night" ? "night" : "time";
  return {
    key: `new-${service._id}-${Math.random().toString(36).slice(2, 8)}`,
    serviceId: service._id,
    name: service.name,
    unit,
    unitPrice: digits(String(Math.round(Number(service.price ?? 0)))),
    qty: "1",
    date: checkInDate,
    time:
      unit === "time"
        ? "16:00"
        : service.commissionable !== false
          ? "08:00"
          : "",
    discount: { ...BLANK_DISCOUNT },
    commissionable: service.commissionable !== false,
    billed: false,
  };
}

/** The draft a stored stay starts as, for Ubah booking. */
export function petDraftOf(booking: HotelStayBooking): PetDraft {
  return {
    serviceId: booking.service.serviceId,
    roomTypeId: booking.stay.roomTypeId,
    unitId: booking.stay.unitId ?? "",
    choices: [],
    nightPrice: digits(String(Math.round(Number(booking.stay.nightPrice)))),
    discount: discountDraft(booking.service.discount ?? null),
    bookingDiscount: discountDraft(booking.bookingDiscount ?? null),
    addons: booking.service.addons
      .filter((addon) => addon.hotel)
      .map((addon) => ({
        key: addon.itemId,
        _id: addon.itemId,
        serviceId: addon.serviceId,
        name: addon.name,
        unit: addon.hotel!.unit,
        unitPrice: digits(String(Math.round(Number(addon.hotel!.unitPrice)))),
        qty: String(addon.hotel!.qty || 1),
        date: addon.hotel!.date,
        time: addon.hotel!.time ?? "",
        discount: discountDraft(addon.discount ?? null),
        commissionable: addon.commissionable !== false,
        billed: Boolean(addon.posTransactionId),
      })),
    care: { ...BLANK_CARE, ...booking.stay.care },
    stepTimes: Object.fromEntries(
      booking.stay.stepTimes.map((step) => [step.stepName, step.time ?? ""]),
    ),
    internalNotes: booking.internalNotes ?? "",
  };
}

export interface BillLine {
  label: string;
  gross: string;
  off: string;
  net: string;
  billed?: boolean;
}

/**
 * What the draft bills, line by line — the preview under the form. The stay
 * at `catalogPrice` when nothing is typed.
 */
export function previewBill(
  draft: PetDraft,
  dates: { checkInDate: string; checkOutDate: string },
  {
    serviceName,
    catalogPrice,
  }: { serviceName: string; catalogPrice: string | null },
): { lines: BillLine[]; bookingOff: string; total: string; nights: number } {
  const stay = { ...dates, leftDate: null };
  const nights = Math.max(
    1,
    Math.round(
      (Date.parse(dates.checkOutDate) - Date.parse(dates.checkInDate)) /
        86_400_000,
    ),
  );
  const night = draft.nightPrice ? draft.nightPrice : (catalogPrice ?? "0");
  const lines: BillLine[] = [];

  const stayGross = times(night, nights);
  const stayOff = discountOff(stayGross, discountIn(draft.discount));
  lines.push({
    label: `${serviceName || "Menginap"} · ${nights} malam × Rp ${Number(night).toLocaleString("id-ID")}`,
    gross: stayGross,
    off: toDecimalString(stayOff),
    net: toDecimalString((toMinor(stayGross) ?? 0n) - stayOff),
  });

  draft.addons.forEach((addon) => {
    const count = addonCount(
      { unit: addon.unit, qty: Number(addon.qty) || 1, date: addon.date },
      stay,
    );
    const gross = times(addon.unitPrice || "0", count);
    const off = discountOff(gross, discountIn(addon.discount));
    lines.push({
      label: `${addon.name} · ${count} ${addon.unit === "night" ? "malam" : "kali"} × Rp ${Number(addon.unitPrice || 0).toLocaleString("id-ID")}`,
      gross,
      off: toDecimalString(off),
      net: toDecimalString((toMinor(gross) ?? 0n) - off),
      billed: addon.billed,
    });
  });

  const sub = lines.reduce((sum, line) => sum + (toMinor(line.net) ?? 0n), 0n);
  const bookingOff = discountOff(
    toDecimalString(sub),
    discountIn(draft.bookingDiscount),
  );
  return {
    lines,
    bookingOff: toDecimalString(bookingOff),
    total: toDecimalString(sub - bookingOff),
    nights,
  };
}

/** Whether the counter typed a price or a discount — what needs `bookings:setPrice`. */
export function typesPrice(
  draft: PetDraft,
  catalogPrice: string | null,
): boolean {
  const priceTyped =
    draft.nightPrice !== "" &&
    catalogPrice !== null &&
    Number(draft.nightPrice) !== Number(catalogPrice);
  return (
    priceTyped ||
    Boolean(discountIn(draft.discount)) ||
    Boolean(discountIn(draft.bookingDiscount)) ||
    draft.addons.some(
      (addon) => !addon.billed && Boolean(discountIn(addon.discount)),
    )
  );
}

function addonsIn(addons: AddonDraft[]): HotelAddonInput[] {
  return addons.map((addon) => ({
    ...(addon._id ? { _id: addon._id } : {}),
    serviceId: addon.serviceId,
    unitPrice: addon.unitPrice || null,
    qty: Math.max(1, Number(addon.qty) || 1),
    date: addon.date,
    time: addon.time || null,
    discount: discountIn(addon.discount),
  }));
}

/** The body one animal becomes on POST /hotel/stays. */
export function petInput(petId: string, draft: PetDraft): HotelStayPetInput {
  return {
    petId,
    serviceId: draft.serviceId,
    roomTypeId: draft.roomTypeId,
    unitId: draft.unitId || null,
    ...(draft.choices.length ? { choices: draft.choices } : {}),
    nightPrice: draft.nightPrice || null,
    discount: discountIn(draft.discount),
    bookingDiscount: discountIn(draft.bookingDiscount),
    addons: addonsIn(draft.addons),
    care: draft.care,
    stepTimes: Object.entries(draft.stepTimes).map(([stepName, time]) => ({
      stepName,
      time: time || null,
    })),
    internalNotes: draft.internalNotes || null,
  };
}

/** The PATCH one stay becomes on Ubah booking — room, price, add-ons, care, times. */
export function petPatch(draft: PetDraft) {
  return {
    serviceId: draft.serviceId,
    roomTypeId: draft.roomTypeId,
    unitId: draft.unitId || null,
    ...(draft.nightPrice ? { nightPrice: draft.nightPrice } : {}),
    discount: discountIn(draft.discount),
    bookingDiscount: discountIn(draft.bookingDiscount),
    addons: addonsIn(draft.addons),
    care: draft.care,
    stepTimes: Object.entries(draft.stepTimes).map(([stepName, time]) => ({
      stepName,
      time: time || null,
    })),
    internalNotes: draft.internalNotes || null,
  };
}

/** Why the draft cannot be saved yet, said as the rest of a sentence — or null. */
export function petProblem(
  draft: PetDraft,
  { numbered, petName }: { numbered: boolean; petName: string },
): string | null {
  if (!draft.serviceId) return `${petName}: layanan belum dipilih`;
  if (!draft.roomTypeId) return `${petName}: tipe kamar belum dipilih`;
  if (numbered && !draft.unitId) return `${petName}: nomor kamar belum dipilih`;
  if (
    draft.discount.mode === "percent" &&
    Number(draft.discount.value.replace(",", ".")) > 100
  ) {
    return `${petName}: diskon lebih dari 100%`;
  }
  return null;
}
