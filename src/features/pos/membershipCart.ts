import { formatMoneyShort, sumDecimals } from "@/utils/decimal";
import type {
  PosBenefitPick,
  PosItem,
  PosTransaction,
} from "@/types/api";
import type {
  BenefitCandidate,
  BenefitQuoteInput,
  BenefitQuoteLine,
  BenefitQuoteLineResult,
  BenefitQuoteResponse,
  BenefitQuoteUnavailable,
  MembershipStatus,
} from "@/types/membership";

/**
 * ─── MEMBERSHIP IN THE BASKET (Promosi V1, Fase 4) ─────────────────────────
 *
 * Pure helpers behind the till's member picks — contract
 * `PawCRM-Backend/docs/membership-v1.md` §4 (quote) and §6 (POS).
 *
 * THE FLOW (§6.3): build the quote from the cart → auto-apply `recommended` on
 * every line nobody chose for → PATCH the cart with `benefit` per line →
 * re-quote after every change. NOTHING HERE PRICES ANYTHING: a pick is ids
 * only, and the server re-prices every line on every write.
 *
 * Kept out of the components so the rules are testable without a DOM.
 */

/* ─────────────────────────────────────────────────────────── a line's pick */

/** Whether the line is a home-visit fee (TRV) line. */
export function isFeeLine(item: Pick<PosItem, "homeTripId" | "visitFee">): boolean {
  return Boolean(item.homeTripId || item.visitFee);
}

/**
 * The member pick a line carries right now, or null.
 *
 * `item.benefit` is what the server sends since Phase B; the discount's own
 * fields are the fallback for an older response. A visit-fee WAIVER is derived,
 * never picked — it is not a pick and is never sent back.
 */
export function pickOf(item: PosItem): PosBenefitPick | null {
  if (item.benefit !== undefined) {
    const pick = item.benefit;
    return pick && pick.benefitId && (pick.membershipId || pick.packageRef)
      ? pick
      : null;
  }

  const discount = item.discount;
  if (
    discount?.source === "membership" &&
    !discount.visitFeeWaiver &&
    discount.benefitId &&
    (discount.membershipId || discount.packageRef)
  ) {
    return {
      membershipId: discount.packageRef ? null : (discount.membershipId ?? null),
      packageRef: discount.packageRef ?? null,
      benefitId: discount.benefitId,
      optionId: discount.optionId ?? null,
    };
  }

  return null;
}

/** The pick a candidate stands for — a virtual card is named by its package. */
export function candidatePick(candidate: BenefitCandidate): PosBenefitPick {
  return candidate.virtual && candidate.packageRef
    ? {
        packageRef: candidate.packageRef,
        benefitId: candidate.benefitId,
        optionId: candidate.optionId ?? null,
      }
    : {
        membershipId: candidate.membershipId,
        benefitId: candidate.benefitId,
        optionId: candidate.optionId ?? null,
      };
}

/** "Which card, which benefit" as one comparable string. Options do not count. */
export function pickKey(pick: PosBenefitPick): string {
  const holder = pick.packageRef ? `pkg:${pick.packageRef}` : `mbr:${pick.membershipId ?? ""}`;
  return `${holder}|${pick.benefitId}`;
}

export function candidateKey(candidate: BenefitCandidate): string {
  return pickKey(candidatePick(candidate));
}

/**
 * A line's identity across writes, for remembering "Tanpa member".
 *
 * A cart line has no id — the server rebuilds every line from the payload —
 * so the line is named by what it IS, plus how many identical lines come
 * before it.
 */
export function lineKey(items: PosItem[], index: number): string {
  const base = (item: PosItem) =>
    [
      item.kind,
      item.refId,
      item.petId ?? "",
      item.bookingId ?? "",
      item.homeTripId ?? "",
      item.parentServiceId ?? "",
    ].join("|");

  const own = base(items[index]);
  let occurrence = 0;
  for (let at = 0; at < index; at += 1) {
    if (base(items[at]) === own) occurrence += 1;
  }

  return `${own}#${occurrence}`;
}

/* ───────────────────────────────────────────────────────── the quote ask */

