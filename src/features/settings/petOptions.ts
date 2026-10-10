import type { PetOption, PetOptionType } from "@/types/api";

import { SETTINGS_TABS } from "./paths";

/**
 * Pengaturan › Layanan › Data hewan — the words, paths and ordering rule the
 * screen and its hub card share.
 */

/** /dashboard/master/layanan until 22 September 2026; that address redirects. */
export const SERVICE_SETTINGS_PATH = SETTINGS_TABS.layanan;
/**
 * Jenis hewan, ukuran and jenis bulu open on the hub's first section, Opsi
 * Varian; ras has a section of its own (`?bagian=ras`). A route until 17
 * September 2026 — `/data-hewan` now redirects here.
 */
export const PET_DATA_PATH = SERVICE_SETTINGS_PATH;

/** Backend cap — LABEL_MAX_LENGTH in petOption.model.js. */
export const PET_OPTION_LABEL_MAX_LENGTH = 60;

/** The pill order: what an animal IS first, then how it is described. */
export const PET_OPTION_TYPES: readonly PetOptionType[] = [
  "species",
  "breed",
  "size",
  "furType",
];

export interface PetOptionTypeWords {
  /** On the pill, and at the start of a sentence: "Jenis hewan". */
  title: string;
  /** Mid-sentence: "Tambah jenis hewan", "Belum ada jenis hewan." */
  noun: string;
  /** What a change to this list reaches, in one line under the pills. */
  usedBy: string;
  /** Who can hold a code of this type and so block its delete. */
  heldBy: string;
  placeholder: string;
}

/**
 * THE usedBy LINES FOLLOW THE SERVER, not the mockup. A code blocks its delete
 * where petOptionUsage.repository.js counts it: every type on a live pet, and
 * species, size and fur type on a service variant (`SERVICE_AXIS_OPTION_TYPE` —
 * `petType`, `sizeCategory`, `furType`). Breed is not a variant axis, so its
 * line says so rather than implying a price grid it never reaches.
 */
export const PET_OPTION_TYPE_WORDS: Record<PetOptionType, PetOptionTypeWords> =
  {
    species: {
      title: "Jenis hewan",
      noun: "jenis hewan",
      usedBy: "Dipilih di data hewan dan dipakai harga varian layanan.",
      heldBy: "hewan atau layanan",
      placeholder: "mis. Kelinci",
    },
    breed: {
      title: "Ras",
      noun: "ras",
      usedBy:
        "Dipilih di data hewan. Harga layanan tidak dibedakan per ras.",
      heldBy: "hewan",
      placeholder: "mis. Persia",
    },
    size: {
      title: "Ukuran",
      noun: "ukuran",
      usedBy:
        "Dipakai data hewan, harga varian layanan, dan komisi grooming. Urutkan dari yang terkecil — urutan ini yang dipakai di semua layar.",
      heldBy: "hewan atau layanan",
      placeholder: "mis. Ekstra besar",
    },
    furType: {
      title: "Jenis bulu",
      noun: "jenis bulu",
      usedBy: "Dipilih di data hewan dan dipakai harga varian layanan.",
      heldBy: "hewan atau layanan",
      placeholder: "mis. Bulu keriting",
    },
  };

/** The order every picker uses — the same rule as `usePetOptions`. */
export function byOrder(a: PetOption, b: PetOption) {
  return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "id");
}

/**
 * A size's weight range as a reader sees it. `[min, max)` — the lower bound is
 * included, the upper is not — so "0 – <3 kg" says what the screen means and
 * the next size's "3 – <8 kg" visibly starts where this one stops.
 */
export function formatWeightRange(option: {
  minWeightKg?: number | null;
  maxWeightKg?: number | null;
}): string {
  const { minWeightKg: min, maxWeightKg: max } = option;
  if (min === null || min === undefined) return "—";
  const kg = (value: number) =>
    String(value).replace(".", ",");
  return max === null || max === undefined
    ? `≥ ${kg(min)} kg`
    : `${kg(min)} – <${kg(max)} kg`;
}

/**
 * Reads the two weight fields a size dialog holds as typed text. Empty is
 * null; a comma is a decimal point. `error` is the sentence for the field when
 * the pair cannot be sent.
 */
export function parseWeightRange(
  minText: string,
  maxText: string,
): { min: number | null; max: number | null; error: string | null } {
  const parse = (text: string) =>
    text.trim() === "" ? null : Number(text.trim().replace(",", "."));
  const min = parse(minText);
  const max = parse(maxText);
  const bad = (value: number | null) =>
    value !== null && (!Number.isFinite(value) || value < 0);

  let error: string | null = null;
  if (bad(min) || bad(max)) error = "Isi berat dengan angka, 0 atau lebih.";
  else if (max !== null && min === null) error = "Isi berat minimum dulu.";
  else if (min !== null && max !== null && max <= min)
    error = "Berat maksimum harus lebih besar dari minimum.";

  return { min, max, error };
}
