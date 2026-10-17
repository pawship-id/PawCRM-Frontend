import type {
  BenefitAvailability,
  BenefitQuota,
  MembershipBenefit,
  MembershipRedemption,
  PetMembership,
} from "@/types/membership";
import { MEMBERSHIP_LIMITS } from "@/types/membership";
import { isoDate } from "@/utils/date";

import { formatDate } from "./labels";

/**
 * Kelola keanggotaan — the PURE half of the dialogs: calendar arithmetic, the
 * preview box ("Masa berlaku baru …", "+7 hari", "bulan ke-2 → bulan ke-3") and
 * the client-side refusals, from the BO prototype's `klPreview`.
 *
 * THE SERVER STILL DECIDES (contract §3.7). Everything here is a forecast so
 * somebody sees the effect before pressing save; a 409 the forecast missed is
 * still shown, as a toast, in the server's own words.
 *
 * DAYS ARE `"YYYY-MM-DD"` KEYS, read from LOCAL parts — the tenant's calendar
 * day, which is also what the endpoints take (`isoDate`, never
 * `toISOString().slice(0, 10)`).
 */

export type KelolaType =
  | "adjust-dates"
  | "pause"
  | "adjust-quota"
  | "transfer"
  | "move"
  | "cancel";

/* ───────────────────────────────────────────────────────── calendar days */

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Is this a real `YYYY-MM-DD` day? An empty date input gives `""`. */
export function isDayKey(key: string | null | undefined): key is string {
  if (!key || !DAY_KEY.test(key)) return false;
  return !Number.isNaN(parseKey(key).getTime());
}

/** The calendar day an ISO instant falls on, in this browser's timezone. */
export function dayKey(value: string | Date): string {
  return isoDate(value instanceof Date ? value : new Date(value));
}

export function addDays(key: string, days: number): string {
  const date = parseKey(key);
  return isoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

/**
 * `key` plus N months, CLAMPED to the shorter month — 31 Jan + 1 → 28/29 Feb.
 * Always counted from the same anchor, as the server does, so a card that
 * started on the 31st does not drift to the 28th for good after February.
 */
export function addMonths(key: string, months: number): string {
  const date = parseKey(key);
  const first = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return isoDate(new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), last)));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffDays(from: string, to: string): number {
  return Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / 86_400_000);
}

/** `"12 Okt 2026"`. */
export function formatDay(key: string): string {
  return formatDate(parseKey(key));
}

/** `"12 Okt – 11 Nov 2026"`-ish: both ends spelled out, always. */
export function formatDayRange(from: string, to: string): string {
  return `${formatDay(from)} – ${formatDay(to)}`;
}

/** `"+7 hari"` / `"−3 hari"` / `"tidak berubah"`. */
export function signedDays(days: number): string {
  if (days === 0) return "tidak berubah";
  return `${days > 0 ? "+" : "−"}${Math.abs(days)} hari`;
}

/* ───────────────────────────────────────────────────────── the card */

/** First and last day of cover, as day keys. */
export function cardRange(card: Pick<PetMembership, "startDate" | "endDate">) {
  return { start: dayKey(card.startDate), end: dayKey(card.endDate) };
}

/**
 * The last day a plan of this length covers from `start`: N months − 1 day when
 * the plan counts months (they win), else N days − 1 (the first day counts).
 */
export function planEnd(
  start: string,
  plan: { durationMonths?: number | null; durationDays?: number | null },
): string {
  if (plan.durationMonths) return addDays(addMonths(start, plan.durationMonths), -1);
  return addDays(start, Math.max(1, plan.durationDays ?? 1) - 1);
}

/**
 * Has any allowance EVER been spent on this card? It decides whether the start
 * may still move (contract §3.7 `mode: "start"`) and whether cancelling will be
 * refused.
 */
export function hasUsage(card: Pick<PetMembership, "benefits" | "redemptions">): boolean {
  if ((card.benefits ?? []).some((benefit) => (benefit.usedTotal ?? 0) > 0)) return true;
  return (card.redemptions ?? []).some((row) => row.amount > 0 && !row.reversedAt);
}

/** Total days this card has already been paused — the 30-day budget's spend. */
export function pausedDays(card: Pick<PetMembership, "pauses">): number {
  return (card.pauses ?? []).reduce((sum, pause) => sum + (pause.days ?? 0), 0);
}

