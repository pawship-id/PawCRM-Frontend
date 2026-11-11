/**
 * Promo V1 — the contract in PawCRM-Backend/docs/promo-v1.md.
 *
 * Money is a decimal STRING ("150000.0000"), ids are strings, days are
 * "YYYY-MM-DD" in the tenant's timezone.
 *
 * THE TYPES ARE COMPLETE FOR ALL FIVE PROMO KINDS even though only `coret`
 * (Harga coret) can be created in V1 — the document shape is final so the
 * others are added without a migration.
 */

export type PromoType = "coret" | "tiered" | "bundle" | "bxgy" | "bab";
export type PromoStatus = "draft" | "scheduled" | "running" | "ended";
export type PromoChannel = "pos" | "booking" | "invoice" | "website";
export type PromoTargetType = "product" | "variant" | "service" | "category";
export type PromoKind = "discount_percent" | "discount_amount" | "special_price" | "free";
export type PromoPriceMode = "same" | "variant";
export type PromoResultTarget = "per_item" | "same_group" | "cheapest" | "other_group";

/** Diskon bertingkat opened 10 November 2026 (PLAN-Promo-Bertingkat.md). */
export const AVAILABLE_PROMO_TYPES: readonly PromoType[] = ["coret", "tiered"];

export interface PromoTarget {
  targetType: PromoTargetType;
  refId: string;
  /** Service: one pet-variant combination ("species|size|fur"). */
  variantKey?: string | null;
  /** Read-only: product/service name, filled by the server on read. */
  name?: string | null;
}

export interface PromoVariantPrice {
  /** Product: the variant (child) product id. */
  productId?: string | null;
  /** Service: the pet-variant key, same as the service price grid. */
  variantKey?: string | null;
  price: string | null;
}

export interface PromoResultItem {
  id?: string | null;
  target: PromoTarget;
  kind: PromoKind;
  /** % for discount_percent, Rp/unit for discount_amount and special_price. */
  value: string | null;
  priceMode: PromoPriceMode;
  variantPrices: PromoVariantPrice[];
}

export interface PromoRestrictions {
  startDate: string;
  endDate: string | null;
  /** 0 = Minggu … 6 = Sabtu. Empty = every day. */
  weekdays: number[];
  branchIds: string[];
  channels: PromoChannel[];
  customerTypeIds: string[];
  quotaTotal: number | null;
  perCustomer: number | null;
  stackable: boolean;
}

export interface PromoRule {
  group: PromoTarget[];
  countBy: "qty" | "amount";
  tiers: { min: string; value: string }[];
}

export interface Promo {
  id: string;
  code: string;
  name: string;
  type: PromoType;
  draft: boolean;
  status: PromoStatus;
  stoppedAt: string | null;
  restrictions: PromoRestrictions;
  rule: PromoRule;
  result: { target: PromoResultTarget; items: PromoResultItem[] };
  bundle: unknown | null;
  usage: { used: number; discount: string };
  /** Items & prices are locked once the promo has been used. */
  locked: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PromoListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: PromoStatus;
  type?: PromoType;
  sort?: "newest" | "oldest" | "name" | "start";
}

export interface PromoListResponse {
  items: Promo[];
  counts: Record<"running" | "scheduled" | "draft" | "ended", number>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface PromoItemInput {
  id?: string | null;
  target: { targetType: PromoTargetType; refId: string; variantKey?: string | null };
  kind: PromoKind;
  value: string | null;
  priceMode: PromoPriceMode;
  variantPrices: PromoVariantPrice[];
}

/** SYARAT of a Diskon bertingkat promo, as sent. */
export interface PromoRuleInput {
  group: { targetType: "product" | "variant" | "service"; refId: string }[];
  countBy: "qty";
  tiers: { min: number; value: number }[];
}

export interface CreatePromoInput {
  name: string;
  type: PromoType;
  draft: boolean;
  restrictions: PromoRestrictions;
  /** Harga coret. */
  result?: { target?: "per_item"; items: PromoItemInput[] };
  /** Diskon bertingkat. */
  rule?: PromoRuleInput;
}

export type UpdatePromoInput = Partial<Omit<CreatePromoInput, "type">>;

export interface PromoAttentionItem extends Promo {
  daysLeft: number;
}

export interface PromoReportRow {
  id: string;
  code: string;
  name: string;
  type: PromoType;
  status: PromoStatus;
  startDate: string | null;
  endDate: string | null;
  quotaTotal: number | null;
  transactions: number;
  discount: string;
}

export interface PromoReport {
  totals: { discount: string; transactions: number; running: number };
  promos: PromoReportRow[];
}

/* ── quote (kasir, booking, faktur) ─────────────────────────────────── */

export interface PromoQuoteLineInput {
  ref: string;
  kind: "product" | "service" | "membership" | "other";
  refId?: string | null;
  petId?: string | null;
  variantKey?: string | null;
  qty?: string;
  /** What is left of the line after the booking share / jatah. */
  amount: string;
  /** The membership benefit offered on this line, if any. */
  member?: { kind: "quota" | "unlimited"; discount: string } | null;
}

export interface PromoQuoteInput {
  channel: "pos" | "invoice" | "booking";
  branchId?: string | null;
  customerId?: string | null;
  /** Booking: the service date. Default now. */
  at?: string | null;
  lines: PromoQuoteLineInput[];
}

export interface PromoQuotePart {
  promoId: string;
  code: string;
  name: string;
  label: string;
  stackable: boolean;
  discount: string;
}

export interface PromoQuoteLine {
  ref: string | null;
  candidates: PromoQuotePart[];
  recommended: {
    promoIds: string[];
    /** False when a promo beats the line's unlimited member benefit. */
    useMember: boolean;
    discount: string;
    parts: PromoQuotePart[];
  };
}

export interface PromoQuoteResponse {
  lines: PromoQuoteLine[];
}

/* ── what a sale line carries (kasir & faktur) ──────────────────────── */

export interface LinePromo {
  promoId: string;
  code: string | null;
  name: string | null;
  type: PromoType;
  label: string | null;
  stackable: boolean;
  discount: string;
  groupRef: string | null;
}

/** POS catalogue tile tag. `price` null for a service (priced per variant). */
export interface CatalogPromoTag {
  promoId: string;
  name: string;
  label: string;
  weekdays: number[];
  normalPrice: string | null;
  price: string | null;
}
