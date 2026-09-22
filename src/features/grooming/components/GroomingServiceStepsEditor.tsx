"use client";

import { useState, type KeyboardEvent, type SetStateAction } from "react";
import { GripVertical, X } from "lucide-react";

import { Alert, Card, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  formatDurationRange,
  formatServicePrice,
  serviceDurationBounds,
  ServiceStepFlagBadge,
  serviceStepFlag,
  ServiceStepPicker,
  sessionsRefusal,
} from "@/features/services";
import { invalidateServiceSteps, useServiceSteps } from "@/hooks/useServiceSteps";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { serviceService } from "@/services/service.service";
import type { ServiceKind, Service, UpdateServiceInput } from "@/types/api";

import { statusOf } from "../serviceDisplay";
import {
  addStep,
  MAX_SESSIONS,
  moveStep,
  removeStep,
  seedSteps,
  setWeight,
  splitEvenly,
  stepsPatch,
  stepsProblem,
  stepsSignature,
  stepsTotal,
  type StepsDraft,
} from "../serviceStepsDraft";
import { DraftSaveBar } from "./DraftSaveBar";

/** The same add-ons, whatever order they were ticked in. */
function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
}

export interface AddonCatalog {
  /** Every add-on in the tenant, deleted ones too. */
  all: Service[];
  loading: boolean;
  failed: boolean;
}

/**
 * Layanan › Grooming › a service › Tahapan & Add-on — BOTH CARDS EDITED IN
 * PLACE, as `buloo-grooming-v3.html` draws them (decided 14 September 2026, on
 * request).
 *
 * ONE DRAFT FOR THE TAB, ONE SIMPAN. The tahapan list (`serviceStepsDraft.ts`)
 * and the ticked add-ons are one question on the mockup — which work this
 * service is — so `DraftSaveBar` appears once either differs from what is
 * stored, and sends ONE PATCH carrying only the half that changed: `sessions` +
 * `sessionWeights`, and/or `addonServiceIds`. Sending an unchanged add-on list
 * would re-judge ids somebody deleted since, and refuse a save about weights.
 *
 * WHAT A SAVE CHANGES: the tahapan a NEW booking line is split into, how its
 * commission is shared, and the add-ons a new line may carry. A booking already
 * made keeps what it was made with — it was copied onto it.
 *
 * REORDERING: the handle drags, and it also answers ArrowUp / ArrowDown, so the
 * order is not a mouse-only question.
 *
 * ─── WHAT THE MOCKUP HAS AND THIS DOES NOT ─────────────────────────────────
 *
 * A SHOP-WIDE list of tahapan: the list is PER BUSINESS LINE (14 September
 * 2026). The picker (`ServiceStepPicker`, shared with the service form) offers
 * the active steps of this service's line that it does not list yet, and
 * somebody who may edit can add a missing name to that list from the popover.
 * The server refuses any other name on save. A name this service already holds
 * that is retired on the list, or not on it (stored while tahapan were free
 * text), stays — marked "nonaktif" / "belum di daftar" — and may be removed but
 * not added back.
 *
 * "— tahapan tidak dipakai" on an add-on: the mockup files each add-on under a
 * tahapan of the main service. No such link is stored — a booking adds an
 * add-on as its own line — so the card cannot say it, and says the add-on's
 * code instead.
 *
 * AN ADD-ON THAT IS OFF OR DELETED is offered only while this service still
 * lists it, marked so, and may be unticked but not ticked again.
 */
