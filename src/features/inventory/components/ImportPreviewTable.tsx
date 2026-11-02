"use client";

import { ImportVerdictTable } from "@/components";
import type {
  ImportVerdict,
  ImportVerdictStatus,
} from "@/types/productImport";

/** Step 2: the shared verdict table, in this import's own words. */

const LABELS: Record<ImportVerdictStatus, string> = {
  ok: "Siap",
  conflict: "Sudah ada",
  duplicate_in_file: "Ganda di file",
  family_conflict: "Beda dengan saudaranya",
  invalid: "Belum lengkap",
};

export function ImportPreviewTable({ rows }: { rows: ImportVerdict[] }) {
  return <ImportVerdictTable rows={rows} statusLabels={LABELS} />;
}
