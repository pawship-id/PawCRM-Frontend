import { quotaText } from "@/features/memberships/labels";
import type { PlannedExtra } from "@/types/api";
import type { BenefitTarget, MembershipBenefit, PetMembership } from "@/types/membership";

/**
 * "BENEFIT LAIN DARI {PAKET}" — what an animal's live cards hold that a booking
 * cannot use (22 October 2026), pure.
 *
 * The booking form spends a card on a service or an add-on, on that service's
 * own price row. Everything else the card carries — a product discount, a
 * jatah of food, a perk like "Prioritas antrean" — never appears there, and a
 * receptionist talking to the customer should still be able to say "jatah
 * makanannya dipakai di kasir ya". So the form lists them, one short line
 * each, with no amounts.
 *
 * ─── WHAT COUNTS AS "USABLE IN A BOOKING" ──────────────────────────────────
 *
 * A benefit any of whose options targets `service`, `addon` or `any` — the
 * quote offers those on the price rows ("any" covers services too). A benefit
 * whose options all target products is the till's. A perk (`kind: "perk"`)
 * is never spent at all; it is named as a fasilitas.
 *
 * A CUSTOMER-ATTACHED CARD COUNTS FOR EVERY ANIMAL of that customer, as it does
 * in the quote.
 *
 * ─── TICKABLE SINCE 22 October 2026 ─────────────────────────────────────────
 *
 * Each line carries its card and benefit id so the form can tick it as
 * "benefit yang akan diberikan di kunjungan ini" — a NOTE saved on the booking
 * (`plannedExtras`). It consumes no jatah and moves no price.
 */

/** One benefit's line — what the box prints, and what a tick saves. */
export interface OtherBenefitLine {
  membershipId: string;
  benefitId: string;
  /** The benefit's own label, as the plan names it. */
  label: string;
  /** The line as printed: "Makanan · 2× per bulan — dipakai di kasir". */
  text: string;
}

/** One card's lines. */
export interface OtherBenefitsGroup {
  /** The card's id. */
  key: string;
  planName: string;
  lines: OtherBenefitLine[];
  /**
   * Why this card's benefits cannot be given on this visit — the card is
   * paused over the booking date, or not paid yet (22 October 2026). The box
   * still lists them, greyed, so staff know they exist; null when usable.
   */
  blocked: string | null;
}

const DAY_FMT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

/** Why a card's extras cannot be given at `at` (default: now), or null. */
export function blockedReasonOf(card: PetMembership, at?: string | null): string | null {
  if (card.status === "awaiting_payment") return "Membership belum lunas — benefit belum bisa dipakai.";

  const when = at ? new Date(at) : new Date();
  const pause = (card.pauses ?? []).find(
    (one) => new Date(one.startDate) <= when && when < new Date(one.endDate),
  );
  if (pause) {
    /* `endDate` is exclusive — the last paused day is the one before it. */
    const last = new Date(new Date(pause.endDate).getTime() - 86_400_000);
    return `Membership sedang ditunda s.d. ${DAY_FMT.format(last)} — benefit belum bisa dipakai.`;
  }
  if (!at && card.status === "paused") return "Membership sedang ditunda — benefit belum bisa dipakai.";
  return null;
}

/** One line → what `plannedExtras` stores. */
export function extraOf(line: OtherBenefitLine): PlannedExtra {
  return { membershipId: line.membershipId, benefitId: line.benefitId, label: line.label };
}

/** Whether `extras` already holds this line. */
export function hasExtra(extras: readonly PlannedExtra[], line: OtherBenefitLine): boolean {
  return extras.some(
    (extra) => extra.membershipId === line.membershipId && extra.benefitId === line.benefitId,
  );
}

/** `extras` with this line ticked or unticked — order kept, never doubled. */
export function toggleExtra(
  extras: readonly PlannedExtra[],
  line: OtherBenefitLine,
  checked: boolean,
): PlannedExtra[] {
  const rest = extras.filter(
    (extra) => !(extra.membershipId === line.membershipId && extra.benefitId === line.benefitId),
  );
  return checked ? [...rest, extraOf(line)] : rest;
}

const BOOKING_TARGETS: ReadonlySet<BenefitTarget> = new Set(["service", "addon", "any"]);

/** The targets a benefit's options reach — the legacy single scope when it has none. */
function targetsOf(benefit: MembershipBenefit): BenefitTarget[] {
  const options = benefit.options ?? [];
  if (options.length > 0) return options.map((option) => option.scope?.target).filter(Boolean);
  return benefit.scope?.target ? [benefit.scope.target] : [];
}

/** The line one benefit gets, or null when a booking can use it. */
export function otherBenefitLine(benefit: MembershipBenefit): string | null {
  if (benefit.kind === "perk") return `${benefit.label} (fasilitas)`;
  if (targetsOf(benefit).some((target) => BOOKING_TARGETS.has(target))) return null;
  return `${benefit.label} · ${quotaText(benefit.quota)} — dipakai di kasir`;
}

/**
 * The animal's live cards (its own and the customer's) → one group per card
 * that has anything to list. `cards` is what `useCustomerMemberships` returns —
 * active or paused cards of the customer.
 */
export function otherBenefitsOf(
  cards: readonly PetMembership[],
  petId: string,
  /** The booking's date and time — a pause is judged on the visit, not today. */
  at?: string | null,
): OtherBenefitsGroup[] {
  if (!petId) return [];

  return cards
    .filter((card) => card.attachTo === "customer" || card.petId === petId)
    .map((card) => ({
      key: card.id,
      planName: card.plan?.name ?? "membership",
      blocked: blockedReasonOf(card, at),
      lines: (card.plan?.benefits ?? []).flatMap((benefit) => {
        const text = otherBenefitLine(benefit);
        return text === null
          ? []
          : [{ membershipId: card.id, benefitId: benefit.id, label: benefit.label, text }];
      }),
    }))
    .filter((group) => group.lines.length > 0);
}
