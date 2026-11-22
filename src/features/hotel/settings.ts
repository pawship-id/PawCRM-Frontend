import {
  seedSteps,
  sessionTimesPayload,
  stepsProblem,
  type StepsDraft,
} from "@/features/grooming/serviceStepsDraft";
import { sessionWeightsPayload } from "@/features/services";
import type { HotelSettings } from "@/types/api";

/**
 * Layanan › Hotel › Pengaturan's draft (21 November 2026) — PURE, tested
 * without a DOM (`src/tests/hotelSettings.test.ts`). The boxes hold what was
 * TYPED; a save turns them into the numbers `PATCH /tenants/me` takes, whole.
 */

/** Mirrors MAX_COMMISSION_NOMINAL in groomingSettings.schema.js. */
export const MAX_NOMINAL = 100_000_000;

export type ServiceMode = HotelSettings["commission"]["service"]["mode"];
export type AddonMode = HotelSettings["commission"]["addon"]["mode"];
export type SplitMode = HotelSettings["commission"]["split"];

export interface HotelSettingsDraft {
  serviceMode: ServiceMode;
  percent: string;
  fixed: string;
  /** Size option `_id` → rupiah as typed. */
  sizeNominal: Record<string, string>;
  split: SplitMode;
  addonMode: AddonMode;
  addonPercent: string;
  addonFixed: string;
  /** Kegiatan harian — the default tahapan of a new hotel service. */
  steps: StepsDraft;
}

export type HotelSettingsErrors = Partial<Record<string, string>>;

/** A tenant that never saved one reads as no commission — the server's own default. */
export function withHotelDefaults(
  stored: Partial<HotelSettings> | undefined,
): HotelSettings {
  const service = stored?.commission?.service;
  const addon = stored?.commission?.addon;
  return {
    commission: {
      service: {
        mode: service?.mode ?? "none",
        percent: service?.percent ?? 0,
        fixed: service?.fixed ?? 0,
        sizeNominal: { ...(service?.sizeNominal ?? {}) },
      },
      split: stored?.commission?.split === "by_step" ? "by_step" : "night_pic",
      addon: {
        mode: addon?.mode ?? "none",
        percent: addon?.percent ?? 0,
        fixed: addon?.fixed ?? 0,
      },
    },
    defaultSteps: defaultStepsOf(stored?.defaultSteps),
  };
}

/** The three arrays lined up — weights or times that do not match the names are dropped. */
function defaultStepsOf(
  stored: Partial<HotelSettings["defaultSteps"]> | undefined,
): HotelSettings["defaultSteps"] {
  const sessions = [...(stored?.sessions ?? [])];
  const weights = [...(stored?.sessionWeights ?? [])];
  const times = [...(stored?.sessionTimes ?? [])].map((time) => time || null);
  return {
    sessions,
    sessionWeights: weights.length === sessions.length ? weights : [],
    sessionTimes: times.length === sessions.length ? times : [],
  };
}

export function toDraft(settings: HotelSettings): HotelSettingsDraft {
  const { service, split, addon } = settings.commission;
  return {
    serviceMode: service.mode,
    percent: String(service.percent),
    fixed: String(service.fixed),
    sizeNominal: Object.fromEntries(
      Object.entries(service.sizeNominal).map(([id, value]) => [
        id,
        String(value),
      ]),
    ),
    split,
    addonMode: addon.mode,
    addonPercent: String(addon.percent),
    addonFixed: String(addon.fixed),
    steps: seedSteps(settings.defaultSteps),
  };
}

/** "10,5" and "10.5" are the same percent; "" is none. */
function percentOf(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return 0;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** "10.000" is ten thousand rupiah — the Indonesian grouping, never a decimal. */
function rupiahOf(text: string): number | null {
  const digits = text.replace(/\./g, "").trim();
  if (digits === "") return 0;
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

function percentProblem(text: string): string | null {
  const value = percentOf(text);
  if (value === null || value < 0 || value > 100) return "Isi angka 0–100.";
  if (Math.round(value * 100) !== value * 100)
    return "Paling banyak dua angka di belakang koma.";
  return null;
}

function rupiahProblem(text: string): string | null {
  const value = rupiahOf(text);
  if (value === null || value < 0) return "Isi rupiah tanpa koma.";
  if (value > MAX_NOMINAL) return "Nominalnya terlalu besar.";
  return null;
}

/** Only the boxes in use are checked — a hidden box keeps its old value. */
export function validateDraft(
  draft: HotelSettingsDraft,
  sizeIds: string[],
): HotelSettingsErrors {
  const errors: HotelSettingsErrors = {};
  const set = (key: string, problem: string | null) => {
    if (problem) errors[key] = problem;
  };

  if (draft.serviceMode === "percentage")
    set("percent", percentProblem(draft.percent));
  if (draft.serviceMode === "fixed") set("fixed", rupiahProblem(draft.fixed));
  if (draft.serviceMode === "size_nominal") {
    sizeIds.forEach((id) =>
      set(`size.${id}`, rupiahProblem(draft.sizeNominal[id] ?? "")),
    );
  }
  if (draft.addonMode === "percentage")
    set("addonPercent", percentProblem(draft.addonPercent));
  if (draft.addonMode === "fixed")
    set("addonFixed", rupiahProblem(draft.addonFixed));
  set("steps", stepsProblem(draft.steps));

  return errors;
}

/** The draft as `PATCH /tenants/me` takes it — whole. Every stored size nominal goes back. */
export function draftToSettings(
  draft: HotelSettingsDraft,
  fallback: HotelSettings,
): HotelSettings {
  const before = fallback.commission;
  const sizeNominal: Record<string, number> = { ...before.service.sizeNominal };
  Object.entries(draft.sizeNominal).forEach(([id, text]) => {
    const value = rupiahOf(text);
    if (value !== null) sizeNominal[id] = value;
  });

  return {
    commission: {
      service: {
        mode: draft.serviceMode,
        percent: percentOf(draft.percent) ?? before.service.percent,
        fixed: rupiahOf(draft.fixed) ?? before.service.fixed,
        sizeNominal,
      },
      split: draft.split,
      addon: {
        mode: draft.addonMode,
        percent: percentOf(draft.addonPercent) ?? before.addon.percent,
        fixed: rupiahOf(draft.addonFixed) ?? before.addon.fixed,
      },
    },
    defaultSteps: {
      sessions: draft.steps.sessions,
      sessionWeights: sessionWeightsPayload(
        draft.steps.sessions,
        draft.steps.weights,
      ),
      sessionTimes: sessionTimesPayload(draft.steps),
    },
  };
}

/** What one night earns at a price, for an animal of a size — the example card. */
export function nightCommission(
  service: HotelSettings["commission"]["service"],
  price: number,
  sizeId: string | null,
): number {
  if (service.mode === "fixed") return service.fixed;
  if (service.mode === "percentage")
    return Math.floor((price * service.percent) / 100);
  if (service.mode === "size_nominal")
    return sizeId ? (service.sizeNominal[sizeId] ?? 0) : 0;
  return 0;
}

export function addonCommission(
  addon: HotelSettings["commission"]["addon"],
  price: number,
): number {
  if (addon.mode === "fixed") return addon.fixed;
  if (addon.mode === "percentage")
    return Math.floor((price * addon.percent) / 100);
  return 0;
}

export function isDirty(
  draft: HotelSettingsDraft,
  baseline: HotelSettingsDraft,
): boolean {
  return JSON.stringify(draft) !== JSON.stringify(baseline);
}
