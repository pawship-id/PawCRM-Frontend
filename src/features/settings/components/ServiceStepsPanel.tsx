"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import {
  Alert,
  FilterBar,
  FilterPills,
  FilterToggle,
  Spinner,
} from "@/components";
import { Button } from "@/components/ui/button";
import { pickGroomingLine } from "@/features/grooming/board";
import { Can, usePermissions } from "@/features/permissions";
import { invalidateServiceSteps } from "@/hooks/useServiceSteps";
import type { ServiceStep } from "@/types/api";

import type { UseServiceStepListResult } from "../hooks/useServiceStepList";
import { byStepOrder } from "../serviceSteps";
import { ServiceStepFormDialog } from "./ServiceStepFormDialog";
import { ServiceStepsTable } from "./ServiceStepsTable";

/** Where business lines are made — Keuangan › Lini bisnis. */
const BUSINESS_LINES_PATH = "/dashboard/keuangan/business-lines";

/** Which dialog is open: none, add to the current line, or rename that step. */
type DialogState =
  | { mode: "create" }
  | { mode: "rename"; step: ServiceStep }
  | null;

/**
 * Tahapan — one section of Pengaturan › Layanan: the steps a line's services
 * pick from, Mandi, Gunting, Blow dry. A screen of its own until 17 September
 * 2026.
 *
 * A LIST PER BUSINESS LINE (`servicesteps`, 14 September 2026). A grooming
 * shop's steps are not its hotel's, so the line is the panel's main lens — a
 * pill row with counts (§8), opening on the line named like Grooming
 * (`pickGroomingLine`, the rule the grooming tabs already use), else the first.
 *
 * THE BOBOT IS NOT HERE. A step's commission weight belongs to its place in a
 * service (`sessionWeights[i]`) and is filled in there; this panel is only the
 * vocabulary, and the section's callout says so.
 *
 * THE COUNTS ARE LIVE STEPS — active and retired, not deleted — whatever the
 * toggle says, on Opsi Varian's rule.
 *
 * THE LIST IS THE HUB'S, passed in, so the rail can count it (see
 * `useServiceStepList`). After every write, two re-reads: that list, and the
 * line's shared store (`invalidateServiceSteps(lineId)`), so a step added here
 * is on a service's Tahapan card without a reload.
 */
export function ServiceStepsPanel({
  list,
  mayReadLines,
  intro,
}: {
  list: UseServiceStepListResult;
  /** `businessLines:read` — the hub asked the hook with the same flag. */
  mayReadLines: boolean;
  intro?: ReactNode;
}) {
  const { can } = usePermissions();
  const { lines, linesLoading, linesError, steps, loading, error, refetch } =
    list;

  const [chosenLineId, setChosenLineId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  // Derived, not stored: the default is only known once the lines arrive, and
  // an effect copying it into state would draw one frame with no line.
  const line =
    lines.find((candidate) => candidate._id === chosenLineId) ??
    pickGroomingLine(lines) ??
    lines[0] ??
    null;
  const lineId = line?._id ?? null;

  const firstLoad = loading && steps.length === 0;

  const pills = lines.map((candidate) => ({
    value: candidate._id,
    label: candidate.name,
    // No number until there is one: "0" while loading is a claim.
    count: firstLoad
      ? undefined
      : steps.filter(
          (step) =>
            step.businessLineId === candidate._id && step.deletedAt === null,
        ).length,
  }));

  const ofLine = useMemo(
    () =>
      steps.filter((step) => step.businessLineId === lineId).sort(byStepOrder),
    [steps, lineId],
  );
  const rows = showDeleted
    ? ofLine
    : ofLine.filter((step) => step.deletedAt === null);
  const hiddenDeleted = ofLine.length - rows.length;

  function afterWrite() {
    refetch();
    if (lineId) invalidateServiceSteps(lineId);
  }

  return (
    <div className="flex flex-col gap-5">
      {intro}

      {!mayReadLines ? (
        // No request was sent: GET /business-lines would refuse this role, and
        // steps without the line they belong to are a list of orphans.
        <Alert variant="info">
          Tahapan disusun per lini bisnis, dan akses ini belum bisa melihat
          daftar lini bisnis. Minta akses Lini bisnis ke pemilik toko.
        </Alert>
      ) : linesLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat tahapan…
        </div>
      ) : linesError ? (
        <Alert variant="error">{linesError}</Alert>
      ) : line === null ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="font-semibold text-foreground">Belum ada lini bisnis.</p>
          <p className="mt-1 text-sm text-muted">
            Tahapan disusun per lini bisnis — buat lininya dulu, mis. Grooming.
          </p>
          {can("businessLines", "create") && (
            <Button asChild variant="ghost" className="mt-2">
              <Link href={BUSINESS_LINES_PATH}>Tambah lini bisnis →</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <FilterPills
            ariaLabel="Lini bisnis"
            value={line._id}
            options={pills}
            onChange={setChosenLineId}
          />

          <FilterBar
            actions={
              <Can feature="services" action="update">
                <Button onClick={() => setDialog({ mode: "create" })}>
                  <Plus className="size-4" aria-hidden />
                  Tambah tahapan
                </Button>
              </Can>
            }
          >
            <FilterToggle
              label="Tampilkan yang dihapus"
              checked={showDeleted}
              onChange={setShowDeleted}
            />
          </FilterBar>

          {error && <Alert variant="error">{error}</Alert>}

          {/* A failed first load draws nothing below the Alert: "Belum ada
              tahapan" would read as a true answer about the shop's data. */}
          {firstLoad ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Spinner /> Memuat tahapan…
            </div>
          ) : error && steps.length === 0 ? null : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
              <p className="font-semibold text-foreground">
                Belum ada tahapan di {line.name}.
              </p>
              {hiddenDeleted > 0 && (
                <p className="mt-1 text-sm text-muted">
                  {hiddenDeleted} tahapan yang dihapus disembunyikan — nyalakan
                  Tampilkan yang dihapus untuk memulihkannya.
                </p>
              )}
              {can("services", "update") && (
                <Button
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setDialog({ mode: "create" })}
                >
                  Tambah yang pertama →
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Keyed by line so a refusal shown on one list does not follow
                  the reader onto the next. */}
              <ServiceStepsTable
                key={line._id}
                line={line}
                rows={rows}
                loading={loading}
                onRename={(step) => setDialog({ mode: "rename", step })}
                onChanged={afterWrite}
              />
              <p className="max-w-2xl text-sm text-muted">
                <b className="font-semibold text-foreground">Nonaktifkan</b>{" "}
                kalau sudah tidak mau dipilih: tidak muncul lagi saat mengisi
                layanan, tapi layanan yang sudah memakainya tetap.{" "}
                <b className="font-semibold text-foreground">Hapus</b> hanya
                bisa selama belum dipakai layanan mana pun. Ganti nama di sini,
                semua layanan lini itu ikut; booking yang sudah dibuat tetap
                memakai nama lama.
              </p>
            </>
          )}
        </>
      )}

      {dialog && line && (
        <ServiceStepFormDialog
          key={dialog.mode === "rename" ? dialog.step._id : `create-${line._id}`}
          line={line}
          step={dialog.mode === "rename" ? dialog.step : undefined}
          onClose={() => setDialog(null)}
          onSaved={afterWrite}
        />
      )}
    </div>
  );
}
