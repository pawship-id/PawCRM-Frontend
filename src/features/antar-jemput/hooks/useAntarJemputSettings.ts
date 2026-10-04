"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { tenantService } from "@/services/tenant.service";
import type { AntarJemputSettings } from "@/types/api";

import {
  draftToSettings,
  isDirty,
  toDraft,
  validateDraft,
  withAntarJemputDefaults,
  type AntarJemputSettingsDraft,
} from "../settings";

interface Loaded {
  settings: AntarJemputSettings;
  baseline: AntarJemputSettingsDraft;
}

/**
 * Layanan › Antar-Jemput › Pengaturan — the ride's commission rule, one draft
 * and one `PATCH /tenants/me`, as Grooming's page does it.
 */
export function useAntarJemputSettings() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<AntarJemputSettingsDraft | null>(null);
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
        const settings = withAntarJemputDefaults(tenant.settings?.antarJemput);
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
            : "Pengaturan antar-jemput tidak bisa dimuat. Coba lagi.",
        );
      });

    return () => {
      active = false;
    };
  }, [nonce]);

  const errors = useMemo(() => (draft ? validateDraft(draft) : {}), [draft]);
  const dirty = Boolean(draft && loaded && isDirty(draft, loaded.baseline));

  const update = useCallback(
    (key: keyof AntarJemputSettingsDraft, patch: Partial<AntarJemputSettingsDraft["service"]>) => {
      setDraft((prev) => (prev ? { ...prev, [key]: { ...prev[key], ...patch } } : prev));
    },
    [],
  );

  async function save() {
    if (!draft || !loaded || saving || Object.keys(errors).length > 0) return;

    setSaving(true);
    setSaveError(null);

    try {
      const tenant = await tenantService.updateSettings({
        antarJemput: draftToSettings(draft, loaded.settings),
      });
      const settings = withAntarJemputDefaults(tenant.settings?.antarJemput);
      const baseline = toDraft(settings);
      setLoaded({ settings, baseline });
      setDraft(baseline);

      try {
        swalToast("Pengaturan antar-jemput tersimpan.");
      } catch {
        /* The page already shows what was saved. */
      }
    } catch (error) {
      setSaveError(
        `Pengaturan belum tersimpan. ${
          error instanceof ApiError ? error.fullMessage : "Coba lagi."
        }`,
      );
    } finally {
      setSaving(false);
    }
  }

  return {
    draft,
    settings: loaded?.settings ?? null,
    errors,
    dirty,
    saving,
    loading: loaded === null && loadError === null,
    loadError,
    saveError,
    update,
    save,
    discard: () => loaded && setDraft(loaded.baseline),
    retry: () => {
      setLoadError(null);
      setNonce((n) => n + 1);
    },
  };
}
