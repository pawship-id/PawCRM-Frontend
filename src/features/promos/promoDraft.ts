import { normalizeMoney } from "@/features/memberships/planDraft";
import type {
  CreatePromoInput,
  Promo,
  PromoChannel,
  PromoItemInput,
  PromoPriceMode,
  UpdatePromoInput,
} from "@/types/promo";

import { WEEKDAYS, type CoretKind } from "./labels";

/**
 * The Harga coret form's state and every rule that turns it into the API
 * payload (PawCRM-Backend/docs/promo-v1.md) — pure, tested on its own like
 * memberships/planDraft.ts.
 *
 * Inputs hold STRINGS as typed ("150.000", "12,5"); `normalizeMoney` turns
 * them into the API's decimal strings at the edge.
 */

/* ────────────────────────────────────────────────────────── item facts */

/**
 * What the catalogue says about an item — NOT saved with the promo (the
 * server always reads normal prices from the catalogue). Loaded by the form
 * per item and handed to the preview and the editor.
 */
export interface ItemVariantFact {
  /** Product: the variant (child) product id. Service: the variant key. */
  id: string;
  /** Product variants carry their own; a service key is labelled at render. */
  label: string | null;
  normalPrice: string | null;
}

export interface ItemFacts {
  /** Standalone product / flat service: its price. Null when it has variants. */
  normalPrice: string | null;
  variants: ItemVariantFact[];
}

/* ────────────────────────────────────────────────────────── draft shape */

export interface CoretItemDraft {
  /** React key. */
  key: string;
  /** The saved row's id, kept across an edit. */
  id: string | null;
  targetType: "product" | "service";
  /** Product: the parent or standalone id. Service: the service id. */
  refId: string;
  name: string;
  kind: CoretKind;
  value: string;
  priceMode: PromoPriceMode;
  /** Variant id (product) or variant key (service) → promo price, as typed. */
  variantPrices: Record<string, string>;
}

export interface PromoDraft {
  name: string;
  startDate: string;
  endDate: string;
  /** The days ticked, API numbering. All seven = every day. */
  weekdays: number[];
  draft: boolean;
  branchIds: string[];
  customerTypeIds: string[];
  channels: PromoChannel[];
  quotaTotal: string;
  perCustomer: string;
  stackable: boolean;
  items: CoretItemDraft[];
}

const ALL_DAYS = WEEKDAYS.map((entry) => entry.day);

let seq = 0;
export const itemKey = () => `coret-${Date.now().toString(36)}-${(seq += 1)}`;

export function emptyPromoDraft(today: string): PromoDraft {
  return {
    name: "",
    startDate: today,
    endDate: "",
    weekdays: [...ALL_DAYS],
    draft: false,
    branchIds: [],
    customerTypeIds: [],
    channels: ["pos"],
    quotaTotal: "",
    perCustomer: "",
    stackable: false,
    items: [],
  };
}

export function newCoretItem(target: {
  targetType: "product" | "service";
  refId: string;
  name: string;
}): CoretItemDraft {
  return {
    key: itemKey(),
    id: null,
    ...target,
    kind: "discount_percent",
    value: "",
    priceMode: "same",
    variantPrices: {},
  };
}

const countText = (value: number | null | undefined) => (value ? String(value) : "");

export function promoToDraft(promo: Promo, today: string): PromoDraft {
  const r = promo.restrictions;
  return {
    name: promo.name,
    startDate: r.startDate ?? today,
    endDate: r.endDate ?? "",
    weekdays: r.weekdays?.length ? [...r.weekdays] : [...ALL_DAYS],
    draft: promo.draft,
    branchIds: [...(r.branchIds ?? [])],
    customerTypeIds: [...(r.customerTypeIds ?? [])],
    channels: r.channels?.length ? [...r.channels] : ["pos"],
    quotaTotal: countText(r.quotaTotal),
    perCustomer: countText(r.perCustomer),
    stackable: r.stackable,
    items: promo.result.items
      .filter((item) => item.target.targetType === "product" || item.target.targetType === "service")
      .map((item) => ({
        key: item.id ?? itemKey(),
        id: item.id ?? null,
        targetType: item.target.targetType as "product" | "service",
        refId: item.target.refId,
        name: item.target.name ?? "Item terhapus",
        kind: item.kind === "free" ? "special_price" : item.kind,
        value: item.value === null ? "" : normalizeMoney(item.value),
        priceMode: item.priceMode,
        variantPrices: Object.fromEntries(
          item.variantPrices
            .map((row) => [row.productId ?? row.variantKey ?? "", normalizeMoney(row.price)] as const)
            .filter(([id, price]) => id !== "" && price !== ""),
        ),
      })),
  };
}

/* ────────────────────────────────────────────────────────── to payload */

