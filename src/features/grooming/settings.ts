import { formatMoney } from "@/utils/decimal";
import type {
  GroomerCapacityDay,
  GroomingFlatCommissionRule,
  GroomingSettings,
  PetOption,
} from "@/types/api";

/**
 * Layanan › Grooming › Pengaturan, without React — the defaults, the draft the
 * screen edits, the example it draws, the capacity rows and the save plan.
 *
 * ─── THE DRAFT HOLDS STRINGS ───────────────────────────────────────────────
 *
 * A half-typed "1" on the way to "15" is a valid thing to have in a box and not
 * a valid rate, and coercing on every keystroke turns a cleared field into a
 * silent zero — a commission of nothing that nobody chose. Numbers are parsed
 * at the edges: when the example is drawn, when the payload is built.
 *
 * ─── THE SIZES ARE THE TENANT'S ────────────────────────────────────────────
 *
 * Until 14 September 2026 there were exactly three — Kecil, Sedang, Besar — and
 * this file held them in a constant. Sizes are tenant data now (`petoptions`):
 * a shop may add Ekstra besar, rename Sedang, or retire one. So nothing here
 * knows which sizes exist. Whatever lays something out per size TAKES THE LIST
 * as an argument (`commissionSizes`), which keeps it testable without React;
 * the screen builds that list from `usePetOptions()`.
 */

/** The server's caps (tenant.validation.js / user.validation.js). */
export const MAX_PERCENT = 100;
export const MAX_NOMINAL = 100_000_000;
export const MAX_MINUTES = 1440;

/** The yellow line on a groomer's bar — "nearly full", before "over". */
export const HIGH_LOAD_PERCENT = 85;

const DEFAULT_FLAT_RULE: GroomingFlatCommissionRule = {
  enabled: false,
  mode: "percentage",
  percent: 0,
  fixed: 0,
};

export const DEFAULT_GROOMING_SETTINGS: GroomingSettings = {
  commission: {
    service: {
      mode: "percentage",
      percent: 0,
      /*
        EMPTY, NOT A ZERO PER SIZE. There is no list of sizes to zero, and a
        size with no key is the server's own "earns nothing, and says so".
      */
      sizeNominal: {},
    },
    addon: DEFAULT_FLAT_RULE,
    travel: DEFAULT_FLAT_RULE,
  },
  capacity: { defaultMinutes: 420, overLimit: "warn" },
};

/* ─── sizes ────────────────────────────────────────────────────────────── */

/** One row of "Nominal per ukuran". */
export interface CommissionSize {
  /** The option's code — the key in `sizeNominal`. */
  code: string;
  /** The tenant's word for it, without " (nonaktif)". */
  label: string;
  /** Retired: on screen only because a nominal is already stored for it. */
  retired: boolean;
}

/**
 * `record[key]` only when the record itself holds it. "constructor" is a valid
 * size code, and a plain object answers it with a function.
 */
function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

/**
 * The size rows, from the tenant's live size options IN THEIR ORDER — pass
 * `usePetOptions().ordered("size")` — and the nominals as stored.
 *
 * A RETIRED SIZE IS A ROW ONLY WHEN A NOMINAL IS ALREADY STORED FOR IT. Pets
 * that hold it still earn by it, so a rate on it is live money and belongs on
 * screen. A retired size nobody priced has nothing to show, and an empty box
 * for it would hold up the save for a size no new animal can be given.
 *
 * A DELETED OR UNKNOWN SIZE IS NEVER A ROW, and its nominal is not dropped
 * either — see `draftToSettings`.
 *
 * KEYED BY THE OPTION'S `_id` since 25 September 2026, which is what
 * `sizeNominal` stores now. The field is still called `code` on
 * `CommissionSize` because that is what a row of this table is to its caller —
 * the value it saves under — and renaming it would touch every screen for no
 * behaviour.
 */
export function commissionSizes(
  options: Pick<PetOption, "_id" | "label" | "isActive">[],
  stored: Record<string, number>,
): CommissionSize[] {
  return options
    .filter((option) => option.isActive || own(stored, option._id) !== undefined)
    .map((option) => ({
      code: option._id,
      label: option.label,
      retired: !option.isActive,
    }));
}

