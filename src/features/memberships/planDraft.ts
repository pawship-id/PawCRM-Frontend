import type { Service } from "@/types/api";
import type {
  AttachTo,
  BenefitInput,
  BenefitOption,
  BenefitOptionInput,
  BenefitQuota,
  BenefitScope,
  CreateMembershipPlanInput,
  Eligibility,
  MembershipBenefit,
  MembershipPlan,
  OptionKind,
  OptionPriceMode,
  PlanPriceMode,
  VariantPrice,
  VisitFee,
} from "@/types/membership";
import { toMinor } from "@/utils/decimal";

import type { QuotaChoice } from "./labels";
import { matchVariantPrice, servicePriceFor } from "./variantKey";

/**
 * THE PLAN FORM'S STATE, and the two pure mappings either side of it:
 *
 *   MembershipPlan (API)  ──planToDraft──▶  PlanDraft (what the inputs hold)
 *   PlanDraft             ──draftToPayload──▶  CreateMembershipPlanInput
 *
 * Kept out of the components so the rules can be tested without a DOM — above
 * all the QUOTA MAPPING (contract §2.2): the builder offers one count and four
 * choices, the API stores `{ total, perPeriod, period }`.
 *
 *   "N× per minggu"           ⇄ { perPeriod: N, period: "week",  total: null }
 *   "N× per bulan"            ⇄ { perPeriod: N, period: "month", total: null }
 *   "N× selama masa berlaku"  ⇄ { total: N }
 *   "Tidak terbatas"          ⇄ all null
 *
 * Exactly one shape per benefit (BO "Skema & aturan"): the server refuses a
 * period quota with a `total` beside it. A legacy plan that set both reads as
 * its period choice, and saving it drops the old lifetime cap.
 *
 * INPUTS HOLD STRINGS. A number field that is half-typed is not a number, and
 * money is a decimal string end to end (never parseFloat'd for storage).
 */

/* ────────────────────────────────────────────────────────── draft shapes */

export interface VariantPriceDraft {
  variantKey: string;
  /** As typed — "150.000" is fine, `normalizeMoney` cleans it on the way out. */
  price: string;
}

export interface OptionDraft {
  /** A client-only React key. */
  key: string;
  /** Echoed back to keep the option (and the redemptions pointing at it). */
  id?: string;
  kind: OptionKind;
  scope: BenefitScope;
  /** Percent for `discount_percent`, rupiah for amount / special price (same). */
  value: string;
  priceMode: OptionPriceMode;
  variantPrices: VariantPriceDraft[];
  visitFee: VisitFee;
}

export type BenefitType = "allowance" | "perk";

export interface BenefitDraft {
  key: string;
  id?: string;
  label: string;
  /** "Fasilitas" (perk) is a benefit with no price, no quota and no options. */
  type: BenefitType;
  quotaChoice: QuotaChoice;
  quotaCount: string;
  options: OptionDraft[];
}

export interface PlanDraft {
  code: string;
  name: string;
  description: string;
  durationMonths: string;
  isActive: boolean;
  priceMode: PlanPriceMode;
  price: string;
  variantPrices: VariantPriceDraft[];
  attachTo: AttachTo;
  petSpecies: string[];
  eligibility: Eligibility;
  branchIds: string[];
  renewalOfferDays: string;
  publicVisible: boolean;
  publicFeatured: boolean;
  publicOrder: string;
  publicBadge: string;
  benefits: BenefitDraft[];
}

/* ────────────────────────────────────────────────────────── small helpers */

let seq = 0;
/** A React key for a row that has no id yet. */
export const draftKey = (prefix = "row") => `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`;

/**
 * "Rp 150.000" / "150.000" / "150000,50" → "150000" / "150000.50".
 *
 * INDONESIAN FIGURES: a dot groups thousands, a comma marks decimals. Anything
 * that is not a digit or that comma is noise from the keyboard.
 */
export function normalizeMoney(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  const text = String(input).trim();
  if (text === "") return "";
  /*
    A value the API sent back ("150000.0000", always four places) is already
    canonical. Anything else with a dot is somebody typing "150.000".
  */
  if (/^\d+\.\d{4}$/.test(text)) return trimZeros(text);
  const cleaned = text.replace(/[^\d,]/g, "").replace(",", ".");
  return trimZeros(cleaned);
}