/** A benefit whose cap can be corrected: it has a number to correct. */
export function quotaAdjustable(benefit: BenefitAvailability): boolean {
  return benefit.kind !== "perk" && !benefit.unlimited && benefit.cap !== null;
}

/** A benefit counted against a quota (per period or for the whole term). */
export function hasQuota(quota: Partial<BenefitQuota> | null | undefined): boolean {
  return Boolean((quota?.perPeriod && quota?.period) || quota?.total);
}

/* ───────────────────────────────────────────────────────── preview shape */

export interface PreviewRow {
  label: string;
  value: string;
  /** Bold — the figure the dialog is about. */
  strong?: boolean;
  tone?: "success" | "danger";
}

export interface KelolaPreview {
  rows: PreviewRow[];
  /** Refusals the server would answer with; save stays disabled while any stand. */
  errors: string[];
  /** A sentence instead of rows, when there is nothing to compute yet. */
  empty?: string;
}

const nothing = (empty: string): KelolaPreview => ({ rows: [], errors: [], empty });

/* ───────────────────────────────────────────────────────── adjust-dates */

export function previewAdjustDates(
  card: PetMembership,
  input: { mode: "start" | "end"; date: string },
  today: string,
): KelolaPreview {
  if (!isDayKey(input.date)) return nothing("Pilih tanggalnya.");
  const { start, end } = cardRange(card);

  if (input.mode === "start") {
    /* The days added since issue (pauses, extensions) ride along with the move. */
    const extra = diffDays(planEnd(start, card.plan), end);
    const nextEnd = addDays(planEnd(input.date, card.plan), extra);
    const errors: string[] = [];
    if (hasUsage(card)) {
      errors.push("Tanggal mulai tidak bisa digeser karena jatah sudah pernah dipakai.");
    }

    return {
      rows: [
        { label: "Masa berlaku baru", value: formatDayRange(input.date, nextEnd), strong: true },
        { label: "Sebelumnya", value: formatDayRange(start, end) },
        { label: "Periode jatah", value: `dihitung ulang dari ${formatDay(input.date)}` },
      ],
      errors,
    };
  }

  const delta = diffDays(end, input.date);
  const errors: string[] = [];
  if (input.date < today) errors.push("Tanggal berakhir tidak boleh sebelum hari ini.");
  else if (input.date <= start) errors.push("Tanggal berakhir harus setelah tanggal mulai.");

  return {
    rows: [
      { label: "Berakhir baru", value: formatDay(input.date), strong: true },
      { label: "Sebelumnya", value: formatDay(end) },
      {
        label: "Perubahan",
        value: signedDays(delta),
        strong: true,
        tone: delta > 0 ? "success" : delta < 0 ? "danger" : undefined,
      },
    ],
    errors,
  };
}

/* ───────────────────────────────────────────────────────── pause */

export function previewPause(
  card: PetMembership,
  input: { startDate: string; days: number },
  today: string,
): KelolaPreview {
  if (!isDayKey(input.startDate)) return nothing("Pilih tanggal mulai ditunda.");
  const { end } = cardRange(card);
  const days = input.days;
  const errors: string[] = [];
  const spent = pausedDays(card);

  if (card.status === "expired") errors.push("Membership sudah berakhir, tidak bisa ditunda.");
  if (!Number.isInteger(days) || days < 1 || days > MEMBERSHIP_LIMITS.maxPauseDays) {
    errors.push(`Lama tunda 1–${MEMBERSHIP_LIMITS.maxPauseDays} hari.`);
  } else if (spent + days > MEMBERSHIP_LIMITS.maxPauseDays) {
    errors.push(
      `Maksimal ${MEMBERSHIP_LIMITS.maxPauseDays} hari per keanggotaan — sudah terpakai ${spent} hari, sisa ${Math.max(0, MEMBERSHIP_LIMITS.maxPauseDays - spent)} hari.`,
    );
  }
  if (input.startDate < today) errors.push("Mulai ditunda tidak boleh sebelum hari ini.");
  else if (input.startDate > end) errors.push("Mulai ditunda harus di dalam masa berlaku.");

  const valid = Number.isInteger(days) && days >= 1;
  const pauseEnd = valid ? addDays(input.startDate, days - 1) : input.startDate;

  if (valid) {
    const clash = (card.pauses ?? []).some((pause) => {
      const from = dayKey(pause.startDate);
      const until = dayKey(pause.endDate); // exclusive
      return input.startDate < until && from <= pauseEnd;
    });
    if (clash) errors.push("Bertabrakan dengan penundaan sebelumnya.");
  }

  if (!valid) return { rows: [], errors };

  return {
    rows: [
      { label: "Ditunda", value: formatDayRange(input.startDate, pauseEnd), strong: true },
      { label: "Berakhir baru", value: formatDay(addDays(end, days)), strong: true },
      { label: "Selama ditunda", value: "jatah tidak bisa dipakai" },
    ],
    errors,
  };
}