/**
 * The quote request for this basket (contract §4.1), or null when there is
 * nothing to ask: no customer, or no line a card could pay for.
 *
 * `ref` IS THE LINE'S INDEX. The quote is kept with the digest of the request
 * it answers (see `usePosMembershipQuote`), so a stale answer is never read
 * against a renumbered basket.
 *
 * A PICK FROM A SAME-CART PACKAGE IS NOT PINNED: its virtual card's id changes
 * on every quote, so there is nothing stable to send. The line keeps its pick
 * on the cart either way, and auto-apply leaves a line with a pick alone.
 */
export function buildQuoteInput(
  cart: Pick<PosTransaction, "customerId" | "items"> | null,
  noBenefitKeys: ReadonlySet<string> = new Set(),
): BenefitQuoteInput | null {
  if (!cart?.customerId) return null;

  const items = cart.items ?? [];

  const lines: BenefitQuoteLine[] = items.flatMap((item, index) => {
    if (item.kind === "membership") return [];

    const fee = isFeeLine(item);
    const pick = pickOf(item);
    const line: BenefitQuoteLine = {
      ref: String(index),
      kind: !fee && item.parentServiceId ? "addon" : item.kind,
      refId: item.refId,
      petId: item.petId ?? null,
      amount: item.lineTotal,
      qty: Number(item.qty) || 1,
      parentServiceId: fee ? null : (item.parentServiceId ?? null),
      bookingId: item.bookingId ?? null,
      ...(fee
        ? { homeTripId: item.homeTripId ?? item.visitFee?.homeTripId ?? `trip-${index}` }
        : { bookingHomeTripId: item.bookingTripId ?? null }),
    };

    if (!fee) {
      if (pick?.membershipId) {
        line.membershipId = pick.membershipId;
        line.benefitId = pick.benefitId;
        line.optionId = pick.optionId ?? null;
      } else if (!pick && noBenefitKeys.has(lineKey(items, index))) {
        line.noBenefit = true;
      }
    }

    return [line];
  });

  if (lines.length === 0) return null;

  const packages = items
    .filter((item) => item.kind === "membership" && item.packageRef)
    .map((item) => ({
      ref: item.packageRef as string,
      planId: item.refId,
      petId: item.petId ?? null,
      startDate: item.membershipStartDate ?? null,
    }));

  return {
    customerId: cart.customerId,
    ...(packages.length > 0 ? { packages } : {}),
    lines,
  };
}

/** The quote line answering cart line `index`, or null. */
export function quoteLineFor(
  quote: BenefitQuoteResponse | null,
  index: number,
): BenefitQuoteLineResult | null {
  return quote?.lines?.find((line) => line.ref === String(index)) ?? null;
}

/* ──────────────────────────────────────────────────────────── auto-apply */

/**
 * WHAT TO APPLY WITHOUT ASKING (contract §6.3): the quote's `recommended` on
 * every line that has no pick yet and that nobody set to "Tanpa member".
 *
 * A line that already carries a pick keeps it — the quote pinned it, so its
 * `recommended` IS that pick while it still holds. A booking's planned pick is
 * pinned by the server the same way (§4.2 "Sesuai booking") and so arrives
 * here as `recommended` like any other.
 *
 * All changes are applied in ONE write: the quote priced them together, each
 * line competing with the ones before it.
 */
export function autoApplyChanges(
  items: PosItem[],
  quote: BenefitQuoteResponse | null,
  noBenefitKeys: ReadonlySet<string> = new Set(),
): Array<{ index: number; benefit: PosBenefitPick }> {
  if (!quote) return [];

  return (quote.lines ?? []).flatMap((line) => {
    if (line.lineType === "visit_fee" || line.ref === null) return [];

    const index = Number(line.ref);
    const item = items[index];
    if (!Number.isInteger(index) || !item) return [];
    if (item.kind === "membership" || isFeeLine(item)) return [];
    if (pickOf(item)) return [];
    if (noBenefitKeys.has(lineKey(items, index))) return [];
    if (!line.recommended) return [];

    return [{ index, benefit: candidatePick(line.recommended) }];
  });
}

/* ────────────────────────────────────────────────────── what a row shows */

/** "Jatah Grooming 2/3 −Rp 109 rb" — one option of the per-line select. */
export function candidateOptionLabel(candidate: BenefitCandidate): string {
  const value = sumDecimals([candidate.discount, candidate.visitFeeDiscount ?? "0"]);
  return `${candidate.label} −${formatMoneyShort(value)}`;
}

