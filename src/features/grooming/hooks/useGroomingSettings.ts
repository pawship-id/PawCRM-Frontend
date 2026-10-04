"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePermissions } from "@/features/permissions";
import { usePetOptions } from "@/hooks/usePetOptions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { tenantService } from "@/services/tenant.service";
import { userService } from "@/services/user.service";
import type { GroomerCapacityDay, GroomingSettings } from "@/types/api";
import { isoDate } from "@/utils/date";

import {
  changedOverrides,
  commissionSizes,
  draftToSettings,
  isDraftDirty,
  settingsChanged,
  toDraft,
  validateDraft,
  withGroomingDefaults,
  type GroomingSettingsDraft,
} from "../settings";

interface Loaded {
  settings: GroomingSettings;
  capacity: GroomerCapacityDay | null;
  /** The capacity read failed; the tenant half still loaded. */
  capacityError: string | null;
  /** The draft as it was read — what "Batalkan perubahan" goes back to. */
  baseline: GroomingSettingsDraft;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.fullMessage : fallback;
}

/**
 * Reads both halves of the screen. The tenant is REQUIRED — there is nothing to
 * edit without it — and the day's capacity is not: a role without
 * `bookings:read` still sets the commission rule.
 */
async function read(mayReadBookings: boolean): Promise<Loaded> {
  const [tenant, day] = await Promise.all([
    tenantService.me(),
    mayReadBookings
      ? bookingService
          // TODAY IN THE BROWSER'S CALENDAR — see `isoDate`.
          .capacity(isoDate(new Date()))
          .then((capacity) => ({ capacity, error: null }))
          .catch((error: unknown) => ({
            capacity: null,
            error: messageOf(error, "Beban groomer hari ini tidak bisa dimuat."),
          }))
      : Promise.resolve({ capacity: null, error: null }),
  ]);

  const settings = withGroomingDefaults(tenant.settings?.grooming);

  return {
    settings,
    capacity: day.capacity,
    capacityError: day.error,
    baseline: toDraft(settings, day.capacity),
  };
}

/**
 * Layanan › Grooming › Pengaturan — one draft across both sub-tabs, saved in one
 * click.
 *
 * ─── ONE CLICK, SEVERAL REQUESTS ───────────────────────────────────────────
 *
 * The rule lives on the tenant and the overrides live on each user, so a save
 * is a `PATCH /tenants/me` and then one `PATCH /users/:id` per groomer whose
 * number changed. THE TENANT GOES FIRST AND ALONE: if it is refused, nothing
 * else is sent, because an override typed against a new default means
 * something different under the old one.
 *
 * A GROOMER WHOSE PATCH FAILED KEEPS WHAT WAS TYPED. The screen re-reads after
 * every save, and a re-read that silently put back the old number would make
 * the failure look like a success to anybody who missed the banner.
 *
 * ─── THE SIZE ROWS ARE WORKED OUT HERE, ONCE ───────────────────────────────
 *
 * From the tenant's size options (14 September 2026) and the nominals as
 * stored, and handed to the screen as `sizes` — so the rows it draws and the
 * rows `validateDraft` checks are one list, not two that could drift.
 *
 * THE SCREEN WAITS FOR THAT LIST (`loading`). Drawn before it arrives, "Nominal
 * per ukuran" is an empty grid with nothing to check, and a Simpan that goes
 * through as if the shop had no sizes. If the list FAILS, nothing is lost by
 * saving: the payload carries every stored nominal back whether or not it is on
 * screen (`draftToSettings`).
 */
