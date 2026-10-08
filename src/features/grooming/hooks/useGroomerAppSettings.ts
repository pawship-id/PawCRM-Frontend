"use client";

import { useCallback, useEffect, useState } from "react";

import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { tenantService } from "@/services/tenant.service";
import type { GroomerAppSettings } from "@/types/api";

/** Absent until saved once, and both OFF — the narrowest app. */
export const GROOMER_APP_DEFAULTS: GroomerAppSettings = {
  showOwnCommission: false,
  allowOpenJobClaim: false,
};

/**
 * The groomer app's two switches, loaded and saved ON THEIR OWN.
 *
 * NOT folded into `useGroomingSettings`, and the reason is the server's: they are
 * `settings.groomerApp`, a sibling of `settings.grooming`, written whole by their
 * own `PATCH /tenants/me`. The grooming draft saves the commission rule, the
 * capacity and every groomer's own number in one click; tying two on/off
 * switches to that click would make "allow open jobs" wait on a commission box
 * being valid. Separate keys, separate saves.
 */
export function useGroomerAppSettings() {
  const [saved, setSaved] = useState<GroomerAppSettings | null>(null);
  const [draft, setDraft] = useState<GroomerAppSettings>(GROOMER_APP_DEFAULTS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;

    tenantService
      .me()
      .then((tenant) => {
        if (!active) return;
        const next = { ...GROOMER_APP_DEFAULTS, ...(tenant.settings?.groomerApp ?? {}) };
        setSaved(next);
        setDraft(next);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof ApiError ? error.fullMessage : "Pengaturan tidak bisa dimuat.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [nonce]);

  const retry = useCallback(() => {
    setLoadError(null);
    setNonce((n) => n + 1);
  }, []);

  const dirty =
    saved !== null &&
    (draft.showOwnCommission !== saved.showOwnCommission ||
      draft.allowOpenJobClaim !== saved.allowOpenJobClaim);

  async function save() {
    if (!dirty || saving) return;

    setSaving(true);
    setSaveError(null);

    try {
      // THE WHOLE OBJECT — the server refuses a partial one.
      const tenant = await tenantService.updateSettings({ groomerApp: draft });
      const next = { ...GROOMER_APP_DEFAULTS, ...(tenant.settings?.groomerApp ?? draft) };
      setSaved(next);
      setDraft(next);

      /* Chrome must never be able to fail a save — see BookingForm. */
      try {
        swalToast("Tersimpan — berlaku untuk groomer di semua cabang");
      } catch {
        /* The card already shows what was saved. */
      }
    } catch (error) {
      setSaveError(
        `Belum tersimpan. ${error instanceof ApiError ? error.fullMessage : "Coba lagi."}`,
      );
    } finally {
      setSaving(false);
    }
  }

  return {
    loading: saved === null && loadError === null,
    loadError,
    retry,
    draft,
    setDraft,
    dirty,
    saving,
    saveError,
    save,
    discard: () => saved && setDraft(saved),
  };
}
