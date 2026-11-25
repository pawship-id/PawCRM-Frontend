"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { commissionSizes } from "@/features/grooming/settings";
import {
  stepsProblem,
  withoutFixedTimes,
} from "@/features/grooming/serviceStepsDraft";
import { formatWeightRange } from "@/features/settings/petOptions";
import { useServiceSteps } from "@/hooks/useServiceSteps";
import { usePetOptions } from "@/hooks/usePetOptions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import type { AutoSaveState } from "@/components";
import { tenantService } from "@/services/tenant.service";
import type { HotelSettings } from "@/types/api";

import {
  draftToSettings,
  isDirty,
  toDraft,
  validateDraft,
  withHotelDefaults,
  type HotelSettingsDraft,
} from "../settings";

interface Loaded {
  settings: HotelSettings;
  baseline: HotelSettingsDraft;
}

/** Kegiatan harian saves itself (22 November 2026, BO) — where that stands. */
export type StepsSaveStatus = AutoSaveState;

/** How long Kegiatan harian waits after the last change before saving. */
const STEPS_SAVE_DELAY_MS = 600;

/** The draft minus Kegiatan harian, which is not part of the Simpan bar. */
const withoutSteps = (draft: HotelSettingsDraft) => ({ ...draft, steps: null });

/**
 * Layanan › Hotel › Pengaturan — the night's commission, one draft and one
 * `PATCH /tenants/me`, as Antar-Jemput's page does it (21 November 2026).
 */