export function useGroomingSettings() {
  const { can } = usePermissions();
  const mayReadBookings = can("bookings", "read");
  const petOptions = usePetOptions();
  const { ordered } = petOptions;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<GroomingSettingsDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  /** Overrides whose PATCH failed — laid back over the next read. */
  const carryOver = useRef<Record<string, string | null>>({});

  const apply = useCallback((next: Loaded) => {
    setLoaded(next);
    setLoadError(null);
    setDraft({
      ...next.baseline,
      overrides: { ...next.baseline.overrides, ...carryOver.current },
    });
    carryOver.current = {};
  }, []);

  useEffect(() => {
    let active = true;

    read(mayReadBookings)
      .then((next) => {
        if (active) apply(next);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            messageOf(error, "Pengaturan grooming tidak bisa dimuat. Coba lagi."),
          );
        }
      });

    return () => {
      active = false;
    };
  }, [mayReadBookings, nonce, apply]);

  const retry = useCallback(() => {
    setLoadError(null);
    setNonce((n) => n + 1);
  }, []);

  const storedSizes = loaded?.settings.commission.service.sizeNominal;
  const sizes = useMemo(
    () => commissionSizes(ordered("size"), storedSizes ?? {}),
    [ordered, storedSizes],
  );

  const errors = useMemo(
    () => (draft ? validateDraft(draft, sizes) : {}),
    [draft, sizes],
  );

  const dirty =
    loaded !== null &&
    draft !== null &&
    isDraftDirty(draft, loaded.baseline, loaded.capacity);

  const update = useCallback(
    (change: (current: GroomingSettingsDraft) => GroomingSettingsDraft) => {
      setDraft((current) => (current ? change(current) : current));
    },
    [],
  );

  function discard() {
    if (!loaded) return;
    setDraft(loaded.baseline);
    setSaveError(null);
  }

  async function save() {
    if (!loaded || !draft || saving) return;
    // The size rows are not known yet, so nothing has checked them.
    if (petOptions.loading) return;
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setSaveError(null);

    const settings = settingsChanged(draft, loaded.baseline)
      ? draftToSettings(draft, loaded.settings)
      : null;
    const changes = changedOverrides(draft, loaded.capacity);

    if (settings) {
      try {
        // THE WHOLE OBJECT — the server refuses a partial one.
        await tenantService.updateSettings({ grooming: settings });
      } catch (error) {
        setSaveError(
          `Pengaturan belum tersimpan. ${messageOf(error, "Coba lagi.")}`,
        );
        setSaving(false);
        return;
      }
    }

    const results = await Promise.allSettled(
      changes.map((change) =>
        userService.update(change.id, {
          dailyCapacityMin: change.dailyCapacityMin,
        }),
      ),
    );

    const failed = changes.filter((_, index) => results[index].status === "rejected");
    const firstFailure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    carryOver.current = Object.fromEntries(
      failed.map((change) => [change.id, draft.overrides[change.id] ?? null]),
    );

    if (failed.length > 0) {
      const names = failed.map((change) => change.name).join(", ");
      const somethingSaved = settings !== null || failed.length < changes.length;

      setSaveError(
        `Kapasitas ${names} belum tersimpan — ${messageOf(firstFailure?.reason, "koneksi terputus")}. ${
          somethingSaved ? "Yang lain sudah tersimpan. " : ""
        }Coba simpan lagi.`,
      );
    }

    try {
      apply(await read(mayReadBookings));
    } catch {
      setSaveError(
        (current) =>
          current ??
          "Tersimpan, tapi halaman ini belum bisa memuat ulang datanya. Muat ulang halaman.",
      );
    }

    setSaving(false);

    if (failed.length === 0) {
      /* Chrome must never be able to fail a save — see BookingForm. */
      try {
        swalToast("Tersimpan — berlaku untuk booking yang dibuat setelah ini");
      } catch {
        /* The screen already shows what was saved. */
      }
    }
  }

  return {
    loading: (loaded === null && loadError === null) || petOptions.loading,
    loadError,
    retry,
    /** The "Nominal per ukuran" rows, in the tenant's order. */
    sizes,
    /** The size list could not be read; `sizes` is then empty or stale. */
    sizesError: petOptions.error,
    retrySizes: petOptions.reload,
    settings: loaded?.settings ?? null,
    capacity: loaded?.capacity ?? null,
    capacityError: loaded?.capacityError ?? null,
    mayReadBookings,
    draft,
    update,
    errors,
    dirty,
    saving,
    saveError,
    save,
    discard,
  };
}
