"use client";

import type { ReactNode } from "react";

import { Spinner } from "@/components";
import { Button } from "@/components/ui/button";

/**
 * The bar at the head of a detail-page section edited in place — Varian & Harga,
 * Tahapan — once its draft differs from what is stored.
 *
 * Batal throws the draft away; the primary button names what it saves and sends
 * the draft as one PATCH. While `problem` is set the bar says why and the save is
 * disabled — the same "disabled with a reason" a form's action bar gives.
 */
export function DraftSaveBar({
  problem,
  saving,
  saveLabel,
  onDiscard,
  onSave,
}: {
  problem: ReactNode | null;
  saving: boolean;
  /** Names the object — "Simpan tahapan", never bare "Simpan". */
  saveLabel: string;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-surface-selected px-4 py-3">
      <p className="min-w-0 flex-1 text-sm text-foreground">
        Ada perubahan yang belum disimpan.
        {problem !== null && <> {problem}</>}
      </p>
      <Button type="button" variant="secondary" disabled={saving} onClick={onDiscard}>
        Batal
      </Button>
      <Button
        type="button"
        disabled={saving || problem !== null}
        onClick={onSave}
      >
        {saving && <Spinner size={16} />}
        {saving ? "Menyimpan…" : saveLabel}
      </Button>
    </div>
  );
}