function trimZeros(value: string): string {
  if (!value.includes(".")) return value.replace(/^0+(?=\d)/, "");
  const [whole, fraction] = value.split(".");
  const kept = fraction.replace(/0+$/, "");
  const head = whole.replace(/^0+(?=\d)/, "") || "0";
  return kept ? `${head}.${kept}` : head;
}

/** A positive integer from a text input, or null. */
function positiveInt(value: string): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export const emptyScope = (target: BenefitScope["target"] = "service"): BenefitScope => ({
  target,
  serviceIds: [],
  productIds: [],
  categoryIds: [],
  serviceKinds: [],
});

/* ────────────────────────────────────────────────────────── quota mapping */

/**
 * API quota → the builder's choice + count. A legacy quota carrying both a
 * period quota and a `total` maps to the period choice.
 */
export function quotaToChoice(quota: Partial<BenefitQuota> | null | undefined): {
  choice: QuotaChoice;
  count: string;
} {
  const perPeriod = quota?.perPeriod ?? null;
  const period = quota?.period ?? null;
  const total = quota?.total ?? null;

  if (perPeriod && period) return { choice: period, count: String(perPeriod) };
  if (total) return { choice: "term", count: String(total) };
  return { choice: "unlimited", count: "" };
}

/**
 * The builder's choice + count → API quota.
 *
 * A COUNT LEFT EMPTY ON A LIMITED CHOICE IS SENT AS 1, never as "unlimited":
 * the select says "× per bulan", and quietly widening that to no limit at all
 * would sell something the owner did not choose. (The form also blocks saving
 * on it; this is the floor under that.)
 */
export function choiceToQuota(choice: QuotaChoice, count: string): BenefitQuota {
  const n = positiveInt(count) ?? 1;

  if (choice === "week" || choice === "month") {
    return { perPeriod: n, period: choice, total: null };
  }
  if (choice === "term") return { total: n, perPeriod: null, period: null };
  return { total: null, perPeriod: null, period: null };
}

/* ────────────────────────────────────────────────────────── API → draft */

function optionToDraft(option: BenefitOption): OptionDraft {
  return {
    key: draftKey("opt"),
    id: option.id,
    kind: option.kind,
    scope: { ...emptyScope(option.scope?.target), ...option.scope },
    value:
      option.value === null || option.value === undefined
        ? ""
        : typeof option.value === "number"
          ? String(option.value)
          : normalizeMoney(option.value),
    priceMode: option.priceMode ?? "same",
    variantPrices: (option.variantPrices ?? []).map((row) => ({
      variantKey: row.variantKey,
      price: normalizeMoney(row.price),
    })),
    visitFee: option.visitFee ?? "zone",
  };
}

export function benefitToDraft(benefit: MembershipBenefit): BenefitDraft {
  const quota = quotaToChoice(benefit.quota);
  const perk = benefit.kind === "perk";

  return {
    key: draftKey("ben"),
    id: benefit.id,
    label: benefit.label,
    type: perk ? "perk" : "allowance",
    quotaChoice: quota.choice,
    quotaCount: quota.count,
    /*
      A LEGACY BENEFIT ARRIVES WITH ONE SYNTHESIZED OPTION whose id is the
      benefit's own (§2.2) — echoing it back is allowed and simply stores it.
    */
    options: perk ? [] : (benefit.options ?? []).map(optionToDraft),
  };
}

export function newOptionDraft(): OptionDraft {
  return {
    key: draftKey("opt"),
    kind: "free_item",
    scope: emptyScope("service"),
    value: "",
    priceMode: "same",
    variantPrices: [],
    visitFee: "zone",
  };
}

export function newBenefitDraft(): BenefitDraft {
  return {
    key: draftKey("ben"),
    label: "",
    type: "allowance",
    quotaChoice: "month",
    quotaCount: "1",
    options: [newOptionDraft()],
  };
}

/**
 * An OLD, day-based plan opens on the nearest month count (365 days → 12),
 * because V1 counts in months; saving writes `durationMonths` from then on.
 */
