import type {
  AttachTo,
  BenefitKind,
  BenefitPeriod,
  BenefitQuota,
  BenefitUnavailableReason,
  Eligibility,
  KelolaReason,
  MembershipHistoryAction,
  MembershipStatus,
  OptionKind,
  OptionPriceMode,
  PlanPriceMode,
  QuoteUnavailableReason,
  VisitFee,
} from "@/types/membership";
import { KELOLA_REASONS } from "@/types/membership";

/**
 * The words this module uses, in one file.
 *
 * WHY ONE FILE. The same benefit appears on the plan screen, on the card
 * detail, on the pet profile and at the till. Four components composing
 * "2× per bulan" from `{ perPeriod, period }` is four chances to phrase one
 * quota differently, and the one that gets it wrong is the one a customer is
 * shown. The long-form sentence of a SAVED benefit comes from the server
 * (`benefit.summary`); what is here is the short vocabulary around it.
 *
 * KEEP CHIPS SHORT (BO, 16 October 2026): a tag says one thing in a word or
 * two — "Hewan", "Pelanggan baru", "Grooming 1×". Sentences go in hints.
 */

/* ─────────────────────────────────────────────────────────────── routes */

/**
 * WHERE MEMBERSHIP LIVES: the Promosi module (16 October 2026), not Pelanggan.
 * The old /dashboard/customers/membership/** addresses redirect here.
 *
 * `MEMBERSHIP_HREF` is the Membership tab, which opens on the Paket list; each
 * package and each card has its own address one segment further down.
 */
export const PROMOSI_HREF = "/dashboard/promotion";
export const PROMOSI_SUMMARY_HREF = `${PROMOSI_HREF}/summary`;
export const MEMBERSHIP_HREF = `${PROMOSI_HREF}/membership`;
export const MEMBERSHIP_PLANS_HREF = `${MEMBERSHIP_HREF}/plans`;
export const MEMBERSHIP_NEW_PLAN_HREF = `${MEMBERSHIP_PLANS_HREF}/new`;
export const MEMBERSHIP_CARDS_HREF = `${MEMBERSHIP_HREF}/member`;
/** Renewals are folded into Promosi › Ringkasan (no tab of their own). */
export const MEMBERSHIP_RENEWALS_HREF = PROMOSI_SUMMARY_HREF;

export const planHref = (id: string) => `${MEMBERSHIP_PLANS_HREF}/${id}`;
export const planEditHref = (id: string) => `${planHref(id)}/edit`;
export const cardHref = (id: string) => `${MEMBERSHIP_CARDS_HREF}/${id}`;

/* ─────────────────────────────────────────────────────── badge tones */

/** The six badge tones of ui-rules §9. */
export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

/**
 * Pale named tint + saturated ink, no border (ui-rules §9, component spec
 * `StatusBadge`). `bg-tint-*`, never opacity arithmetic — a translucent fill
 * goes muddy over a selected row (plan bug 7: these used to be `bg-danger/15`).
 * Danger takes `text-danger-ink`: `--danger` is under 4.5:1 at 13 px (§13).
 */
export const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-tint-neutral text-muted",
  info: "bg-tint-info text-info",
  success: "bg-tint-success text-success",
  warning: "bg-tint-warning text-warning",
  danger: "bg-tint-danger text-danger-ink",
  brand: "bg-navy-100 text-primary",
};

/** The badge shell every tone sits in — one place for its geometry. */
export const BADGE_CLASS =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-transparent px-2 py-0.5 text-xs font-medium";

/* ─────────────────────────────────────────────────────── card status */

export const STATUS_LABEL: Record<MembershipStatus, string> = {
  scheduled: "Terjadwal",
  active: "Aktif",
  paused: "Ditunda",
  awaiting_payment: "Belum lunas",
  expired: "Berakhir",
  cancelled: "Dibatalkan",
};

/** `expiringSoon` is a label on top of `active`, not a status of its own. */
export const EXPIRING_SOON_LABEL = "Segera berakhir";

/**
 * Badge tone per status. Every coloured badge carries a word (ui-rules §1.3) —
 * these tones only reinforce the label, never replace it.
 *
 * `expired` IS NOT AN ERROR, so it is not `danger`. A card that ran its full
 * term and ended is a card that worked. `cancelled` is the one that went wrong,
 * and `awaiting_payment` is money still owed with every benefit refused —
 * both danger, told apart by their words.
 */