/* ─── defaults ─────────────────────────────────────────────────────────── */

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function oneOf<T extends string>(value: unknown, options: T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

type Loose<T> = { [K in keyof T]?: T[K] extends object ? Loose<T[K]> : unknown };

/**
 * Every stored nominal that is a number, WHATEVER ITS KEY. Which sizes exist is
 * not this function's question: a key for a size since retired or deleted is
 * kept, so the next save does not quietly drop it.
 */
function storedNominals(stored: unknown): Record<string, number> {
  if (typeof stored !== "object" || stored === null) return {};

  return Object.fromEntries(
    Object.entries(stored).filter(
      ([, value]) => typeof value === "number" && Number.isFinite(value),
    ),
  );
}

function flatRule(
  stored: Loose<GroomingFlatCommissionRule> | undefined,
): GroomingFlatCommissionRule {
  return {
    enabled: stored?.enabled === true,
    mode: oneOf(stored?.mode, ["percentage", "fixed"], DEFAULT_FLAT_RULE.mode),
    percent: num(stored?.percent, 0),
    fixed: num(stored?.fixed, 0),
  };
}

/**
 * The tenant's stored grooming settings with every hole filled.
 *
 * KEY BY KEY, NOT `{ ...DEFAULTS, ...stored }`. A tenant saved before
 * `sizeNominal` existed would spread an object with no such key over the
 * default and blank it — and the PATCH refuses anything less than every key.
 */
export function withGroomingDefaults(
  stored: Loose<GroomingSettings> | null | undefined,
): GroomingSettings {
  const service = stored?.commission?.service;

  return {
    commission: {
      service: {
        mode: oneOf(service?.mode, ["percentage", "size_nominal"], "percentage"),
        percent: num(service?.percent, 0),
        sizeNominal: storedNominals(service?.sizeNominal),
      },
      addon: flatRule(stored?.commission?.addon),
      travel: flatRule(stored?.commission?.travel),
    },
    capacity: {
      defaultMinutes: num(
        stored?.capacity?.defaultMinutes,
        DEFAULT_GROOMING_SETTINGS.capacity.defaultMinutes,
      ),
      overLimit: oneOf(stored?.capacity?.overLimit, ["warn", "block"], "warn"),
    },
  };
}

/* ─── parsing ──────────────────────────────────────────────────────────── */

/**
 * "20", "12,5" or "12.5" → the number; anything else → null.
 *
 * A COMMA IS ACCEPTED HERE and refused in the rupiah boxes, and the difference
 * is the range. In Indonesian "12,5" is twelve and a half; a percentage stops
 * at 100 with two decimals, so neither separator can be mistaken for thousands.
 */
export function parsePercent(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(trimmed)) return null;

  const value = Number(trimmed.replace(",", "."));
  return value <= MAX_PERCENT ? value : null;
}

/**
 * DIGITS ONLY — see `WHOLE_RUPIAH` in the service form. "150.000" is a hundred
 * and fifty thousand to the person typing it and 150 to a parser.
 */
export function parseRupiah(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const value = Number(trimmed);
  return value <= MAX_NOMINAL ? value : null;
}

export function parseMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const value = Number(trimmed);
  return value >= 1 && value <= MAX_MINUTES ? value : null;
}

/* ─── the draft ────────────────────────────────────────────────────────── */

export interface FlatRuleDraft {
  enabled: boolean;
  mode: GroomingFlatCommissionRule["mode"];
  percent: string;
  fixed: string;
}

export interface GroomingSettingsDraft {
  service: {
    mode: GroomingSettings["commission"]["service"]["mode"];
    percent: string;
    /**
     * Size code → rupiah as typed. Seeded with EVERY STORED KEY, on screen or
     * not, so the payload can carry the hidden ones back. A size with nothing
     * stored has no key until somebody types — read it with `sizeNominalText`.
     */
    sizeNominal: Record<string, string>;
  };
  addon: FlatRuleDraft;
  travel: FlatRuleDraft;
  capacity: {
    defaultMinutes: string;
    overLimit: GroomingSettings["capacity"]["overLimit"];
  };
  /**
   * Groomer id → minutes as typed. `null` FOLLOWS THE DEFAULT, and is a
   * different thing from `""`, which is a box somebody has just emptied to type
   * a new number into.
   */
  overrides: Record<string, string | null>;
}

function flatRuleDraft(rule: GroomingFlatCommissionRule): FlatRuleDraft {
  return {
    enabled: rule.enabled,
    mode: rule.mode,
    percent: String(rule.percent),
    fixed: String(rule.fixed),
  };
}