export function monthsFromDays(days: number | null | undefined): number {
  if (!days) return 12;
  return Math.max(1, Math.round((days * 12) / 365));
}

export function planToDraft(plan?: MembershipPlan | null): PlanDraft {
  if (!plan) {
    return {
      code: "",
      name: "",
      description: "",
      durationMonths: "6",
      isActive: true,
      priceMode: "fixed",
      price: "",
      variantPrices: [],
      attachTo: "pet",
      petSpecies: [],
      eligibility: "all",
      branchIds: [],
      renewalOfferDays: "30",
      publicVisible: false,
      publicFeatured: false,
      publicOrder: "0",
      publicBadge: "",
      benefits: [newBenefitDraft()],
    };
  }

  return {
    code: plan.code ?? "",
    name: plan.name ?? "",
    description: plan.description ?? "",
    durationMonths: String(plan.durationMonths ?? monthsFromDays(plan.durationDays)),
    isActive: plan.isActive,
    priceMode: plan.priceMode ?? "fixed",
    price: normalizeMoney(plan.price),
    variantPrices: (plan.variantPrices ?? []).map((row) => ({
      variantKey: row.variantKey,
      price: normalizeMoney(row.price),
    })),
    attachTo: plan.attachTo ?? "pet",
    petSpecies: plan.petSpecies ?? [],
    eligibility: plan.eligibility ?? "all",
    branchIds: plan.branchIds ?? [],
    renewalOfferDays: String(plan.renewalOfferDays ?? 30),
    publicVisible: plan.publicDisplay?.visible ?? false,
    publicFeatured: plan.publicDisplay?.featured ?? false,
    publicOrder: String(plan.publicDisplay?.order ?? 0),
    publicBadge: plan.publicDisplay?.badge ?? "",
    benefits: (plan.benefits ?? []).map(benefitToDraft),
  };
}

/* ────────────────────────────────────────────────────────── draft → API */

function cleanVariantPrices(rows: VariantPriceDraft[]): VariantPrice[] {
  return rows
    .map((row) => ({ variantKey: row.variantKey, price: normalizeMoney(row.price) }))
    .filter((row) => row.variantKey && row.price !== "");
}

/** What a target sends as its scope — `addon` / `any` may legally be empty. */
function cleanScope(scope: BenefitScope): BenefitScope {
  const target = scope.target;
  if (target === "any") return emptyScope("any");
  if (target === "product") {
    return { ...emptyScope("product"), productIds: scope.productIds, categoryIds: scope.categoryIds };
  }
  return {
    target,
    serviceIds: scope.serviceIds,
    productIds: [],
    categoryIds: scope.categoryIds,
    serviceKinds: scope.serviceKinds,
  };
}

export function draftToOptionInput(option: OptionDraft): BenefitOptionInput {
  const input: BenefitOptionInput = {
    kind: option.kind,
    scope: cleanScope(option.scope),
    visitFee: option.visitFee,
  };
  if (option.id) input.id = option.id;

  switch (option.kind) {
    case "free_item":
      input.value = null;
      break;
    case "discount_percent":
      // A percent is a JSON NUMBER (contract conventions).
      input.value = option.value.trim() === "" ? null : Number(option.value.replace(",", "."));
      break;
    case "discount_amount":
      input.value = normalizeMoney(option.value) || null;
      break;
    case "special_price":
      input.priceMode = option.priceMode;
      if (option.priceMode === "variant") {
        input.variantPrices = cleanVariantPrices(option.variantPrices);
        // Optional FALLBACK for an animal no row covers.
        input.value = normalizeMoney(option.value) || null;
      } else {
        input.value = normalizeMoney(option.value) || null;
        input.variantPrices = [];
      }
      break;
  }

  if (option.kind !== "special_price") {
    input.priceMode = "same";
    input.variantPrices = [];
  }

  return input;
}

export function draftToBenefitInput(benefit: BenefitDraft): BenefitInput {
  const base: BenefitInput = { label: benefit.label.trim() };
  if (benefit.id) base.id = benefit.id;

  if (benefit.type === "perk") {
    return { ...base, kind: "perk" };
  }

  return {
    ...base,
    quota: choiceToQuota(benefit.quotaChoice, benefit.quotaCount),
    options: benefit.options.map(draftToOptionInput),
  };
}