export const STATUS_TONE: Record<MembershipStatus, BadgeTone> = {
  scheduled: "info",
  active: "success",
  paused: "warning",
  awaiting_payment: "danger",
  expired: "neutral",
  cancelled: "danger",
};

export const EXPIRING_SOON_TONE: BadgeTone = "warning";

/** What each status means, for an ⓘ beside a filter or a badge. */
export const STATUS_HINT: Record<MembershipStatus, string> = {
  scheduled: "Sudah terjual, masa berlakunya belum mulai.",
  active: "Sedang berlaku. Jatahnya bisa dipakai.",
  paused: "Ditunda sementara. Jatah dibekukan dan tanggal berakhir ikut mundur.",
  awaiting_payment:
    "Dijual dengan piutang yang belum lunas. Jatah baru bisa dipakai setelah dibayar.",
  expired: "Masa berlakunya sudah lewat.",
  cancelled: "Dibatalkan. Jatahnya tidak berlaku lagi.",
};

/* ─────────────────────────────────────────────────────── plan fields */

export const ATTACH_TO_LABEL: Record<AttachTo, string> = {
  pet: "Hewan",
  customer: "Pelanggan",
};

/** The one explanation "Melekat ke" needs — the form's ⓘ. */
export const ATTACH_TO_HINT =
  "Hewan: jatah milik satu hewan. Pelanggan: jatah dipakai bergantian oleh semua hewan pelanggan itu, kuotanya satu untuk semua.";

export const ELIGIBILITY_LABEL: Record<Eligibility, string> = {
  all: "Semua pelanggan",
  new_customer: "Pelanggan baru",
  renewal: "Perpanjangan",
  referral: "Lewat referral",
};

export const ELIGIBILITY_HINT =
  "Pelanggan baru: belum pernah punya membership. Perpanjangan: pernah atau sedang punya membership. Lewat referral: memakai kode referral member lain. Dicek otomatis saat dijual di kasir dan website.";

export const PLAN_PRICE_MODE_LABEL: Record<PlanPriceMode, string> = {
  fixed: "Satu harga",
  variant: "Per varian hewan",
};

export const PLAN_PRICE_MODE_HINT =
  "Per varian hewan cocok untuk paket prabayar (mis. bayar 5 dapat 6) karena harga grooming beda tiap ukuran dan bulu. Hanya untuk paket yang melekat ke hewan.";

/* ─────────────────────────────────────────────────────── benefits */

export const BENEFIT_KIND_LABEL: Record<BenefitKind, string> = {
  free_item: "Gratis",
  discount_percent: "Diskon %",
  discount_amount: "Potongan Rp",
  special_price: "Harga khusus",
  perk: "Fasilitas",
};

/** "Perlakuan harga" — the option-level kinds, in the order the builder offers them. */
export const OPTION_KIND_LABEL: Record<OptionKind, string> = {
  free_item: "Gratis",
  discount_percent: "Diskon %",
  special_price: "Harga khusus",
  discount_amount: "Potongan Rp",
};

/**
 * What each kind means, in the words of somebody deciding which to pick.
 *
 * `perk` NEEDS ITS EXPLANATION MOST: it is the option an owner skips past and
 * then expresses as a 0% discount, which would make a non-monetary promise
 * behave like a redeemable one at the till.
 */
export const BENEFIT_KIND_HINT: Record<BenefitKind, string> = {
  free_item: "Layanan atau produknya tidak ditagih sama sekali.",
  discount_percent: "Potongan sekian persen dari harga baris.",
  discount_amount: "Potongan rupiah tetap, tidak pernah melebihi harga barisnya.",
  special_price: "Harga member yang menggantikan harga normal, sama atau beda per varian hewan.",
  perk: "Tidak memotong harga — mis. prioritas booking. Hanya tampil sebagai catatan.",
};

/** The ⓘ on "Jenis benefit" — both choices, one line each. */
export const BENEFIT_TYPE_TOOLTIP = [
  "Jatah & potongan: jatah layanan atau potongan harga yang dipakai di kasir dan booking.",
  "Fasilitas: " + BENEFIT_KIND_HINT.perk,
].join("\n");

export const OPTION_PRICE_MODE_LABEL: Record<OptionPriceMode, string> = {
  same: "Sama untuk semua varian",
  variant: "Beda per varian",
};

export const VISIT_FEE_LABEL: Record<VisitFee, string> = {
  free: "Gratis",
  zone: "Ikut tarif zona",
};

export const PERIOD_LABEL: Record<BenefitPeriod, string> = {
  week: "minggu",
  month: "bulan",
};

