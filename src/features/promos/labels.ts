import type { BadgeTone } from "@/features/memberships/labels";
import type { Promo, PromoChannel, PromoKind, PromoStatus, PromoType } from "@/types/promo";

/**
 * The words the Promo tab uses, in one file (Promo V1, 8 November 2026).
 * Same reason as memberships/labels.ts: the list, the form, the preview and
 * Ringkasan all say "Berjalan" or "Harga coret", and one spelling is the only
 * way they agree.
 */

/* ─────────────────────────────────────────────────────────────── routes */

export const PROMO_HREF = "/dashboard/promotion/promo";
export const promoNewHref = (type: PromoType = "coret") => `${PROMO_HREF}/new?type=${type}`;
export const promoEditHref = (id: string) => `${PROMO_HREF}/${id}/edit`;

/* ─────────────────────────────────────────────────────────────── types */

export const PROMO_TYPE_LABEL: Record<PromoType, string> = {
  coret: "Harga coret",
  tiered: "Diskon bertingkat",
  bundle: "Bundle",
  bxgy: "Beli X gratis Y",
  bab: "Beli A dapat B",
};

export const PROMO_TYPE_HINT: Record<PromoType, string> = {
  coret:
    "Harga promo per item atau per varian, dengan periode. Tampil sebagai harga dicoret di kasir dan website.",
  tiered:
    "Beli minimal X dari kelompok item, dapat diskon. Bisa beberapa tingkat: 2 item 10%, 3 item 15%.",
  bundle:
    "Beberapa item dijual sebagai satu paket dengan harga khusus. Tiap slot boleh punya pilihan \"atau\".",
  bxgy: "Beli 2 gratis 1 dari kelompok yang sama. Hadiah jatuh ke item termurah.",
  bab: "Beli item A, item B jadi diskon atau harga khusus.",
};

/** Every type, in the order the "Buat promo" dialog and the Jenis filter list them. */
export const PROMO_TYPES: PromoType[] = ["coret", "tiered", "bundle", "bxgy", "bab"];

/* ─────────────────────────────────────────────────────────────── status */

export const PROMO_STATUS_LABEL: Record<PromoStatus, string> = {
  running: "Berjalan",
  scheduled: "Terjadwal",
  draft: "Draft",
  ended: "Berakhir",
};

export const PROMO_STATUS_TONE: Record<PromoStatus, BadgeTone> = {
  running: "success",
  scheduled: "info",
  draft: "neutral",
  ended: "neutral",
};

/** The status strip, left to right. */
export const PROMO_STATUSES: PromoStatus[] = ["running", "scheduled", "draft", "ended"];

/** A stopped promo is `ended` with `stoppedAt` — said as "Dihentikan". */
export function promoStatusLabel(promo: Pick<Promo, "status" | "stoppedAt">): string {
  return promo.status === "ended" && promo.stoppedAt ? "Dihentikan" : PROMO_STATUS_LABEL[promo.status];
}

/* ─────────────────────────────────────────────────────────────── form */

export const PROMO_CHANNEL_LABEL: Record<PromoChannel, string> = {
  pos: "Kasir",
  booking: "Booking",
  invoice: "Faktur",
  website: "Website",
};

export const PROMO_CHANNELS: PromoChannel[] = ["pos", "booking", "invoice", "website"];

/** The three ways a coret price is written (`free` is for later promo types). */
export type CoretKind = Exclude<PromoKind, "free">;

export const CORET_KIND_LABEL: Record<CoretKind, string> = {
  discount_percent: "Diskon %",
  discount_amount: "Potongan Rp",
  special_price: "Harga promo Rp",
};

/**
 * Hari berlaku, Senin first as a shop reads a week. `day` is the API's number
 * (0 = Minggu … 6 = Sabtu).
 */
export const WEEKDAYS: { day: number; short: string }[] = [
  { day: 1, short: "Sen" },
  { day: 2, short: "Sel" },
  { day: 3, short: "Rab" },
  { day: 4, short: "Kam" },
  { day: 5, short: "Jum" },
  { day: 6, short: "Sab" },
  { day: 0, short: "Min" },
];

/** "Sen, Rab" — in week order, or "" when every day (or none) is named. */
export function weekdaysText(days: number[] | null | undefined): string {
  if (!days?.length || days.length >= 7) return "";
  return WEEKDAYS.filter((entry) => days.includes(entry.day))
    .map((entry) => entry.short)
    .join(", ");
}

/**
 * "Royal Canin +2 item" — the first item's name and how many more. A Diskon
 * bertingkat names its group and adds the tiers, as the mockup's list does:
 * "Treats 100g +1 item · 2+ 10%, 3+ 15%".
 */
export function promoItemsText(promo: Pick<Promo, "result"> & Partial<Pick<Promo, "type" | "rule">>): string {
  const tiered = promo.type === "tiered";
  const targets = tiered ? (promo.rule?.group ?? []) : promo.result.items.map((item) => item.target);
  const names = targets.map((target) => target.name ?? "Item terhapus");
  if (!names.length) return "—";
  const items = names.length === 1 ? names[0] : `${names[0]} +${names.length - 1} item`;
  if (!tiered) return items;
  const tiers = (promo.rule?.tiers ?? []).map((tier) => `${Number(tier.min)}+ ${Number(tier.value)}%`).join(", ");
  return tiers ? `${items} · ${tiers}` : items;
}