/**
 * The whole payload. `editing` changes one thing: a create may send an empty
 * code (the server numbers it `MSP-0001`), an edit with the code cleared keeps
 * the code it has rather than asking for a new one.
 */
export function draftToPayload(
  draft: PlanDraft,
  { editing = false }: { editing?: boolean } = {},
): CreateMembershipPlanInput {
  const variant = draft.attachTo === "pet" && draft.priceMode === "variant";
  const code = draft.code.trim().toUpperCase();

  const payload: CreateMembershipPlanInput = {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    durationMonths: positiveInt(draft.durationMonths) ?? 1,
    attachTo: draft.attachTo,
    petSpecies: draft.attachTo === "pet" ? draft.petSpecies : [],
    priceMode: variant ? "variant" : "fixed",
    variantPrices: variant ? cleanVariantPrices(draft.variantPrices) : [],
    eligibility: draft.eligibility,
    branchIds: draft.branchIds,
    publicDisplay: {
      visible: draft.publicVisible,
      featured: draft.publicFeatured,
      order: Number.parseInt(draft.publicOrder, 10) || 0,
      badge: draft.publicBadge.trim() || null,
    },
    renewalOfferDays: Math.max(0, Number.parseInt(draft.renewalOfferDays, 10) || 0),
    isActive: draft.isActive,
    benefits: draft.benefits.map(draftToBenefitInput),
  };

  if (!variant) payload.price = normalizeMoney(draft.price);
  if (code || !editing) payload.code = code;

  return payload;
}

/* ────────────────────────────────────────────────────────── client checks */

/**
 * The FIRST thing still stopping a save, in the order the form reads — the
 * action bar's `blockedReason` (ui-rules §16). Null when it can be sent; the
 * server still has the last word.
 */
export function planBlockedReason(draft: PlanDraft): string | null {
  if (!draft.name.trim()) return "Isi nama paketnya dulu.";
  if (!positiveInt(draft.durationMonths)) return "Isi durasi dalam bulan.";

  const variant = draft.attachTo === "pet" && draft.priceMode === "variant";
  if (variant) {
    if (cleanVariantPrices(draft.variantPrices).length === 0) {
      return "Isi minimal satu harga varian.";
    }
  } else if (normalizeMoney(draft.price) === "") {
    return "Isi harga paketnya.";
  }

  for (const [index, benefit] of draft.benefits.entries()) {
    const name = `Benefit ${index + 1}`;
    if (!benefit.label.trim()) return `${name}: isi namanya.`;
    if (benefit.type === "perk") continue;
    if (benefit.quotaChoice !== "unlimited" && !positiveInt(benefit.quotaCount)) {
      return `${name}: isi kuotanya.`;
    }
    if (benefit.options.length === 0) return `${name}: tambahkan minimal satu opsi.`;
    for (const option of benefit.options) {
      const problem = optionProblem(option);
      if (problem) return `${name}: ${problem}`;
    }
  }

  return null;
}

/** What is missing on one option, or null. */
export function optionProblem(option: OptionDraft): string | null {
  const { scope } = option;
  const named = scope.serviceIds.length + scope.productIds.length + scope.categoryIds.length;

  if (scope.target === "service" && named === 0 && scope.serviceKinds.length === 0) {
    return "pilih kelompok atau layanannya.";
  }
  if (scope.target === "product" && named === 0) return "pilih produknya.";

  if (option.kind === "discount_percent") {
    const percent = Number(option.value.replace(",", "."));
    if (option.value.trim() === "" || !(percent > 0 && percent <= 100)) {
      return "isi persen diskon (1–100).";
    }
  }
  if (option.kind === "discount_amount" && normalizeMoney(option.value) === "") {
    return "isi nilai potongannya.";
  }
  if (option.kind === "special_price") {
    if (!specialPriceAllowed(scope)) return "harga khusus butuh layanan atau produk tertentu.";
    if (option.priceMode === "same" && normalizeMoney(option.value) === "") {
      return "isi harga khususnya.";
    }
    if (option.priceMode === "variant" && cleanVariantPrices(option.variantPrices).length === 0) {
      return "isi minimal satu harga varian.";
    }
  }
  return null;
}

