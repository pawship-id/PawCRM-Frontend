import { Check } from "lucide-react";

import { Spinner } from "./Spinner";

/** Where a section that saves itself stands. */
export type AutoSaveState = "idle" | "saving" | "saved" | "error";

/**
 * "Menyimpan…" / "Tersimpan" / "Belum tersimpan" — the corner of a card whose
 * changes save themselves, with no Simpan (BO, 22 November 2026: Hotel ›
 * Pengaturan › Kegiatan harian, and a hotel service's tahapan). Announced, and
 * never colour alone.
 */
export function AutoSaveStatus({ status }: { status: AutoSaveState }) {
  return (
    <span aria-live="polite" className="flex items-center gap-1.5 text-sm">
      {status === "saving" && (
        <span className="flex items-center gap-1.5 text-muted">
          <Spinner size={14} /> Menyimpan…
        </span>
      )}
      {status === "saved" && (
        <span className="flex items-center gap-1.5 text-success">
          <Check className="size-4" aria-hidden /> Tersimpan
        </span>
      )}
      {status === "error" && (
        <span className="font-semibold text-danger">Belum tersimpan</span>
      )}
    </span>
  );
}