/** "" or "0" → null (tanpa batas); otherwise the whole number. */
export function countOrNull(value: string): number | null {
  const number = Number(value.trim() || "0");
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function itemToInput(item: CoretItemDraft): PromoItemInput {
  const variant = item.priceMode === "variant";
  return {
    ...(item.id ? { id: item.id } : {}),
    target: { targetType: item.targetType, refId: item.refId },
    kind: item.kind,
    value: variant ? null : normalizeMoney(item.value) || null,
    priceMode: item.priceMode,
    variantPrices: variant
      ? Object.entries(item.variantPrices)
          .map(([id, price]) => [id, normalizeMoney(price)] as const)
          .filter(([, price]) => price !== "")
          .map(([id, price]) =>
            item.targetType === "service" ? { variantKey: id, price } : { productId: id, price },
          )
      : [],
  };
}

export function draftToRestrictions(draft: PromoDraft): CreatePromoInput["restrictions"] {
  const everyDay = ALL_DAYS.every((day) => draft.weekdays.includes(day));
  return {
    startDate: draft.startDate,
    endDate: draft.endDate || null,
    weekdays: everyDay ? [] : [...draft.weekdays].sort((a, b) => a - b),
    branchIds: draft.branchIds,
    channels: draft.channels,
    customerTypeIds: draft.customerTypeIds,
    quotaTotal: countOrNull(draft.quotaTotal),
    perCustomer: countOrNull(draft.perCustomer),
    stackable: draft.stackable,
  };
}

export function draftToCreate(draft: PromoDraft): CreatePromoInput {
  return {
    name: draft.name.trim(),
    type: "coret",
    draft: draft.draft,
    restrictions: draftToRestrictions(draft),
    result: { target: "per_item", items: draft.items.map(itemToInput) },
  };
}

/**
 * PATCH body. A LOCKED promo (already used) leaves `result` out entirely: the
 * server refuses any change to items and prices, and re-sending them risks a
 * spelling difference ("10" vs "10.0000") reading as a change. `draft` is left
 * out too once used — a used promo cannot go back to draft.
 */
export function draftToUpdate(draft: PromoDraft, { locked }: { locked: boolean }): UpdatePromoInput {
  const body: UpdatePromoInput = {
    name: draft.name.trim(),
    restrictions: draftToRestrictions(draft),
  };
  if (!locked) {
    body.draft = draft.draft;
    body.result = { target: "per_item", items: draft.items.map(itemToInput) };
  }
  return body;
}

/* ────────────────────────────────────────────────────────── validation */

const isWholeCount = (value: string) => value.trim() === "" || /^\d+$/.test(value.trim());

/** Why one item cannot be saved yet, or null. */
export function itemProblem(item: CoretItemDraft): string | null {
  if (item.priceMode === "variant") {
    const filled = Object.values(item.variantPrices).filter((price) => normalizeMoney(price) !== "");
    if (!filled.length) return `Isi harga promo minimal untuk satu varian ${item.name}`;
    if (filled.some((price) => !(Number(normalizeMoney(price)) > 0))) {
      return `Harga promo varian ${item.name} harus lebih dari 0`;
    }
    return null;
  }

  const raw = normalizeMoney(item.value);
  if (raw === "") return `Isi nilai potongan ${item.name}`;
  const value = Number(raw);
  if (item.kind === "discount_percent" && !(value > 0 && value <= 100)) {
    return `Diskon ${item.name} harus lebih dari 0 dan maksimal 100%`;
  }
  if (!(value > 0)) {
    return item.kind === "discount_amount"
      ? `Potongan ${item.name} harus lebih dari 0`
      : `Harga promo ${item.name} harus lebih dari 0`;
  }
  return null;
}

/**
 * The first reason the form cannot be saved — FormActionBar's `blockedReason`.
 * Top to bottom in the order the panels are read.
 */
export function promoBlockedReason(draft: PromoDraft): string | null {
  if (!draft.name.trim()) return "Isi nama promo";
  if (!draft.startDate) return "Isi tanggal mulai";
  if (draft.endDate && draft.endDate < draft.startDate) {
    return "Tanggal selesai tidak boleh sebelum tanggal mulai";
  }
  if (!draft.weekdays.length) return "Pilih minimal satu hari berlaku";
  if (!draft.items.length) return "Tambahkan minimal satu item";
  for (const item of draft.items) {
    const problem = itemProblem(item);
    if (problem) return problem;
  }
  if (!draft.channels.length) return "Pilih minimal satu kanal";
  if (!isWholeCount(draft.quotaTotal)) return "Kuota promo harus angka bulat";
  if (!isWholeCount(draft.perCustomer)) return "Batas per pelanggan harus angka bulat";
  return null;
}

/* ────────────────────────────────────────────────────────── pricing */

/** A figure as TYPED ("150.000", "12,5"). */
const toNumber = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const text = normalizeMoney(value);
  if (text === "") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
};

/** A figure as the API SENDS it ("150000.0000", "150000.5") — never reparsed as typing. */
const apiNumber = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * The promo price of one unit whose normal price is `normal`, or null when the
 * promo does not touch it — no value yet, a variant left blank, or a promo
 * price that is not below normal (a "Harga promo" higher than a cheap
 * variant's own price: that variant is simply not in the promo).
 *
 * Same rule as the server's coret provider; for the PREVIEW only — the till
 * asks the server.
 */
export function coretPrice(
  item: Pick<CoretItemDraft, "kind" | "value" | "priceMode" | "variantPrices">,
  normal: string | null,
  variantId?: string,
): number | null {
  const base = apiNumber(normal);
  if (base === null || base <= 0) return null;

  let price: number | null;
  if (item.priceMode === "variant") {
    price = variantId ? toNumber(item.variantPrices[variantId]) : null;
  } else {
    const value = toNumber(item.value);
    if (value === null) return null;
    price =
      item.kind === "discount_percent"
        ? Math.round(base * (1 - Math.min(value, 100) / 100))
        : item.kind === "discount_amount"
          ? Math.max(0, base - value)
          : value;
  }

  if (price === null || price >= base) return null;
  return Math.max(0, price);
}

/** −% badge figure, rounded; 0 when there is no discount. */
export function discountPercent(normal: string | null, price: number | null): number {
  const base = apiNumber(normal);
  if (base === null || base <= 0 || price === null) return 0;
  return Math.round(((base - price) / base) * 100);
}