/**
 * Harga khusus needs SOMETHING SPECIFIC to price: a named service or product.
 * "Semua add-on", a kelompok or "Apa saja" have no single normal price to
 * replace (the API also refuses `special_price` on `any`).
 */
export function specialPriceAllowed(scope: BenefitScope): boolean {
  if (scope.target === "any") return false;
  return scope.serviceIds.length + scope.productIds.length > 0;
}

/* ────────────────────────────────────────────────────────── preview estimate */

/** Rupiah as a plain number — DISPLAY ONLY, for an estimate rounded to the rupiah. */
const rupiah = (value: string | null | undefined): number => {
  const minor = toMinor(value ?? "");
  return minor === null ? 0 : Number(minor) / 10_000;
};

/**
 * What one option is worth to the owner for one animal, in rupiah — the price
 * it takes off the dearest covered service. Zero when nothing specific is
 * named (a kelompok, "semua add-on", a product): there is no single normal
 * price to read, so the estimate leaves it out rather than guessing.
 */
export function optionValueFor(
  option: OptionDraft,
  variantKey: string | null,
  services: Map<string, Service>,
): number {
  let best = 0;

  for (const id of option.scope.serviceIds) {
    const service = services.get(id);
    const normal = rupiah(servicePriceFor(service, variantKey));
    if (normal <= 0) continue;

    let off = 0;
    if (option.kind === "free_item") off = normal;
    else if (option.kind === "discount_percent") {
      off = (normal * (Number(option.value.replace(",", ".")) || 0)) / 100;
    } else if (option.kind === "discount_amount") {
      off = Math.min(rupiah(normalizeMoney(option.value)), normal);
    } else {
      const rows = cleanVariantPrices(option.variantPrices);
      const member =
        option.priceMode === "variant"
          ? (matchVariantPrice(rows, variantKey) ?? (normalizeMoney(option.value) || null))
          : normalizeMoney(option.value) || null;
      off = member === null ? 0 : Math.max(0, normal - rupiah(member));
    }

    best = Math.max(best, off);
  }

  return best;
}

export interface PlanEstimate {
  /** Allowance value per month if every quota is used, dearest option each time. */
  perMonth: number;
  total: number;
  /** What the plan costs this animal; null when no price applies. */
  price: number | null;
  /** total − price. */
  saving: number | null;
  /** Some benefit has no limit, so it is not in the figure. */
  hasUnlimited: boolean;
  /** Some option could not be priced (kelompok, add-on, product). */
  hasUnpriced: boolean;
}

export function estimatePlan(
  draft: PlanDraft,
  variantKey: string | null,
  services: Map<string, Service>,
): PlanEstimate {
  const months = Math.max(positiveInt(draft.durationMonths) ?? 1, 1);
  let perMonth = 0;
  let hasUnlimited = false;
  let hasUnpriced = false;

  for (const benefit of draft.benefits) {
    if (benefit.type === "perk") continue;
    const values = benefit.options.map((option) => {
      const value = optionValueFor(option, variantKey, services);
      if (value === 0 && option.scope.serviceIds.length === 0) hasUnpriced = true;
      return value;
    });
    const best = Math.max(0, ...values);
    const count = positiveInt(benefit.quotaCount) ?? 0;

    if (benefit.quotaChoice === "month") perMonth += best * count;
    else if (benefit.quotaChoice === "week") perMonth += (best * count * 52) / 12;
    else if (benefit.quotaChoice === "term") perMonth += (best * count) / months;
    else hasUnlimited = true;
  }

  const variant = draft.attachTo === "pet" && draft.priceMode === "variant";
  const priceText = variant
    ? matchVariantPrice(cleanVariantPrices(draft.variantPrices), variantKey)
    : normalizeMoney(draft.price) || null;
  const price = priceText === null ? null : rupiah(priceText);
  const total = Math.round(perMonth * months);

  return {
    perMonth: Math.round(perMonth),
    total,
    price,
    saving: price === null ? null : total - price,
    hasUnlimited,
    hasUnpriced,
  };
}

/** Whole rupiah as the decimal string `formatRupiah` reads. */
export const rupiahString = (value: number) => String(Math.round(value));
