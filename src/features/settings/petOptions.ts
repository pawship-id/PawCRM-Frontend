import type { PetOption, PetOptionType } from "@/types/api";

/**
 * Pengaturan › Layanan › Data hewan — the words, paths and ordering rule the
 * screen and its hub card share.
 */

export const SERVICE_SETTINGS_PATH = "/dashboard/master/layanan";
export const PET_DATA_PATH = `${SERVICE_SETTINGS_PATH}/data-hewan`;

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
