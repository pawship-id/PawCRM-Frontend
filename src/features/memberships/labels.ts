import type {
  BenefitKind,
  BenefitPeriod,
  BenefitUnavailableReason,
  MembershipStatus,
} from "@/types/membership";

/**
 * The words this module uses, in one file.
 *
 * WHY ONE FILE. The same benefit appears on the plan screen, on the card
 * detail, on the pet profile and (soon) at the till. Four components composing
 * "2× per bulan" from `{ perPeriod, period }` is four chances to phrase one
 * quota differently, and the one that gets it wrong is the one a customer is
 * shown. The long-form sentence comes from the SERVER (`benefit.summary`); what
 * is here is the short vocabulary around it.
 */

export const MEMBERSHIP_HREF = "/dashboard/master/customers/membership";
export const MEMBERSHIP_CARDS_HREF = `${MEMBERSHIP_HREF}/kartu`;
export const MEMBERSHIP_RENEWALS_HREF = `${MEMBERSHIP_HREF}/perpanjangan`;

export const planHref = (id: string) => `${MEMBERSHIP_HREF}/${id}`;
export const cardHref = (id: string) => `${MEMBERSHIP_CARDS_HREF}/${id}`;

export const BENEFIT_KIND_LABEL: Record<BenefitKind, string> = {
  free_item: "Gratis",
  discount_percent: "Diskon persen",
  discount_amount: "Potongan rupiah",
  perk: "Fasilitas",
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
  perk: "Tidak memotong harga — mis. prioritas booking. Hanya tampil sebagai catatan.",
};

export const PERIOD_LABEL: Record<BenefitPeriod, string> = {
  week: "minggu",
  month: "bulan",
};

/** How a period resets, said plainly — the sentence under the quota fields. */
export const PERIOD_RESET_HINT: Record<BenefitPeriod, string> = {
  week: "Jatah kembali setiap Senin.",
  month: "Jatah kembali setiap tanggal 1.",
};

export const STATUS_LABEL: Record<MembershipStatus, string> = {
  scheduled: "Terjadwal",
  active: "Aktif",
  expired: "Habis",
  cancelled: "Dibatalkan",
};

/**
 * Badge tone per status. Every coloured badge carries a word (ui-rules §1.3) —
 * these tones only reinforce the label, never replace it.
 *
 * `expired` IS NOT AN ERROR, so it is not `danger`. A card that ran its full
 * year and ended is a card that worked; painting it red would make a successful
 * outcome look like a fault, and would put the renewal list in a sea of alarm.
 * `cancelled` is the one that went wrong.
 */
export const STATUS_TONE: Record<MembershipStatus, string> = {
  scheduled: "bg-info/15 text-foreground",
  active: "bg-success-fill text-foreground",
  expired: "bg-surface-hover text-muted",
  cancelled: "bg-danger/15 text-danger-ink",
};

/**
 * Why a benefit cannot be used, said to the person at the counter.
 *
 * SHOWN, NOT HIDDEN. "Sudah dipakai minggu ini" is exactly the answer the owner
 * came to ask about; a benefit that has quietly vanished from the list is a
 * phone call.
 */
export const REASON_LABEL: Record<BenefitUnavailableReason, string> = {
  not_started: "Belum mulai berlaku",
  expired: "Masa berlaku habis",
  cancelled: "Membership dibatalkan",
  quota_exhausted: "Jatah sudah habis",
  period_exhausted: "Jatah periode ini sudah dipakai",
};

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
 * "3 bulan (90 hari)" — duration as the owner thinks of it, with the number
 * that is actually stored beside it.
 *
 * BOTH, ALWAYS. The field is days because "3 bulan from 31 January" is a date
 * somebody has to decide (see the model); showing only days makes a tidy 90 look
 * arbitrary, and showing only months would hide what the card will actually do.
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

/** The 1/3/6/12-month shortcuts the duration field offers. */
export const DURATION_PRESETS = [
  { label: "1 bulan", days: 30 },
  { label: "3 bulan", days: 90 },
  { label: "6 bulan", days: 180 },
  { label: "1 tahun", days: 365 },
];

/**
 * "2 dari 4 tersisa bulan ini · 9 dari 24 tersisa total"
 *
 * THE PERIOD ALLOWANCE COMES FIRST, because that is the question being asked:
 * nobody at a counter wants the annual figure, they want to know whether this
 * animal can have one today.
 */
export function remainingLabel(benefit: {
  remainingTotal: number | null;
  remainingThisPeriod: number | null;
  quota: { total: number | null; perPeriod: number | null; period: BenefitPeriod | null };
  kind: BenefitKind;
}): string {
  if (benefit.kind === "perk") return "Fasilitas";

  const parts: string[] = [];

  if (benefit.quota.perPeriod !== null && benefit.quota.period) {
    parts.push(
      `${benefit.remainingThisPeriod ?? 0} dari ${benefit.quota.perPeriod} tersisa ${benefit.quota.period === "week" ? "minggu ini" : "bulan ini"}`,
    );
  }

  if (benefit.quota.total !== null) {
    parts.push(`${benefit.remainingTotal ?? 0} dari ${benefit.quota.total} tersisa total`);
  }

  return parts.length ? parts.join(" · ") : "Tanpa batas";
}
