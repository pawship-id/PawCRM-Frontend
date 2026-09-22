"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";

import {
  Alert,
  FilterBar,
  FilterPills,
  FilterToggle,
  Spinner,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can, usePermissions } from "@/features/permissions";
import { invalidateServiceSteps } from "@/hooks/useServiceSteps";
import type { ServiceKind, ServiceStep } from "@/types/api";

import type { UseServiceStepListResult } from "../hooks/useServiceStepList";
import { byStepOrder, STEP_GROUPS } from "../serviceSteps";
import { ServiceStepFormDialog } from "./ServiceStepFormDialog";
import { ServiceStepsTable } from "./ServiceStepsTable";

/** Which dialog is open: none, add to the current line, or rename that step. */
type DialogState =
  { mode: "create" } | { mode: "rename"; step: ServiceStep } | null;

/**
 * Tahapan — one section of Pengaturan › Layanan: the steps a line's services
 * pick from, Mandi, Gunting, Blow dry. A screen of its own until 17 September
 * 2026.
 *
 * A LIST PER KELOMPOK LAYANAN — Grooming, Hotel, Antar-Jemput (22 September
 * 2026; per business line from 14 September until then). A grooming's steps
 * are not a hotel's, so the kind is the panel's main lens — a pill row with
 * counts (§8), opening on Grooming. The kinds are the product's own, so the
 * panel no longer needs the tenant's business lines, or the grant to read them.
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
 * kind's shared store (`invalidateServiceSteps(kind)`), so a step added here
 * is on a service's Tahapan card without a reload.
 */
export function ServiceStepsPanel({
  list,
  intro,
}: {
  list: UseServiceStepListResult;
  intro?: ReactNode;
}) {
  const { can } = usePermissions();
  const { steps, loading, error, refetch } = list;

  const [kind, setKind] = useState<ServiceKind>("grooming");
  const [showDeleted, setShowDeleted] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  const line =
    STEP_GROUPS.find((group) => group.serviceKind === kind) ?? STEP_GROUPS[0];

  const firstLoad = loading && steps.length === 0;

  const pills = STEP_GROUPS.map((group) => ({
    value: group.serviceKind,
    label: group.name,
    // No number until there is one: "0" while loading is a claim.
    count: firstLoad
      ? undefined
      : steps.filter(
          (step) =>
            step.serviceKind === group.serviceKind && step.deletedAt === null,
        ).length,
  }));

  const ofLine = useMemo(
    () => steps.filter((step) => step.serviceKind === kind).sort(byStepOrder),
    [steps, kind],
  );
  const rows = showDeleted
    ? ofLine
    : ofLine.filter((step) => step.deletedAt === null);
  const hiddenDeleted = ofLine.length - rows.length;

  function afterWrite() {
    refetch();
    invalidateServiceSteps(kind);
  }

  return (
    <div className="flex flex-col gap-5">
      {intro}

      <>
        <FilterPills
          ariaLabel="Kelompok layanan"
          value={kind}
          options={pills}
          onChange={setKind}
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
              key={kind}
              line={line}
              rows={rows}
              loading={loading}
              onRename={(step) => setDialog({ mode: "rename", step })}
              onChanged={afterWrite}
            />
            <p className="max-w-2xl text-sm text-muted">
              <b className="font-semibold text-foreground">Nonaktifkan</b> kalau
              sudah tidak mau dipilih: tidak muncul lagi saat mengisi layanan,
              tapi layanan yang sudah memakainya tetap.{" "}
              <b className="font-semibold text-foreground">Hapus</b> hanya bisa
              selama belum dipakai layanan mana pun. Ganti nama di sini, semua
              layanan {line.name} ikut; booking yang sudah dibuat tetap memakai
              nama lama.
            </p>
          </>
        )}
      </>

      {dialog && (
        <ServiceStepFormDialog
          key={dialog.mode === "rename" ? dialog.step._id : `create-${kind}`}
          line={line}
          step={dialog.mode === "rename" ? dialog.step : undefined}
          onClose={() => setDialog(null)}
          onSaved={afterWrite}
        />
      )}
    </div>
  );
}