/* ───────────────────────────────────────────────────────── adjust-quota */

export function previewAdjustQuota(
  card: PetMembership,
  deltas: Record<string, number>,
): KelolaPreview {
  const rows: PreviewRow[] = [];
  const errors: string[] = [];

  for (const benefit of card.benefits ?? []) {
    const delta = deltas[benefit.id] ?? 0;
    if (!delta || !quotaAdjustable(benefit)) continue;
    const cap = benefit.cap ?? 0;
    const next = cap + delta;
    rows.push({ label: benefit.label, value: `${cap} → ${next}`, strong: true });

    if (Math.abs(delta) > 99) errors.push(`${benefit.label}: koreksi paling banyak 99.`);
    else if (next < (benefit.used ?? 0)) {
      errors.push(
        `${benefit.label}: kuota tidak boleh di bawah yang sudah terpakai (${benefit.used ?? 0}).`,
      );
    }
  }

  if (!rows.length) return nothing("Belum ada penyesuaian.");
  return { rows, errors };
}

/* ───────────────────────────────────────────────────────── periods */

export interface PeriodSlot {
  /** In the server's own format: `M3`/`W2` (anniversary), `2026-10`/`2026-W41` (calendar). */
  key: string;
  start: string;
  end: string;
  /** "bulan ke-3", "minggu ke-2", "Okt 2026", "minggu 5 Okt 2026". */
  label: string;
}

