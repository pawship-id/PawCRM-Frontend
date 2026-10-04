import type {
  AntarJemputCommissionRule,
  AntarJemputSettings,
} from "@/types/api";

/**
 * Layanan › Antar-Jemput › Pengaturan's draft — PURE, so it is tested without a
 * DOM (`src/tests/antarJemputSettings.test.ts`).
 *
 * The boxes hold what was TYPED (strings); a save turns them back into the
 * numbers `PATCH /tenants/me` takes, whole — the server refuses half of it.
 */

/** Mirrors MAX_COMMISSION_NOMINAL in groomingSettings.schema.js. */
export const MAX_NOMINAL = 100_000_000;

export interface RuleDraft {
  mode: AntarJemputCommissionRule["mode"];
  percent: string;
  fixed: string;
}

export interface AntarJemputSettingsDraft {
  service: RuleDraft;
  addon: RuleDraft;
}

export type SettingsErrors = Partial<
  Record<"service.percent" | "service.fixed" | "addon.percent" | "addon.fixed", string>
>;

const blankRule = (): AntarJemputCommissionRule => ({ mode: "percentage", percent: 0, fixed: 0 });

/** A tenant that never saved one reads as no commission at all — the server's own default. */
export function withAntarJemputDefaults(
  stored: AntarJemputSettings | undefined,
): AntarJemputSettings {
  return {
    commission: {
      service: { ...blankRule(), ...(stored?.commission?.service ?? {}) },
      addon: { ...blankRule(), ...(stored?.commission?.addon ?? {}) },
    },
  };
}

const ruleDraft = (rule: AntarJemputCommissionRule): RuleDraft => ({
  mode: rule.mode,
  percent: String(rule.percent),
  fixed: String(rule.fixed),
});

export function toDraft(settings: AntarJemputSettings): AntarJemputSettingsDraft {
  return {
    service: ruleDraft(settings.commission.service),
    addon: ruleDraft(settings.commission.addon),
  };
}

/** "10,5" and "10.5" are the same percent; "" is none. */
function number(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return 0;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** "10.000" is ten thousand rupiah — the Indonesian grouping, never a decimal. */
function rupiah(text: string): number | null {
  const digits = text.replace(/\./g, "").trim();
  if (digits === "") return 0;
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

/**
 * ONLY THE BOX IN USE IS CHECKED. A rule on Persentase keeps its old nominal
 * and sends it back unchanged; refusing to save over a box nobody can see would
 * be a dead end.
 */
export function validateDraft(draft: AntarJemputSettingsDraft): SettingsErrors {
  const errors: SettingsErrors = {};

  for (const key of ["service", "addon"] as const) {
    const rule = draft[key];

    if (rule.mode === "percentage") {
      const value = number(rule.percent);
      if (value === null || value < 0 || value > 100) {
        errors[`${key}.percent`] = "Isi angka 0–100.";
      } else if (Math.round(value * 100) !== value * 100) {
        errors[`${key}.percent`] = "Paling banyak dua angka di belakang koma.";
      }
    } else {
      const value = rupiah(rule.fixed);
      if (value === null || value < 0) {
        errors[`${key}.fixed`] = "Isi rupiah tanpa koma.";
      } else if (value > MAX_NOMINAL) {
        errors[`${key}.fixed`] = "Nominalnya terlalu besar.";
      }
    }
  }

  return errors;
}

function ruleFrom(draft: RuleDraft, fallback: AntarJemputCommissionRule): AntarJemputCommissionRule {
  return {
    mode: draft.mode,
    percent: number(draft.percent) ?? fallback.percent,
    fixed: rupiah(draft.fixed) ?? fallback.fixed,
  };
}

/** The draft as `PATCH /tenants/me` takes it — whole. */
export function draftToSettings(
  draft: AntarJemputSettingsDraft,
  fallback: AntarJemputSettings,
): AntarJemputSettings {
  return {
    commission: {
      service: ruleFrom(draft.service, fallback.commission.service),
      addon: ruleFrom(draft.addon, fallback.commission.addon),
    },
  };
}

/** What one rule pays on a price, in whole rupiah — the example card's arithmetic. */
export function commissionOn(rule: AntarJemputCommissionRule, price: number): number {
  return rule.mode === "fixed" ? rule.fixed : Math.floor((price * rule.percent) / 100);
}

export function isDirty(draft: AntarJemputSettingsDraft, baseline: AntarJemputSettingsDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(baseline);
}