export function toDraft(
  settings: GroomingSettings,
  capacity: GroomerCapacityDay | null,
): GroomingSettingsDraft {
  const { service, addon, travel } = settings.commission;

  return {
    service: {
      mode: service.mode,
      percent: String(service.percent),
      sizeNominal: Object.fromEntries(
        Object.entries(service.sizeNominal).map(([code, amount]) => [
          code,
          String(amount),
        ]),
      ),
    },
    addon: flatRuleDraft(addon),
    travel: flatRuleDraft(travel),
    capacity: {
      defaultMinutes: String(settings.capacity.defaultMinutes),
      overLimit: settings.capacity.overLimit,
    },
    overrides: Object.fromEntries(
      (capacity?.groomers ?? []).map((groomer) => [
        groomer._id,
        groomer.dailyCapacityMin === null ? null : String(groomer.dailyCapacityMin),
      ]),
    ),
  };
}

/** What a size's box shows — `""` for a size nothing has been typed or stored for. */
export function sizeNominalText(draft: GroomingSettingsDraft, code: string): string {
  return own(draft.service.sizeNominal, code) ?? "";
}

/**
 * What a groomer's box holds after somebody types `typed` into it.
 *
 * TYPING THE DEFAULT CLEARS THE OVERRIDE. A groomer whose own number equals the
 * shop's is following the shop — and storing it as an override would quietly
 * stop them following it the day the default changes.
 */
export function nextOverride(typed: string, defaultMinutes: string): string | null {
  const value = parseMinutes(typed);
  return value !== null && value === parseMinutes(defaultMinutes) ? null : typed;
}

/* ─── validation ───────────────────────────────────────────────────────── */

export const PERCENT_ERROR = "Isi 0–100, paling banyak dua angka di belakang koma.";
export const RUPIAH_ERROR = "Isi angka saja tanpa titik, paling besar 100.000.000.";
export const MINUTES_ERROR = `Isi menit antara 1 dan ${MAX_MINUTES}.`;

/**
 * Field key → message. Keys: `service.percent`, `service.size.<code>`,
 * `addon.percent|fixed`, `travel.percent|fixed`, `capacity.defaultMinutes`,
 * `override.<groomerId>`.
 */
export type DraftErrors = Record<string, string>;

export function sizeErrorKey(code: string): string {
  return `service.size.${code}`;
}

function overrideErrors(draft: GroomingSettingsDraft, errors: DraftErrors) {
  for (const [id, raw] of Object.entries(draft.overrides)) {
    if (raw !== null && parseMinutes(raw) === null) {
      errors[`override.${id}`] = MINUTES_ERROR;
    }
  }
}

function flatRuleErrors(
  key: "addon" | "travel",
  rule: FlatRuleDraft,
  errors: DraftErrors,
) {
  if (!rule.enabled) return;
  if (rule.mode === "percentage" && parsePercent(rule.percent) === null) {
    errors[`${key}.percent`] = PERCENT_ERROR;
  }
  if (rule.mode === "fixed" && parseRupiah(rule.fixed) === null) {
    errors[`${key}.fixed`] = RUPIAH_ERROR;
  }
}

/**
 * ONLY THE BOXES ON SCREEN ARE CHECKED. A percentage left behind after
 * switching to nominal-per-size is not something anybody can see to fix; the
 * payload keeps the stored value for it instead (see `draftToSettings`).
 *
 * `sizes` is what the screen draws (`commissionSizes`) — pass the same list, or
 * a row on screen and a row checked become two different things.
 */
export function validateDraft(
  draft: GroomingSettingsDraft,
  sizes: CommissionSize[],
): DraftErrors {
  const errors: DraftErrors = {};

  if (draft.service.mode === "percentage") {
    if (parsePercent(draft.service.percent) === null) {
      errors["service.percent"] = PERCENT_ERROR;
    }
  } else {
    /*
      EVERY SIZE ROW, ACTIVE OR RETIRED. A size the shop added yesterday starts
      EMPTY, not at 0, and holds up the save until somebody prices it: the
      server pays a size with no key nothing, and a zero filled in on the
      shop's behalf would be that same payslip with nobody having chosen it. A
      retired row always arrives with a stored number, so it only ever blocks
      after somebody breaks its box.
    */
    for (const size of sizes) {
      if (parseRupiah(sizeNominalText(draft, size.code)) === null) {
        errors[sizeErrorKey(size.code)] = RUPIAH_ERROR;
      }
    }
  }

  flatRuleErrors("addon", draft.addon, errors);
  flatRuleErrors("travel", draft.travel, errors);

  if (parseMinutes(draft.capacity.defaultMinutes) === null) {
    errors["capacity.defaultMinutes"] = MINUTES_ERROR;
  }

  overrideErrors(draft, errors);

  return errors;
}