/**
 * The short chip for a benefit that would cover the line but cannot be used
 * (§4.2 `unavailable`). Short on purpose (BO: tags short and simple) — the
 * server's whole sentence is the fallback for a reason we do not shorten.
 */
export function unavailableChip(entry: BenefitQuoteUnavailable): string {
  switch (entry.reason) {
    case "quota_exhausted":
    case "period_exhausted":
      return `${entry.benefitLabel} habis`;
    case "paused":
      return "Member ditunda";
    case "awaiting_payment":
      return "Member belum lunas";
    case "not_started":
      return `${entry.benefitLabel} belum mulai`;
    case "reserved": {
      const holder = entry.reservedBy?.[0]?.bookingNumber;
      return holder ? `${entry.benefitLabel} dipesan ${holder}` : `${entry.benefitLabel} dipesan booking lain`;
    }
    default:
      return entry.message ?? entry.benefitLabel;
  }
}

/** Deduplicated chips for one quote line, at most `max`. */
export function unavailableChips(
  line: BenefitQuoteLineResult | null,
  max = 2,
): string[] {
  const seen = new Set<string>();
  for (const entry of line?.unavailable ?? []) {
    seen.add(unavailableChip(entry));
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** Whether the line's pick is the one its booking was made with — "sesuai booking". */
export function matchesBooking(item: PosItem): boolean {
  const pick = pickOf(item);
  const plan = item.plannedBenefit;
  return Boolean(
    pick &&
      plan &&
      pick.membershipId &&
      pick.membershipId === plan.membershipId &&
      pick.benefitId === plan.benefitId,
  );
}

/* ─────────────────────────────────────────────────────────── grouping */

/** What the pet header says about the animal's membership. */
export interface PetPlan {
  name: string;
  /** `new` — bought in this basket; `paused` — its card is on hold. */
  state: "new" | "paused" | null;
}

export interface PetGroup {
  key: string;
  petId: string | null;
  petName: string | null;
  lines: Array<{ item: PosItem; index: number }>;
}

/**
 * The basket's lines, one group per animal (Promosi V1) — fee lines excluded,
 * they keep their own trip groups. Groups follow the order the animals first
 * appear; lines without an animal go LAST, under "Tanpa hewan".
 *
 * THE ORIGINAL INDEX travels with every line: every callback addresses a line
 * by its position in the cart.
 */
export function groupByPet(items: PosItem[]): PetGroup[] {
  const groups: PetGroup[] = [];
  const loose: PetGroup = { key: "no-pet", petId: null, petName: null, lines: [] };

  items.forEach((item, index) => {
    if (item.visitFee) return;

    if (!item.petId) {
      loose.lines.push({ item, index });
      return;
    }

    const key = `pet-${item.petId}`;
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.lines.push({ item, index });
      existing.petName ??= item.petName ?? null;
      return;
    }

    groups.push({ key, petId: String(item.petId), petName: item.petName ?? null, lines: [{ item, index }] });
  });

  return loose.lines.length > 0 ? [...groups, loose] : groups;
}

/**
 * The plan each animal's header names: a package bought in this basket wins
 * ("(dibeli sekarang)"), else the card it already holds (active, or paused →
 * "· sedang ditunda").
 */
export function petPlans(
  items: PosItem[],
  cards: Array<{
    petId: string | null;
    planName: string | null;
    status: MembershipStatus;
  }>,
): Map<string, PetPlan> {
  const plans = new Map<string, PetPlan>();

  for (const card of cards) {
    if (!card.petId || !card.planName) continue;
    if (card.status !== "active" && card.status !== "paused") continue;
    if (plans.has(card.petId) && card.status !== "active") continue;
    plans.set(card.petId, {
      name: card.planName,
      state: card.status === "paused" ? "paused" : null,
    });
  }

  for (const item of items) {
    if (item.kind === "membership" && item.petId) {
      plans.set(String(item.petId), { name: item.name, state: "new" });
    }
  }

  return plans;
}

/** A fresh `packageRef` — unique per cart, ≤ 60 chars (contract §6.2). */
export function newPackageRef(items: PosItem[]): string {
  const taken = new Set(items.map((item) => item.packageRef).filter(Boolean));
  let n = items.filter((item) => item.kind === "membership").length + 1;
  while (taken.has(`pkg-${n}`)) n += 1;
  return `pkg-${n}`;
}