export function useHotelSettings() {
  const petOptions = usePetOptions();
  const stepList = useServiceSteps();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<HotelSettingsDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    tenantService
      .me()
      .then((tenant) => {
        if (!active) return;
        const settings = withHotelDefaults(tenant.settings?.hotel);
        const baseline = toDraft(settings);
        setLoaded({ settings, baseline });
        setDraft(baseline);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(
          error instanceof ApiError
            ? error.fullMessage
            : "Pengaturan hotel tidak bisa dimuat. Coba lagi.",
        );
      });
    return () => {
      active = false;
    };
  }, [nonce]);

  const sizes = useMemo(
    () =>
      commissionSizes(
        petOptions.ordered("size"),
        loaded?.settings.commission.service.sizeNominal ?? {},
      ),
    [petOptions, loaded],
  );
  /** Each size's weight range ("0 – <5 kg"), for the per-size table. */
  const sizeRanges = useMemo(
    () =>
      Object.fromEntries(
        petOptions
          .ordered("size")
          .map((option) => [option._id, formatWeightRange(option)]),
      ) as Record<string, string>,
    [petOptions],
  );
  const errors = useMemo(
    () =>
      draft
        ? validateDraft(
            draft,
            sizes.map((size) => size.id),
          )
        : {},
    [draft, sizes],
  );
  // Kegiatan harian saves itself, so it never makes the Simpan bar dirty.
  const dirty = Boolean(
    draft &&
    loaded &&
    isDirty(
      withoutSteps(draft) as unknown as HotelSettingsDraft,
      withoutSteps(loaded.baseline) as unknown as HotelSettingsDraft,
    ),
  );

  /*
    ─── KEGIATAN HARIAN SAVES ITSELF ─────────────────────────────────────────
    BO (22 November 2026): picking, removing, moving a kegiatan or changing its
    jam / porsi saves at once — no Simpan. It is sent on top of the SAVED
    commission (`loaded.baseline`), so a commission edit still waiting for
    Simpan is never saved by accident. A draft the server would refuse (porsi
    not 100, a half-typed jam) waits until it is valid, with its problem shown.
  */
  const [stepsStatus, setStepsStatus] = useState<StepsSaveStatus>("idle");
  /** The last payload sent, so a server spelling that differs cannot loop. */
  const [sentStepsKey, setSentStepsKey] = useState<string | null>(null);

  const hotelTimeOf = useCallback(
    (name: string) => stepList.stepFor(name)?.hotelTime,
    [stepList],
  );
  const cleanSteps = draft ? withoutFixedTimes(draft.steps, hotelTimeOf) : null;
  const stepsKey =
    cleanSteps && loaded && !stepsProblem(cleanSteps)
      ? JSON.stringify(
          draftToSettings(
            { ...loaded.baseline, steps: cleanSteps },
            loaded.settings,
          ).defaultSteps,
        )
      : null;
  const savedStepsKey = loaded
    ? JSON.stringify(loaded.settings.defaultSteps)
    : null;
  const stepsPending =
    stepsKey !== null &&
    stepsKey !== savedStepsKey &&
    stepsKey !== sentStepsKey;

  useEffect(() => {
    if (!stepsPending || !cleanSteps || !stepsKey || !loaded) return;
    const steps = cleanSteps;
    const key = stepsKey;
    const current = loaded;
    const timer = window.setTimeout(async () => {
      setSentStepsKey(key);
      setStepsStatus("saving");
      try {
        const tenant = await tenantService.updateSettings({
          hotel: draftToSettings(
            { ...current.baseline, steps },
            current.settings,
          ),
        });
        const settings = withHotelDefaults(tenant.settings?.hotel);
        setLoaded({ settings, baseline: toDraft(settings) });
        setStepsStatus("saved");
      } catch (error) {
        // Not retried on its own — that would toast every few hundred ms while
        // the server is down. The next change to Kegiatan harian tries again.
        setStepsStatus("error");
        try {
          swalToast(
            `Kegiatan harian belum tersimpan. ${error instanceof ApiError ? error.fullMessage : "Coba lagi."}`,
            "error",
            6000,
          );
        } catch {
          /* The card says it failed too. */
        }
      }
    }, STEPS_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // `stepsKey` is the whole of what changed; the steps it was built from ride along.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsKey, stepsPending, loaded]);

  const update = useCallback((patch: Partial<HotelSettingsDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  /** Kegiatan harian, changed from the draft as it stands — the picker's quick add answers after an await. */
  const updateSteps = useCallback(
    (
      change: (
        steps: HotelSettingsDraft["steps"],
      ) => HotelSettingsDraft["steps"],
    ) => {
      setDraft((prev) =>
        prev ? { ...prev, steps: change(prev.steps) } : prev,
      );
    },
    [],
  );

  async function save() {
    if (!draft || !loaded || saving || Object.keys(errors).length > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const tenant = await tenantService.updateSettings({
        // A kegiatan whose Jam default is words keeps no clock time.
        hotel: draftToSettings(
          {
            ...draft,
            steps: withoutFixedTimes(
              draft.steps,
              (name) => stepList.stepFor(name)?.hotelTime,
            ),
          },
          loaded.settings,
        ),
      });
      const settings = withHotelDefaults(tenant.settings?.hotel);
      const baseline = toDraft(settings);
      setLoaded({ settings, baseline });
      // Kegiatan harian typed while this was in flight is kept.
      setDraft((prev) =>
        prev ? { ...baseline, steps: prev.steps } : baseline,
      );
      try {
        swalToast("Pengaturan hotel tersimpan.");
      } catch {
        /* The page already shows what was saved. */
      }
    } catch (error) {
      const message = `Pengaturan belum tersimpan. ${error instanceof ApiError ? error.fullMessage : "Coba lagi."}`;
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  return {
    draft,
    settings: loaded?.settings ?? null,
    sizes,
    sizeRanges,
    sizesError: petOptions.error,
    errors,
    dirty,
    saving,
    loadError,
    saveError,
    update,
    updateSteps,
    /** Kegiatan harian's own save — "Menyimpan…", "Tersimpan", or failed. */
    stepsStatus:
      stepsPending && stepsStatus !== "saving" ? "saving" : stepsStatus,
    save,
    // Batalkan perubahan is about the commission; Kegiatan harian is already saved.
    discard: () =>
      loaded &&
      setDraft((prev) =>
        prev ? { ...loaded.baseline, steps: prev.steps } : loaded.baseline,
      ),
    retry: () => {
      setLoadError(null);
      setNonce((n) => n + 1);
    },
  };
}