/* ─── building the payload ─────────────────────────────────────────────── */

function flatRuleFrom(
  draft: FlatRuleDraft,
  fallback: GroomingFlatCommissionRule,
): GroomingFlatCommissionRule {
  return {
    enabled: draft.enabled,
    mode: draft.mode,
    percent: parsePercent(draft.percent) ?? fallback.percent,
    fixed: parseRupiah(draft.fixed) ?? fallback.fixed,
  };
}

/**
 * `sizeNominal` for the payload: every stored key, with what was typed laid
 * over it.
 *
 * STORED KEYS FOR SIZES NOT ON SCREEN GO BACK UNCHANGED. The PATCH replaces the
 * object whole, so a key left out is a key deleted — and such a nominal is not
 * dead. A deleted size can be restored and should come back priced; the server
 * already treats a key for a size that no longer exists as inert, so carrying
 * it costs nothing, and dropping it would be a payslip change nobody made.
 *
 * A SIZE NOBODY HAS PRICED GOES OUT WITH NO KEY, not as 0. That only happens
 * under the percentage rule — the size rows are checked under the other — and
 * "no key" is the server's own "earns nothing, and says so". A 0 would pass for
 * a decision, and be read back into the box next time as one.
 */
function sizeNominalFrom(
  typed: Record<string, string>,
  stored: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = { ...stored };

  for (const [code, raw] of Object.entries(typed)) {
    const value = parseRupiah(raw);
    if (value !== null) result[code] = value;
  }

  return result;
}

/**
 * The draft as the WHOLE object the PATCH demands. A box that does not parse
 * keeps `fallback`'s value — that only happens to a box that is off screen,
 * since `validateDraft` blocks the save for the ones that are on it.
 */
export function draftToSettings(
  draft: GroomingSettingsDraft,
  fallback: GroomingSettings,
): GroomingSettings {
  const service = fallback.commission.service;

  return {
    commission: {
      service: {
        mode: draft.service.mode,
        percent: parsePercent(draft.service.percent) ?? service.percent,
        sizeNominal: sizeNominalFrom(draft.service.sizeNominal, service.sizeNominal),
      },
      addon: flatRuleFrom(draft.addon, fallback.commission.addon),
      travel: flatRuleFrom(draft.travel, fallback.commission.travel),
    },
    capacity: {
      defaultMinutes:
        parseMinutes(draft.capacity.defaultMinutes) ?? fallback.capacity.defaultMinutes,
      overLimit: draft.capacity.overLimit,
    },
  };
}

/** A groomer whose stored number differs from the box — one PATCH each. */
export interface OverrideChange {
  id: string;
  name: string;
  dailyCapacityMin: number | null;
}

export function changedOverrides(
  draft: GroomingSettingsDraft,
  capacity: GroomerCapacityDay | null,
): OverrideChange[] {
  return (capacity?.groomers ?? []).flatMap((groomer) => {
    const raw = draft.overrides[groomer._id] ?? null;
    const value = raw === null ? null : parseMinutes(raw);

    // An unparseable box is a validation error, not a change to send.
    if (raw !== null && value === null) return [];
    if (value === groomer.dailyCapacityMin) return [];

    return [{ id: groomer._id, name: groomer.fullName, dailyCapacityMin: value }];
  });
}

/**
 * Has anything changed since the last read?
 *
 * COMPARED AS PARSED VALUES where they parse, so "20" retyped as "20,0" is not
 * an unsaved change — and as the raw text where they do not, so a box somebody
 * has just emptied is.
 */
export function isDraftDirty(
  draft: GroomingSettingsDraft,
  baseline: GroomingSettingsDraft,
  capacity: GroomerCapacityDay | null,
): boolean {
  return (
    settingsKey(draft) !== settingsKey(baseline) ||
    changedOverrides(draft, capacity).length > 0 ||
    hasOverrideErrors(draft)
  );
}