/** ISO-8601 week key, `"2026-W41"`. */
function isoWeekKey(key: string): string {
  const date = parseKey(key);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - day + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((thursday.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        ((firstThursday.getDay() + 6) % 7)) /
        7,
    );
  return `${thursday.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * The quota bucket `date` falls in (contract §3.5), or null for a benefit that
 * has no period (counted over the whole term). Pauses do not shift periods.
 */
export function periodOf(
  card: Pick<PetMembership, "startDate" | "periodMode">,
  quota: Partial<BenefitQuota> | null | undefined,
  date: string,
): PeriodSlot | null {
  const period = quota?.perPeriod ? (quota.period ?? null) : null;
  if (!period) return null;

  if (card.periodMode === "anniversary") {
    const anchor = dayKey(card.startDate);
    if (period === "week") {
      const index = Math.max(0, Math.floor(diffDays(anchor, date) / 7));
      const start = addDays(anchor, index * 7);
      return { key: `W${index + 1}`, start, end: addDays(start, 6), label: `minggu ke-${index + 1}` };
    }
    let index = 0;
    while (index < 600 && addMonths(anchor, index + 1) <= date) index += 1;
    return {
      key: `M${index + 1}`,
      start: addMonths(anchor, index),
      end: addDays(addMonths(anchor, index + 1), -1),
      label: `bulan ke-${index + 1}`,
    };
  }

  const at = parseKey(date);
  if (period === "week") {
    const start = addDays(date, -((at.getDay() + 6) % 7));
    return { key: isoWeekKey(date), start, end: addDays(start, 6), label: `minggu ${formatDay(start)}` };
  }
  const start = isoDate(new Date(at.getFullYear(), at.getMonth(), 1));
  return {
    key: start.slice(0, 7),
    start,
    end: isoDate(new Date(at.getFullYear(), at.getMonth() + 1, 0)),
    label: at.toLocaleDateString("id-ID", { month: "short", year: "numeric" }),
  };
}

/* ───────────────────────────────────────────────────────── move redemption */

/** The benefit a ledger row spent, with its live counters when the card has them. */
export function benefitOfRow(
  card: PetMembership,
  row: Pick<MembershipRedemption, "benefitId">,
): BenefitAvailability | MembershipBenefit | null {
  return (
    card.benefits?.find((benefit) => benefit.id === row.benefitId) ??
    card.plan.benefits.find((benefit) => benefit.id === row.benefitId) ??
    null
  );
}

/** May this ledger row be re-dated? Only a live spend of a counted benefit. */
export function canMoveRow(card: PetMembership, row: MembershipRedemption): boolean {
  if (card.status === "cancelled") return false;
  if (row.amount <= 0 || row.reversedAt || row.reversalOf) return false;
  return hasQuota(benefitOfRow(card, row)?.quota);
}

export function previewMoveRedemption(
  card: PetMembership,
  row: MembershipRedemption,
  date: string,
): KelolaPreview {
  if (!isDayKey(date)) return nothing("Pilih tanggal pakai yang benar.");
  const { start, end } = cardRange(card);
  const benefit = benefitOfRow(card, row);
  const label = row.benefitLabel ?? benefit?.label ?? "Benefit";
  const from = dayKey(row.usedAt);
  const errors: string[] = [];

  if (date < start || date > end) errors.push("Tanggal harus di dalam masa berlaku.");

  const rows: PreviewRow[] = [
    { label: "Pemakaian", value: `${label} · ${formatDay(from)} → ${formatDay(date)}`, strong: true },
  ];

  const oldSlot = periodOf(card, benefit?.quota, from);
  const newSlot = periodOf(card, benefit?.quota, date);

  if (!oldSlot || !newSlot) {
    rows.push({ label: "Periode jatah", value: "tidak berubah (jatah selama masa berlaku)" });
    return { rows, errors };
  }

  const moved = oldSlot.key !== newSlot.key;
  const used = (card.redemptions ?? []).filter(
    (other) =>
      other.id !== row.id &&
      other.benefitId === row.benefitId &&
      other.amount > 0 &&
      !other.reversedAt &&
      periodOf(card, benefit?.quota, dayKey(other.usedAt))?.key === newSlot.key,
  ).length;
  const correction = (card.quotaAdjustments ?? [])
    .filter((entry) => entry.benefitId === row.benefitId && entry.periodKey === newSlot.key)
    .reduce((sum, entry) => sum + entry.delta, 0);
  const cap = (benefit?.quota.perPeriod ?? 0) + correction;

  rows.push({
    label: "Periode jatah",
    value: moved ? `${oldSlot.label} → ${newSlot.label}` : `tetap ${newSlot.label}`,
    strong: true,
  });
  rows.push({
    label: `Kuota ${label} di ${newSlot.label}`,
    value: `${formatDayRange(newSlot.start, newSlot.end)} · terpakai ${used} dari ${cap}`,
  });

  if (moved && used >= cap) {
    errors.push("Kuota periode tujuan sudah habis. Pakai Koreksi jatah dulu kalau memang perlu.");
  }

  return { rows, errors };
}

/* ───────────────────────────────────────────────────────── transfer */

/** Why this animal cannot take the card — null when it can. */
export function transferBlockReason(
  pet: { _id: string; species: string | null },
  card: Pick<PetMembership, "petId" | "plan">,
  heldPetIds: ReadonlySet<string>,
): string | null {
  if (pet._id === card.petId) return "hewan yang sekarang";
  const species = card.plan.petSpecies ?? [];
  if (species.length && (!pet.species || !species.includes(pet.species))) {
    return "jenis hewan tidak sesuai paket";
  }
  if (heldPetIds.has(pet._id)) return "sudah punya membership";
  return null;
}

export function previewTransfer(card: PetMembership, targetName: string | null): KelolaPreview {
  const errors: string[] = [];
  if (card.status === "expired") errors.push("Membership sudah berakhir, tidak bisa dipindah.");
  if (!targetName) return { ...nothing("Pilih hewan tujuan."), errors };

  return {
    rows: [
      { label: "Dari", value: card.petName ?? "—", strong: true },
      { label: "Ke", value: targetName, strong: true },
      { label: "Ikut pindah", value: "sisa masa berlaku dan sisa jatah" },
    ],
    errors,
  };
}

/* ───────────────────────────────────────────────────────── cancel */

export function previewCancel(card: PetMembership): KelolaPreview {
  return {
    rows: [{ label: "Kartu", value: `${card.number} ditandai dibatalkan`, strong: true }],
    errors: [],
    empty: hasUsage(card)
      ? "Jatah kartu ini sudah pernah dipakai, jadi pembatalan akan ditolak. Batalkan dulu transaksinya."
      : undefined,
  };
}
