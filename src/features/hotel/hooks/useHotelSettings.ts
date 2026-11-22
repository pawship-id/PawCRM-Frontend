"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { commissionSizes } from "@/features/grooming/settings";
import { formatWeightRange } from "@/features/settings/petOptions";
import { usePetOptions } from "@/hooks/usePetOptions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
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

/**
 * Layanan › Hotel › Pengaturan — the night's commission, one draft and one
 * `PATCH /tenants/me`, as Antar-Jemput's page does it (21 November 2026).
 */
export function useHotelSettings() {
  const petOptions = usePetOptions();
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
  const dirty = Boolean(draft && loaded && isDirty(draft, loaded.baseline));

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
        hotel: draftToSettings(draft, loaded.settings),
      });
      const settings = withHotelDefaults(tenant.settings?.hotel);
      const baseline = toDraft(settings);
      setLoaded({ settings, baseline });
      setDraft(baseline);
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
    save,
    discard: () => loaded && setDraft(loaded.baseline),
    retry: () => {
      setLoadError(null);
      setNonce((n) => n + 1);
    },
  };
}