function hasOverrideErrors(draft: GroomingSettingsDraft): boolean {
  const errors: DraftErrors = {};
  overrideErrors(draft, errors);
  return Object.keys(errors).length > 0;
}

function settingsKey(draft: GroomingSettingsDraft): string {
  const canon = (raw: string, parse: (value: string) => number | null) =>
    parse(raw) ?? `raw:${raw.trim()}`;
  const rule = (value: FlatRuleDraft) => [
    value.enabled,
    value.mode,
    canon(value.percent, parsePercent),
    canon(value.fixed, parseRupiah),
  ];

  return JSON.stringify([
    draft.service.mode,
    canon(draft.service.percent, parsePercent),
    /*
      A BOX TYPED INTO AND CLEARED AGAIN IS NOT A CHANGE: a key holding "" and
      no key are the same empty box. Sorted, because key order says nothing.
    */
    Object.entries(draft.service.sizeNominal)
      .filter(([, raw]) => raw.trim() !== "")
      .map(([code, raw]) => [code, canon(raw, parseRupiah)] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
    rule(draft.addon),
    rule(draft.travel),
    canon(draft.capacity.defaultMinutes, parseMinutes),
    draft.capacity.overLimit,
  ]);
}

/** True when the tenant half of the draft differs from the last read. */
export function settingsChanged(
  draft: GroomingSettingsDraft,
  baseline: GroomingSettingsDraft,
): boolean {
  return settingsKey(draft) !== settingsKey(baseline);
}

/* ─── the example ──────────────────────────────────────────────────────── */

/**
 * The one visit the right-hand panel works through. FIXED, not chosen: it is
 * there to make a rule legible, and a picker would make it a calculator.
 */
export const COMMISSION_EXAMPLE = {
  serviceName: "Basic + Styling",
  servicePrice: 249_000,
  addonName: "Spa Aromaterapi",
  addonPrice: 70_000,
  zoneName: "Zona B",
  zoneFee: 70_000,
};

/**
 * The example animal's size: THE MIDDLE ACTIVE SIZE, the lower of the two
 * middles on an even count. It was hardcoded Medium; this is Sedang on the
 * seeded three and stays Sedang when a shop adds Ekstra besar at the end —
 * the example should not change size because a size was added. Null when the
 * tenant has no active size at all.
 */
export function exampleSize(sizes: CommissionSize[]): CommissionSize | null {
  const active = sizes.filter((size) => !size.retired);
  return active[Math.floor((active.length - 1) / 2)] ?? null;
}

export interface ExampleLine {
  /** Null when the rule is off, or when nothing is priced to compute from. */
  amount: number | null;
  /** "20% × Rp 249.000" — how the amount was reached. */
  basis: string | null;
}

export interface ExampleCommission {
  /** The size the example animal is — `exampleSize`. */
  size: CommissionSize | null;
  service: ExampleLine;
  addon: ExampleLine;
  /** Worked out, and NOT in `total` — nothing earns it until trips exist. */
  travel: ExampleLine;
  total: number;
}

const PERCENT_FORMAT = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export function formatPercent(percent: number): string {
  return `${PERCENT_FORMAT.format(percent)}%`;
}

export function formatRupiah(amount: number): string {
  return formatMoney(String(amount));
}

/**
 * `percent` of `amount`, ROUNDED DOWN TO THE RUPIAH like the server.
 *
 * INTEGER ARITHMETIC: the percent is taken in hundredths first, so 12,5% of
 * 249.000 is 249000 × 1250 / 10000 and never touches a float that could land a
 * rupiah either side of the server's answer.
 */
export function percentOf(amount: number, percent: number): number {
  return Math.floor((amount * Math.round(percent * 100)) / 10_000);
}

function flatExample(
  rule: GroomingFlatCommissionRule,
  base: number,
  percentBasis: string,
  fixedBasis: string,
): ExampleLine {
  if (!rule.enabled) return { amount: null, basis: null };

  return rule.mode === "percentage"
    ? {
        amount: percentOf(base, rule.percent),
        basis: `${formatPercent(rule.percent)} × ${percentBasis}`,
      }
    : { amount: rule.fixed, basis: fixedBasis };
}

/**
 * A size with no nominal says so rather than showing Rp 0 — the server pays it
 * nothing and reports the size as missing, and the example should read the
 * same way.
 */
function sizeExample(
  sizeNominal: Record<string, number>,
  size: CommissionSize | null,
): ExampleLine {
  if (size === null) return { amount: null, basis: "belum ada ukuran hewan aktif" };

  const amount = own(sizeNominal, size.code);
  return amount === undefined
    ? { amount: null, basis: `nominal ${size.label} belum diisi` }
    : { amount, basis: `nominal ${size.label}` };
}

export function exampleCommission(
  settings: GroomingSettings,
  sizes: CommissionSize[],
): ExampleCommission {
  const { service, addon, travel } = settings.commission;
  const example = COMMISSION_EXAMPLE;
  const size = exampleSize(sizes);

  const serviceLine: ExampleLine =
    service.mode === "percentage"
      ? {
          amount: percentOf(example.servicePrice, service.percent),
          basis: `${formatPercent(service.percent)} × ${formatRupiah(example.servicePrice)}`,
        }
      : sizeExample(service.sizeNominal, size);

  const addonLine = flatExample(
    addon,
    example.addonPrice,
    formatRupiah(example.addonPrice),
    "nominal tetap per add-on",
  );
  const travelLine = flatExample(
    travel,
    example.zoneFee,
    `tarif ${example.zoneName}`,
    "nominal tetap per trip",
  );

  return {
    size,
    service: serviceLine,
    addon: addonLine,
    travel: travelLine,
    total: (serviceLine.amount ?? 0) + (addonLine.amount ?? 0),
  };
}

/* ─── capacity ─────────────────────────────────────────────────────────── */

export type LoadTone = "normal" | "high" | "over";

export interface CapacityRow {
  id: string;
  name: string;
  offReason: string | null;
  /** The box holds a number of its own rather than following the default. */
  overridden: boolean;
  /** What applies with the DRAFT's numbers — the table previews the edit. */
  capacity: number;
  used: number;
  percent: number;
  /** Minutes past capacity; 0 when within it. */
  overBy: number;
  tone: LoadTone;
}

export function loadTone(used: number, capacity: number): LoadTone {
  if (used > capacity) return "over";
  return capacity > 0 && (used * 100) / capacity >= HIGH_LOAD_PERCENT
    ? "high"
    : "normal";
}

export function capacityRows(
  day: GroomerCapacityDay,
  draft: GroomingSettingsDraft,
): CapacityRow[] {
  const draftDefault = parseMinutes(draft.capacity.defaultMinutes);

  return day.groomers.map((groomer) => {
    const raw = draft.overrides[groomer._id] ?? null;
    const own = raw === null ? null : parseMinutes(raw);

    /*
      WHILE A BOX IS HALF TYPED, the row keeps the server's figure rather than
      jumping to a bar drawn against "4" on the way to "480".
    */
    const capacity =
      raw === null
        ? (draftDefault ?? groomer.capacityMin)
        : (own ?? groomer.capacityMin);
    const used = groomer.usedMin;

    return {
      id: groomer._id,
      name: groomer.fullName,
      offReason: groomer.offReason,
      overridden: raw !== null,
      capacity,
      used,
      percent: capacity > 0 ? Math.round((used * 100) / capacity) : 0,
      overBy: Math.max(0, used - capacity),
      tone: loadTone(used, capacity),
    };
  });
}

export interface TeamLoad {
  used: number;
  capacity: number;
  /** Null when nobody is in — a percentage of nothing is not a number. */
  percent: number | null;
  tone: LoadTone;
}

/**
 * The whole team's day.
 *
 * SOMEBODY ON LEAVE BRINGS NO MINUTES. Their capacity is a number on their
 * record, not time the shop has today — counting it would show a team half
 * idle while the people who are in run over. Anything still booked on them
 * does count as used: it is work somebody has to do.
 */
export function teamLoad(rows: CapacityRow[]): TeamLoad {
  const used = rows.reduce((sum, row) => sum + row.used, 0);
  const capacity = rows
    .filter((row) => row.offReason === null)
    .reduce((sum, row) => sum + row.capacity, 0);

  return {
    used,
    capacity,
    percent: capacity > 0 ? Math.round((used * 100) / capacity) : null,
    tone: capacity > 0 ? loadTone(used, capacity) : used > 0 ? "over" : "normal",
  };
}
