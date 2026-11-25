import type {
  HotelRoomType,
  HotelRoomTypeInput,
  HotelRoomUnit,
} from "@/types/api";

/**
 * The room type form's draft (21 November 2026) — PURE, tested without a DOM
 * (`src/tests/hotelRoomTypeDraft.test.ts`).
 */
export interface RoomTypeDraft {
  name: string;
  branchId: string;
  petTypeIds: string[];
  mode: HotelRoomType["mode"];
  units: HotelRoomUnit[];
  petsPerUnit: string;
  capacity: string;
  closed: boolean;
  facilities: string;
  isActive: boolean;
}

export const BLANK_ROOM_TYPE: RoomTypeDraft = {
  name: "",
  branchId: "",
  petTypeIds: [],
  mode: "numbered",
  units: [],
  petsPerUnit: "1",
  capacity: "6",
  closed: false,
  facilities: "",
  isActive: true,
};

export function seedRoomType(roomType: HotelRoomType): RoomTypeDraft {
  return {
    name: roomType.name,
    branchId: roomType.branchId,
    petTypeIds: [...roomType.petTypeIds],
    mode: roomType.mode,
    units: roomType.units.map((unit) => ({ ...unit })),
    petsPerUnit: String(roomType.petsPerUnit || 1),
    capacity: String(roomType.capacity || 0),
    closed: roomType.closed,
    facilities: roomType.facilities ?? "",
    isActive: roomType.isActive,
  };
}

/** " a-01 " → "A-01" — what the server stores. */
export function unitCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

/**
 * What one "Tambah" box makes: "A-09", "A-09, A-10", or a run —
 * "A-09 sampai A-12" / "A-09 s/d A-12" — padded like its first number.
 * At most 50 at once; codes already listed are skipped.
 */
export function parseUnitCodes(text: string, taken: string[]): string[] {
  const have = new Set(taken.map(unitCode));
  const out: string[] = [];
  const push = (code: string) => {
    const normalised = unitCode(code);
    if (normalised && !have.has(normalised)) {
      have.add(normalised);
      out.push(normalised);
    }
  };

  const run = text
    .trim()
    .match(/^(.*?)(\d+)\s*(?:sampai|s\/d|-{1,2}>)\s*\D*?(\d+)$/i);
  if (run) {
    const [, prefix, from, to] = run;
    const low = Math.min(Number(from), Number(to));
    const high = Math.max(Number(from), Number(to));
    for (let n = low; n <= high && out.length < 50; n += 1) {
      push(`${prefix}${String(n).padStart(from.length, "0")}`);
    }
    return out;
  }

  text.split(/[,;\n]+/).forEach(push);
  return out.slice(0, 50);
}

/** Why the draft cannot be saved yet, as the rest of a sentence — or null. */
export function roomTypeProblem(draft: RoomTypeDraft): string | null {
  if (!draft.name.trim()) return "nama tipe kamar belum diisi";
  if (!draft.branchId) return "cabang belum dipilih";
  if (draft.petTypeIds.length === 0) return "jenis hewan belum dipilih";
  if (draft.mode === "numbered") {
    if (draft.units.length === 0) return "belum ada nomor kamar";
    const per = Number(draft.petsPerUnit);
    if (!Number.isInteger(per) || per < 1 || per > 20)
      return "hewan per kamar diisi 1–20";
  } else {
    const capacity = Number(draft.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500)
      return "batas hewan diisi 1–500";
  }
  return null;
}

/** The body a valid draft becomes. Only the mode's own fields matter; the server clears the rest. */
export function roomTypePayload(draft: RoomTypeDraft): HotelRoomTypeInput {
  return {
    name: draft.name.trim(),
    branchId: draft.branchId,
    petTypeIds: draft.petTypeIds,
    mode: draft.mode,
    ...(draft.mode === "numbered"
      ? { units: draft.units, petsPerUnit: Number(draft.petsPerUnit) }
      : { capacity: Number(draft.capacity), closed: draft.closed }),
    facilities: draft.facilities.trim() || null,
    isActive: draft.isActive,
  };
}