/**
 * The builder's FOUR quota choices (§2.2 "Quota UI mapping"). One select
 * replaces the three raw fields — `benefitDraft.ts` maps it to and from
 * `{ total, perPeriod, period }`.
 */
export type QuotaChoice = "week" | "month" | "term" | "unlimited";

export const QUOTA_CHOICE_LABEL: Record<QuotaChoice, string> = {
  week: "× per minggu",
  month: "× per bulan",
  term: "× selama masa berlaku",
  unlimited: "Tidak terbatas",
};

/**
 * How a period resets, said plainly. New cards count periods FROM THE START
 * DATE (anniversary, §3.5): bought on the 16th, the month runs 16th to 15th.
 */
export const PERIOD_RESET_HINT: Record<BenefitPeriod, string> = {
  week: "Jatah kembali tiap 7 hari, dihitung dari tanggal mulai.",
  month: "Jatah kembali tiap bulan, dihitung dari tanggal mulai.",
};

/** The ⓘ on "Periode kuota" — every choice explained in one place. */
export const QUOTA_PERIOD_TOOLTIP = [
  "× per minggu: jatah kembali tiap 7 hari, dihitung dari tanggal mulai.",
  "× per bulan: jatah kembali tiap bulan, dihitung dari tanggal mulai.",
  "× selama masa berlaku: jatah dipakai sepanjang masa berlaku dan tidak kembali.",
  "Tidak terbatas: tanpa kuota, bisa dipakai setiap transaksi yang cocok.",
].join("\n");

/** "1× per bulan" · "4× selama masa berlaku" · "tanpa batas". */
export function quotaText(quota: Partial<BenefitQuota> | null | undefined): string {
  const perPeriod = quota?.perPeriod ?? null;
  const period = quota?.period ?? null;
  const total = quota?.total ?? null;

  // One quota shape per benefit; a legacy quota with both reads as its period.
  if (perPeriod && period) return `${perPeriod}× per ${PERIOD_LABEL[period]}`;
  if (total) return `${total}× selama masa berlaku`;
  return "tanpa batas";
}

/**
 * A benefit as a CHIP — "Grooming 1×", "Add-on ∞", "Prioritas". The short
 * form the BO asked for on lists; the sentence stays in `summary`.
 */
export function benefitChip(benefit: {
  label: string;
  kind?: BenefitKind;
  quota?: Partial<BenefitQuota> | null;
}): string {
  if (benefit.kind === "perk") return benefit.label;
  const count = benefit.quota?.perPeriod ?? benefit.quota?.total ?? null;
  return `${benefit.label} ${count ? `${count}×` : "∞"}`;
}

/**
 * Why a benefit cannot be used, said to the person at the counter.
 *
 * SHOWN, NOT HIDDEN. "Sudah dipakai minggu ini" is exactly the answer the owner
 * came to ask about; a benefit that has quietly vanished from the list is a
 * phone call.
 */
export const REASON_LABEL: Record<BenefitUnavailableReason, string> = {
  not_started: "Belum mulai berlaku",
  paused: "Membership sedang ditunda",
  awaiting_payment: "Menunggu pelunasan",
  expired: "Masa berlaku habis",
  cancelled: "Membership dibatalkan",
  quota_exhausted: "Jatah sudah habis",
  period_exhausted: "Jatah periode ini sudah dipakai",
};

/** A quote's `unavailable[]` reasons — the same as a card's benefit. */
export const QUOTE_REASON_LABEL: Record<QuoteUnavailableReason, string> = REASON_LABEL;

/* ─────────────────────────────────────────────────────── kelola */

/** The Kelola reasons, ready for a `SelectField` — exact strings (§1). */
export const KELOLA_REASON_OPTIONS: { value: KelolaReason; label: string }[] =
  KELOLA_REASONS.map((reason) => ({ value: reason, label: reason }));

export type KelolaAction = "adjust-dates" | "pause" | "adjust-quota" | "transfer";

/** The Kelola panel's rows: title + what it does, from the BO prototype. */
export const KELOLA_ACTIONS: Record<KelolaAction, { title: string; description: string }> = {
  "adjust-dates": {
    title: "Ubah masa berlaku",
    description: "Geser tanggal mulai (kalau belum dipakai) atau ubah tanggal berakhir.",
  },
  pause: {
    title: "Tunda sementara",
    description: "Jatah dibekukan beberapa hari, tanggal berakhir ikut mundur.",
  },
  "adjust-quota": {
    title: "Koreksi jatah periode ini",
    description: "Tambah atau kurangi kuota periode berjalan, mis. kompensasi.",
  },
  transfer: {
    title: "Pindah ke hewan lain",
    description: "Sisa masa dan jatah pindah ke hewan lain milik pelanggan yang sama.",
  },
};

