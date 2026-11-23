"use client";

import {
  useEffect,
  useState,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import { GripVertical, X } from "lucide-react";

import {
  Alert,
  AutoSaveStatus,
  Card,
  Spinner,
  type AutoSaveState,
} from "@/components";
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
import { ServiceStepFormDialog } from "@/features/settings/components/ServiceStepFormDialog";
import {
  invalidateServiceSteps,
  useServiceSteps,
} from "@/hooks/useServiceSteps";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { serviceService } from "@/services/service.service";
import type { ServiceKind, Service, UpdateServiceInput } from "@/types/api";

import { statusOf } from "../serviceDisplay";
import {
  addStep,
  clockTimeOf,
  fixedTimeText,
  MAX_SESSIONS,
  moveStep,
  removeStep,
  seedSteps,
  setTime,
  setWeight,
  splitEvenly,
  stepsPatch,
  stepsProblem,
  stepsSignature,
  stepsTotal,
  withoutFixedTimes,
  type StepsDraft,
} from "../serviceStepsDraft";
import { DraftSaveBar } from "./DraftSaveBar";

/** How long a hotel service waits after the last change before saving. */
const AUTO_SAVE_DELAY_MS = 600;

/** The same add-ons, whatever order they were ticked in. */
function sameIds(a: string[], b: string[]): boolean {
  return (
    a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",")
  );
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
    `services:read`. Shared with the picker below — the tenant's ONE list,
    every service picks from it (22 September 2026).
  */
  const stepList = useServiceSteps();
  /* The Kelompok layanan — which add-ons are offered below. */
  const kind = service.serviceKind ?? moduleKind ?? null;

  /* A HOTEL tahapan has a default clock time (21 November 2026). */
  const withTimes = kind === "hotel";
  /*
    A HOTEL SERVICE SAVES ITSELF (BO, 22 November 2026) — like Hotel ›
    Pengaturan › Kegiatan harian: no Simpan bar, each change is sent shortly
    after the last one, and the fields stay usable while it goes. Grooming
    keeps its Simpan.
  */
  const autoSave = withTimes && mayUpdate;
  const [autoStatus, setAutoStatus] = useState<AutoSaveState>("idle");
  /** The last patch sent, so a server spelling that differs cannot loop. */
  const [sentKey, setSentKey] = useState<string | null>(null);
  /** The typed name "Buat tahapan baru…" opened the form with; null = closed. */
  const [creating, setCreating] = useState<string | null>(null);
  const busy = autoSave ? false : saving;

  const disabled = !mayUpdate || busy;
  const storedAddonIds = service.addonServiceIds ?? [];
  const isMain = service.serviceType === "main";
  /*
    Dipakai di (23 November 2026): a main service picks tahapan for its own
    kind, an add-on for the kinds it is offered with (none = every step).
  */
  const stepKinds: ServiceKind[] = isMain
    ? kind
      ? [kind]
      : []
    : (service.serviceKinds ?? []);
  /* A tahapan whose Jam default (hotel) is words keeps no clock time. */
  const cleanDraft = withTimes
    ? withoutFixedTimes(draft, (name) => stepList.stepFor(name)?.hotelTime)
    : draft;
  const stepsDirty =
    stepsSignature(cleanDraft) !== stepsSignature(seedSteps(service));
  const addonsDirty = isMain && !sameIds(addonIds, storedAddonIds);
  const dirty = stepsDirty || addonsDirty;
  const problem = stepsProblem(cleanDraft);
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

  function patchOf(): UpdateServiceInput {
    return {
      ...(stepsDirty ? stepsPatch(cleanDraft, { withTimes }) : {}),
      ...(addonsDirty ? { addonServiceIds: addonIds } : {}),
    };
  }

  const autoPatch = autoSave && dirty && !problem ? patchOf() : null;
  const autoKey = autoPatch ? JSON.stringify(autoPatch) : null;
  const autoPending = autoKey !== null && autoKey !== sentKey;

  useEffect(() => {
    if (!autoPending || !autoPatch || !autoKey) return;
    const patch = autoPatch;
    const key = autoKey;
    const timer = window.setTimeout(async () => {
      setSentKey(key);
      setAutoStatus("saving");
      setSaveError(null);
      try {
        // The draft is NOT reseeded: what was typed meanwhile stays.
        const updated = await serviceService.update(service._id, patch);
        setAutoStatus("saved");
        onSaved(updated);
      } catch (err) {
        // Not retried on its own; the next change tries again.
        const refusal = sessionsRefusal(err);
        if (refusal) invalidateServiceSteps();
        setAutoStatus("error");
        setSaveError(
          refusal ??
            (err instanceof ApiError
              ? (err.reason ?? err.fullMessage)
              : "Tahapan & add-on belum tersimpan. Coba lagi."),
        );
      }
    }, AUTO_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // `autoKey` is the whole of what changed; the patch it was built from rides along.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey, autoPending]);

  async function save() {
    if (problem || saving || !dirty) return;

    const patch = patchOf();

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
        "'Spa' belum ada di daftar tahapan". The list changed since it
        was read, so it is read again and the rows' words follow.
      */
      const refusal = sessionsRefusal(err);
      if (refusal) invalidateServiceSteps();
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
        ? {
            label: `Total ${total}%`,
            className: "bg-tint-success text-success",
          }
        : { label: `Total ${total}%`, className: "bg-tint-danger text-danger" };

  const addonOptions = addons.all.filter(
    (addon) =>
      addon._id !== service._id &&
      (addonIds.includes(addon._id) ||
        storedAddonIds.includes(addon._id) ||
        (addon.deletedAt === null &&
          addon.isActive &&
          /* This Kelompok layanan's add-ons, or every kind's (22 Sep 2026). */
          (!kind ||
            (addon.serviceKinds ?? []).length === 0 ||
            (addon.serviceKinds ?? []).includes(kind)))),
  );
  const missingAddons =
    addons.loading || addons.failed
      ? 0
      : addonIds.filter((id) => !addons.all.some((addon) => addon._id === id))
          .length;

  return (
    <div className="flex flex-col gap-6">
      {mayUpdate && !autoSave && dirty && (
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
        description={
          autoSave
            ? "Perubahan tahapan dan add-on di layanan ini langsung tersimpan."
            : undefined
        }
        action={
          <span className="flex flex-wrap items-center gap-3">
            {autoSave && (
              <AutoSaveStatus
                status={
                  autoPending && autoStatus !== "saving" ? "saving" : autoStatus
                }
              />
            )}
            {badge && (
              <Badge
                variant="outline"
                className={cn(
                  "border-transparent tabular-nums",
                  badge.className,
                )}
              >
                {badge.label}
              </Badge>
            )}
          </span>
        }
      >
        {autoSave && problem && (
          <p className="mb-3 text-sm font-semibold text-danger">
            {problem} Belum disimpan sampai dibetulkan.
          </p>
        )}
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
                      disabled={busy}
                      onPointerDown={() => setArmed(index)}
                      onPointerUp={() => setArmed(null)}
                      onKeyDown={(event) => moveByKey(event, index)}
                      className="flex size-9 flex-none cursor-grab items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
                    >
                      <GripVertical className="size-4" />
                    </button>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {name}
                      </span>
                      {flag && <ServiceStepFlagBadge flag={flag} />}
                    </span>
                    {/* Catatan from Pengaturan › Tahapan — hotel only
                        (23 November 2026). */}
                    {withTimes && stepList.stepFor(name)?.note && (
                      <span className="mt-0.5 block text-xs text-muted">
                        {stepList.stepFor(name)?.note}
                      </span>
                    )}
                  </span>
                  {withTimes &&
                  fixedTimeText(stepList.stepFor(name)?.hotelTime) ? (
                    <span className="w-32 text-sm text-muted">
                      {fixedTimeText(stepList.stepFor(name)?.hotelTime)}
                    </span>
                  ) : (
                    withTimes && (
                      <Input
                        type="time"
                        aria-label={`Jam default ${name}`}
                        title="Jam default — kosongkan kalau tahapan ini tidak perlu jam"
                        value={draft.times[name] ?? ""}
                        disabled={disabled}
                        onChange={(event) =>
                          change(setTime(draft, name, event.target.value))
                        }
                        className="h-9 w-32 tabular-nums"
                      />
                    )
                  )}
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
                      disabled={busy}
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
              taken={draft.sessions}
              mayAddToList={mayUpdate}
              disabled={busy}
              onCreate={withTimes ? setCreating : undefined}
              kinds={stepKinds}
              disabledReason={
                draft.sessions.length >= MAX_SESSIONS
                  ? `Maksimal ${MAX_SESSIONS} tahapan.`
                  : null
              }
              onPick={(name) =>
                change((current) =>
                  addStep(
                    current,
                    name,
                    withTimes
                      ? clockTimeOf(stepList.stepFor(name)?.hotelTime)
                      : null,
                  ),
                )
              }
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || draft.sessions.length < 2}
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
            Belum ada layanan yang ditandai sebagai add-on. Buat layanannya
            dengan jenis “Add-on”, nanti muncul di sini.
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
                          : cn(
                              "cursor-pointer",
                              !checked && "hover:bg-surface-hover",
                            ),
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

      {creating !== null && (
        <ServiceStepFormDialog
          initialName={creating}
          defaultUsedIn={stepKinds}
          description="Masuk ke daftar tahapan di Pengaturan › Tahapan dan langsung jadi tahapan layanan ini."
          onClose={() => setCreating(null)}
          onSaved={() => invalidateServiceSteps()}
          onCreated={(step) =>
            change((current) =>
              addStep(current, step.name, clockTimeOf(step.hotelTime)),
            )
          }
        />
      )}
    </div>
  );
}