export function GroomingServiceStepsEditor({
  service,
  mayUpdate,
  addons,
  onSaved,
  serviceKind: moduleKind,
}: {
  /** The module's kind — only for an old service that has none of its own. */
  serviceKind?: ServiceKind;
  service: Service;
  /** `services:update` — without it everything is shown and nothing is editable. */
  mayUpdate: boolean;
  addons: AddonCatalog;
  onSaved: (service: Service) => void;
}) {
  const [draft, setDraft] = useState<StepsDraft>(() => seedSteps(service));
  const [addonIds, setAddonIds] = useState<string[]>(
    () => service.addonServiceIds ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** The row whose handle is held — only that row may start a drag. */
  const [armed, setArmed] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  /*
    Read for every role, not only one that may edit: the "nonaktif" / "belum di
    daftar" words on a row are worth knowing to a reader too, and the list is
    `services:read`. Shared with the picker below — one fetch per line.
  */
  /* The service's own Kelompok layanan's list (22 September 2026). */
  const kind = service.serviceKind ?? moduleKind ?? null;
  const stepList = useServiceSteps(kind);

  const disabled = !mayUpdate || saving;
  const storedAddonIds = service.addonServiceIds ?? [];
  const isMain = service.serviceType === "main";
  const stepsDirty = stepsSignature(draft) !== stepsSignature(seedSteps(service));
  const addonsDirty = isMain && !sameIds(addonIds, storedAddonIds);
  const dirty = stepsDirty || addonsDirty;
  const problem = stepsProblem(draft);
  const total = stepsTotal(draft);
  const single = draft.sessions.length === 1;

  /** An updater too — the picker's quick add answers after an await. */
  function change(next: SetStateAction<StepsDraft>) {
    setDraft(next);
    setSaveError(null);
  }

  function toggleAddon(id: string, on: boolean) {
    setAddonIds((current) =>
      on
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((value) => value !== id),
    );
    setSaveError(null);
  }

  function moveByKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const to =
      event.key === "ArrowUp"
        ? index - 1
        : event.key === "ArrowDown"
          ? index + 1
          : null;
    if (to === null) return;

    event.preventDefault();
    change(moveStep(draft, index, to));
  }

  function discard() {
    setDraft(seedSteps(service));
    setAddonIds(storedAddonIds);
    setSaveError(null);
  }

  async function save() {
    if (problem || saving || !dirty) return;

    const patch: UpdateServiceInput = {
      ...(stepsDirty ? stepsPatch(draft) : {}),
      ...(addonsDirty ? { addonServiceIds: addonIds } : {}),
    };

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await serviceService.update(service._id, patch);
      setDraft(seedSteps(updated));
      setAddonIds(updated.addonServiceIds ?? []);
      swalToast("Tahapan & add-on tersimpan.");
      onSaved(updated);
    } catch (err) {
      /*
        A REFUSED TAHAPAN says which one and why, in Bahasa, in `details` —
        "'Spa' belum ada di daftar tahapan kelompok layanan ini". The list changed since it
        was read, so it is read again and the rows' words follow.
      */
      const refusal = sessionsRefusal(err);
      if (refusal) invalidateServiceSteps(kind);
      setSaveError(
        refusal ??
          (err instanceof ApiError
            ? (err.reason ?? err.fullMessage)
            : "Tahapan & add-on belum tersimpan. Coba lagi."),
      );
    } finally {
      setSaving(false);
    }
  }

  const badge =
    total === null
      ? draft.sessions.length === 0
        ? null
        : { label: "Dibagi rata", className: "bg-tint-neutral text-muted" }
      : total === 100
        ? { label: `Total ${total}%`, className: "bg-tint-success text-success" }
        : { label: `Total ${total}%`, className: "bg-tint-danger text-danger" };

  const addonOptions = addons.all.filter(
    (addon) =>
      addon._id !== service._id &&
      (addonIds.includes(addon._id) ||
        storedAddonIds.includes(addon._id) ||
        (addon.deletedAt === null && addon.isActive)),
  );
  const missingAddons =
    addons.loading || addons.failed
      ? 0
      : addonIds.filter((id) => !addons.all.some((addon) => addon._id === id))
          .length;

  return (
    <div className="flex flex-col gap-6">
      {mayUpdate && dirty && (
        <DraftSaveBar
          problem={problem && <b className="font-semibold">{problem}</b>}
          saving={saving}
          saveLabel="Simpan tahapan & add-on"
          onDiscard={discard}
          onSave={() => void save()}
        />
      )}

      {saveError && <Alert variant="error">{saveError}</Alert>}

      <Card
        title="Tahapan & bobot komisi"
        action={
          badge && (
            <Badge
              variant="outline"
              className={cn("border-transparent tabular-nums", badge.className)}
            >
              {badge.label}
            </Badge>
          )
        }
      >
        {draft.sessions.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada tahapan.
            {mayUpdate && " Tambah yang pertama lewat Tambah tahapan di bawah."}
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {draft.sessions.map((name, index) => {
              const flag = serviceStepFlag(name, stepList);

              return (
              <li
                key={name}
                draggable={mayUpdate && armed === index}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", name);
                  setDragging(index);
                }}
                onDragOver={(event) => {
                  if (dragging === null) return;
                  event.preventDefault();
                  if (dragging !== index) {
                    change(moveStep(draft, dragging, index));
                    setDragging(index);
                  }
                }}
                onDrop={(event) => event.preventDefault()}
                onDragEnd={() => {
                  setDragging(null);
                  setArmed(null);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2",
                  dragging === index && "border-primary opacity-60",
                )}
              >
                {mayUpdate && (
                  <button
                    type="button"
                    aria-label={`Pindahkan ${name}`}
                    title="Seret untuk mengubah urutan, atau tekan panah atas/bawah"
                    disabled={saving}
                    onPointerDown={() => setArmed(index)}
                    onPointerUp={() => setArmed(null)}
                    onKeyDown={(event) => moveByKey(event, index)}
                    className="flex size-9 flex-none cursor-grab items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
                  >
                    <GripVertical className="size-4" />
                  </button>
                )}
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {name}
                  </span>
                  {flag && <ServiceStepFlagBadge flag={flag} />}
                </span>
                <Input
                  aria-label={`Bobot ${name} (%)`}
                  inputMode="numeric"
                  // One tahapan takes the whole commission, whatever is typed.
                  value={single ? "100" : (draft.weights[name] ?? "")}
                  disabled={disabled || single}
                  onChange={(event) =>
                    change(setWeight(draft, name, event.target.value))
                  }
                  placeholder="rata"
                  className="h-9 w-20 text-right tabular-nums"
                />
                <span className="text-sm text-muted">%</span>
                {mayUpdate && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Hapus tahapan ${name}`}
                    disabled={saving}
                    onClick={() => change(removeStep(draft, index))}
                    className="size-9 p-0 text-muted hover:bg-tint-danger hover:text-danger"
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </li>
              );
            })}
          </ol>
        )}

        {mayUpdate && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ServiceStepPicker
              serviceKind={kind}
              taken={draft.sessions}
              mayAddToList={mayUpdate}
              disabled={saving}
              disabledReason={
                draft.sessions.length >= MAX_SESSIONS
                  ? `Maksimal ${MAX_SESSIONS} tahapan.`
                  : null
              }
              onPick={(name) => change((current) => addStep(current, name))}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving || draft.sessions.length < 2}
              onClick={() => change(splitEvenly(draft))}
            >
              Bagi rata
            </Button>
          </div>
        )}
      </Card>

      <Card title="Add-on yang boleh dipasang">
        {!isMain ? (
          <p className="text-sm text-muted">
            Layanan ini sendiri add-on, jadi tidak bisa punya add-on.
          </p>
        ) : addons.loading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Memuat add-on…
          </div>
        ) : addons.failed ? (
          <Alert variant="error">
            Daftar add-on tidak bisa dimuat. Coba muat ulang.
          </Alert>
        ) : addonOptions.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada layanan yang ditandai sebagai add-on. Buat layanannya dengan
            jenis “Add-on”, nanti muncul di sini.
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-3">
              {addonOptions.map((addon) => {
                const checked = addonIds.includes(addon._id);
                const retired = addon.deletedAt !== null || !addon.isActive;
                // Off or deleted: may be unticked, never ticked again.
                const locked = disabled || (retired && !checked);
                const minutes = serviceDurationBounds(addon);

                return (
                  <li key={addon._id}>
                    <label
                      className={cn(
                        "flex h-full min-h-11 items-center gap-3 rounded-xl border px-4 py-3 transition",
                        checked
                          ? "border-primary bg-surface-selected"
                          : "border-border bg-surface",
                        locked
                          ? "cursor-not-allowed"
                          : cn("cursor-pointer", !checked && "hover:bg-surface-hover"),
                      )}
                    >
                      <Checkbox
                        aria-label={`Pasang add-on ${addon.name}`}
                        checked={checked}
                        disabled={locked}
                        onCheckedChange={(next) =>
                          toggleAddon(addon._id, next === true)
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">
                          {addon.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {minutes !== null && (
                            <span className="tabular-nums">
                              +{formatDurationRange(minutes)} ·{" "}
                            </span>
                          )}
                          <span className="tabular-nums">{addon.code}</span>
                          {retired && (
                            <b className="font-semibold text-danger-ink">
                              {" "}
                              — {statusOf(addon).label.toLowerCase()}
                            </b>
                          )}
                        </span>
                      </span>
                      <span className="text-sm font-bold tabular-nums text-foreground">
                        {formatServicePrice(addon)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {missingAddons > 0 && (
              <p className="mt-3 text-xs text-muted">
                {missingAddons} add-on tidak ditemukan di daftar add-on.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