/**
 * Who may do the Kelola actions — `petMemberships:manage` (and `cancel`), which
 * the seeded roles give to Owner and Manager only (contract §3). Shown on each
 * row so somebody without the grant knows whom to ask.
 */
export const KELOLA_ROLES_TEXT = "Owner, Manager";

/** The cancel row of the Kelola panel (`petMemberships:cancel`). */
export const KELOLA_CANCEL = {
  title: "Batalkan membership",
  description: "Hanya kalau belum ada jatah yang dipakai. Kartu tetap tercatat.",
};

/** A change-log row's action, as a short word for its badge. */
export const HISTORY_ACTION_LABEL: Record<MembershipHistoryAction, string> = {
  issued: "Terbit",
  renewed: "Perpanjangan",
  updated: "Diubah",
  dates_adjusted: "Ubah masa berlaku",
  paused: "Ditunda",
  quota_adjusted: "Koreksi jatah",
  transferred: "Pindah hewan",
  redemption_moved: "Ubah tanggal pakai",
  payment_received: "Lunas",
  cancelled: "Dibatalkan",
  refunded: "Direfund",
};

/** Where a redemption was spent. */
export const REDEMPTION_CONTEXT_LABEL: Record<"pos" | "invoice" | "booking" | "manual", string> = {
  pos: "Kasir",
  invoice: "Faktur",
  booking: "Booking",
  manual: "Manual",
};

/* ─────────────────────────────────────────────────────── formatting */

/** `"12 Okt 2026"` — how every date in this module reads. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** `"Rp 1.200.000"` from a decimal STRING, without ever making it a float. */
export function formatRupiah(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const [whole] = String(value).split(".");
  const negative = whole.startsWith("-");
  const digits = (negative ? whole.slice(1) : whole).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ".",
  );

  return `${negative ? "-" : ""}Rp ${digits}`;
}

/**
 * A DAY-BASED duration — "3 bulan (90 hari)". For old plans (`durationMonths:
 * null`) and card snapshots of them; a V1 plan reads `formatPlanDuration`.
 */
export function formatDuration(days: number | null | undefined): string {
  if (!days) return "—";
  const shortcut: Record<number, string> = {
    30: "1 bulan",
    90: "3 bulan",
    180: "6 bulan",
    365: "1 tahun",
  };

  return shortcut[days] ? `${shortcut[days]} (${days} hari)` : `${days} hari`;
}

/** "6 bulan" when the plan counts months (they win), else the day-based form. */
export function formatPlanDuration(plan: {
  durationMonths?: number | null;
  durationDays?: number | null;
}): string {
  if (plan.durationMonths) return `${plan.durationMonths} bulan`;
  return formatDuration(plan.durationDays);
}

/** The month shortcuts the duration field offers. */
export const DURATION_MONTH_PRESETS = [1, 3, 6, 12];

/**
 * "1 dari 2 tersisa bulan ini · 9 dari 24 tersisa total"
 *
 * THE PERIOD ALLOWANCE COMES FIRST, because that is the question being asked:
 * nobody at a counter wants the lifetime figure, they want to know whether this
 * animal can have one today. Caps include the current quota corrections.
 */
export function remainingLabel(benefit: {
  kind: BenefitKind;
  quota: { total: number | null; perPeriod: number | null; period: BenefitPeriod | null };
  remainingTotal: number | null;
  remainingThisPeriod: number | null;
  capTotal?: number | null;
  capThisPeriod?: number | null;
}): string {
  if (benefit.kind === "perk") return "Fasilitas";

  const parts: string[] = [];

  if (benefit.quota.perPeriod !== null && benefit.quota.period) {
    const cap = benefit.capThisPeriod ?? benefit.quota.perPeriod;
    parts.push(
      `${benefit.remainingThisPeriod ?? 0} dari ${cap} tersisa ${benefit.quota.period === "week" ? "minggu ini" : "bulan ini"}`,
    );
  }

  if (benefit.quota.total !== null) {
    const cap = benefit.capTotal ?? benefit.quota.total;
    parts.push(`${benefit.remainingTotal ?? 0} dari ${cap} tersisa total`);
  }

  return parts.length ? parts.join(" · ") : "Tanpa batas";
}
