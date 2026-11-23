"use client";

import { useState } from "react";

import { ArrowDown, ArrowUp, X } from "lucide-react";

import { AutoSaveStatus, Card } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addStep,
  clockTimeOf,
  fixedTimeText,
  MAX_SESSIONS,
  moveStep,
  removeStep,
  setTime,
  setWeight,
  splitEvenly,
  stepsTotal,
  type StepsDraft,
} from "@/features/grooming/serviceStepsDraft";
import {
  ServiceStepFlagBadge,
  serviceStepFlag,
  ServiceStepPicker,
} from "@/features/services";
import { ServiceStepFormDialog } from "@/features/settings/components/ServiceStepFormDialog";
import {
  invalidateServiceSteps,
  useServiceSteps,
} from "@/hooks/useServiceSteps";
import { cn } from "@/lib/utils";

import type { StepsSaveStatus } from "../hooks/useHotelSettings";

const ICON_BUTTON =
  "size-9 p-0 text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-40";

/**
 * Layanan › Hotel › Pengaturan › KEGIATAN HARIAN (BO, 21 November 2026).
 *
 * The tahapan every NEW hotel service starts with — its checklist each night,
 * each with a default clock time and, when the night's commission is split by
 * kegiatan, its porsi. A service copies them when it is created and may change
 * its own after; editing these never rewrites an existing service.
 *
 * ONE TAHAPAN LIST. "Tambah kegiatan" is the same picker a service uses: pick a
 * tahapan already on the list (Pengaturan › Tahapan), or type a new one — which
 * is saved to that list at once and lands here. A tahapan made in Pengaturan ›
 * Tahapan is only on the list until somebody picks it here.
 */
export function HotelDailyStepsCard({
  steps,
  onChange,
  showWeights,
  problem,
  saveStatus = "idle",
  mayUpdate,
  mayAddToList,
  disabled,
}: {
  steps: StepsDraft;
  onChange: (change: (steps: StepsDraft) => StepsDraft) => void;
  /** Porsi komisi — only when the night's commission is split by kegiatan. */
  showWeights: boolean;
  problem?: string;
  /** Kegiatan harian saves itself — said in the card's corner. */
  saveStatus?: StepsSaveStatus;
  mayUpdate: boolean;
  /** `services:update` — a new name may be put on the tahapan list from here. */
  mayAddToList: boolean;
  disabled: boolean;
}) {
  const stepList = useServiceSteps();
  /** The typed name "Buat tahapan baru…" opened the form with; null = closed. */
  const [creating, setCreating] = useState<string | null>(null);
  const total = stepsTotal(steps);
  const single = steps.sessions.length === 1;
  const off = disabled || !mayUpdate;

  return (
    <Card
      title="Kegiatan harian"
      description="Jadi tahapan bawaan setiap layanan hotel baru dan checklist tiap malam. Perubahan di sini langsung tersimpan. Tiap layanan masih bisa mengubah kegiatannya sendiri. Jam bisa diubah per hewan saat booking."
      action={<AutoSaveStatus status={saveStatus} />}
    >
      <div className="flex flex-col gap-4">
        {steps.sessions.length === 0 ? (
          <p className="rounded-lg bg-tint-neutral px-4 py-3 text-sm text-muted">
            Belum ada kegiatan harian.
            {mayUpdate && " Tambah yang pertama lewat Tambah tahapan di bawah."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kegiatan</TableHead>
                  <TableHead className="w-36">Jam default</TableHead>
                  {showWeights && (
                    <TableHead className="w-32">Porsi komisi</TableHead>
                  )}
                  {mayUpdate && (
                    <TableHead className="w-32 text-right">Atur</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {steps.sessions.map((name, index) => {
                  const flag = serviceStepFlag(name, stepList);
                  // Jam default (hotel) written as words on the tahapan
                  // ("Ikut jam datang") is shown as is and cannot be changed
                  // here; a clock time stays editable (22 November 2026, BO).
                  const textTime = fixedTimeText(
                    stepList.stepFor(name)?.hotelTime,
                  );
                  return (
                    <TableRow key={name}>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {name}
                          </span>
                          {flag && <ServiceStepFlagBadge flag={flag} />}
                        </span>
                      </TableCell>
                      <TableCell>
                        {textTime ? (
                          <span className="text-sm text-muted">{textTime}</span>
                        ) : (
                          <Input
                            type="time"
                            aria-label={`Jam default ${name}`}
                            value={steps.times[name] ?? ""}
                            disabled={off}
                            onChange={(event) => {
                              const value = event.target.value;
                              onChange((current) =>
                                setTime(current, name, value),
                              );
                            }}
                            className="h-9 w-32 tabular-nums"
                          />
                        )}
                      </TableCell>
                      {showWeights && (
                        <TableCell>
                          <span className="flex items-center gap-1.5">
                            <Input
                              aria-label={`Porsi komisi ${name} (%)`}
                              inputMode="numeric"
                              // One kegiatan takes the whole night, whatever is typed.
                              value={
                                single ? "100" : (steps.weights[name] ?? "")
                              }
                              disabled={off || single}
                              placeholder="rata"
                              onChange={(event) => {
                                const value = event.target.value;
                                onChange((current) =>
                                  setWeight(current, name, value),
                                );
                              }}
                              className="h-9 w-20 text-right tabular-nums"
                            />
                            <span className="text-sm text-muted">%</span>
                          </span>
                        </TableCell>
                      )}
                      {mayUpdate && (
                        <TableCell>
                          <span className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Naikkan ${name}`}
                              disabled={disabled || index === 0}
                              onClick={() =>
                                onChange((current) =>
                                  moveStep(current, index, index - 1),
                                )
                              }
                              className={ICON_BUTTON}
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Turunkan ${name}`}
                              disabled={
                                disabled || index === steps.sessions.length - 1
                              }
                              onClick={() =>
                                onChange((current) =>
                                  moveStep(current, index, index + 1),
                                )
                              }
                              className={ICON_BUTTON}
                            >
                              <ArrowDown className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Hapus ${name} dari kegiatan harian`}
                              disabled={disabled}
                              onClick={() =>
                                onChange((current) =>
                                  removeStep(current, index),
                                )
                              }
                              className={cn(
                                ICON_BUTTON,
                                "hover:bg-tint-danger hover:text-danger",
                              )}
                            >
                              <X className="size-4" />
                            </Button>
                          </span>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {showWeights && steps.sessions.length > 1 && (
          <p
            className={cn(
              "text-sm",
              total !== null && total !== 100
                ? "font-semibold text-danger"
                : "text-muted",
            )}
          >
            {total === null
              ? "Porsi kosong semua: komisi satu malam dibagi rata ke tiap kegiatan."
              : `Total porsi ${total}%${total === 100 ? "" : " — harus 100%"}.`}
          </p>
        )}
        {problem && (total === null || total === 100) && (
          <p className="text-sm font-semibold text-danger">{problem}</p>
        )}

        {mayUpdate && (
          <div className="flex flex-wrap items-center gap-2">
            <ServiceStepPicker
              taken={steps.sessions}
              mayAddToList={mayAddToList}
              disabled={disabled}
              disabledReason={
                steps.sessions.length >= MAX_SESSIONS
                  ? `Maksimal ${MAX_SESSIONS} kegiatan.`
                  : null
              }
              onCreate={mayAddToList ? setCreating : undefined}
              onPick={(name) =>
                onChange((current) =>
                  addStep(
                    current,
                    name,
                    clockTimeOf(stepList.stepFor(name)?.hotelTime),
                  ),
                )
              }
            />
            {showWeights && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled || steps.sessions.length < 2}
                onClick={() => onChange((current) => splitEvenly(current))}
              >
                Bagi rata
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-muted">
          Pilih dari daftar tahapan, atau pilih Buat tahapan baru. Yang baru
          langsung masuk ke daftar tahapan di Pengaturan › Tahapan.
        </p>
      </div>
      {creating !== null && (
        <ServiceStepFormDialog
          initialName={creating}
          description="Masuk ke daftar tahapan di Pengaturan › Tahapan dan langsung jadi kegiatan harian hotel."
          onClose={() => setCreating(null)}
          onSaved={() => invalidateServiceSteps()}
          onCreated={(step) =>
            onChange((current) =>
              addStep(current, step.name, clockTimeOf(step.hotelTime)),
            )
          }
        />
      )}
    </Card>
  );
}
