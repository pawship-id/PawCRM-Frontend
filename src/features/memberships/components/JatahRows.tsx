import type { BenefitAvailability, PetMembership } from "@/types/membership";
import { cn } from "@/lib/utils";

import { REASON_LABEL, benefitChip, formatDate } from "../labels";
import { ToneBadge } from "./MembershipStatusBadge";

/**
 * "Sisa jatah" — one row per benefit: what it covers, a bar, and what is left
 * (BO prototype `jatahRows`). Drawn on the card's detail and on the pet
 * profile's Membership tab, so both answer "can this animal have one today" in
 * the same words.
 *
 * A SPENT BENEFIT STAYS, with its bar full and the date it comes back — the
 * same reason `BenefitList` dims rather than hides: "sudah dipakai bulan ini" is
 * the answer somebody came for.
 *
 * `optionText` NAMES WHAT EACH "ATAU" OPTION COVERS when the caller can resolve
 * service names (the detail screen loads the catalogue); without it the
 * server's own sentence (`summary`) stands in.
 */
export function JatahRows({
  card,
  optionText,
}: {
  card: Pick<PetMembership, "endDate" | "benefits" | "plan">;
  optionText?: (benefit: BenefitAvailability) => string | null;
}) {
  const benefits = card.benefits ?? [];

  if (!benefits.length) {
    return <p className="text-sm text-muted">Paket ini tidak memberi benefit apa pun.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {benefits.map((benefit) => (
        <JatahRow
          key={benefit.id}
          benefit={benefit}
          endDate={card.endDate}
          detail={optionText?.(benefit) ?? benefit.summary}
        />
      ))}
    </ul>
  );
}

function JatahRow({
  benefit,
  endDate,
  detail,
}: {
  benefit: BenefitAvailability;
  endDate: string;
  detail: string;
}) {
  const perk = benefit.kind === "perk";
  const unlimited = !perk && (benefit.unlimited || benefit.cap === null);
  const cap = benefit.cap ?? 0;
  const used = benefit.used ?? 0;
  const left = Math.max(0, benefit.remaining ?? cap - used);
  const full = !perk && !unlimited && left <= 0;
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const resets = benefit.quota.perPeriod
    ? benefit.resetsAt
      ? `reset ${formatDate(benefit.resetsAt)}`
      : `sampai ${formatDate(endDate)}`
    : `sampai ${formatDate(endDate)}`;
  const blocked = !benefit.available && benefit.reason && !full ? REASON_LABEL[benefit.reason] : null;

  return (
    <li className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_140px_150px] sm:items-center sm:gap-4">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          {benefit.label}
          {benefit.adjustment !== 0 && (
            <ToneBadge
              tone="warning"
              label={`${benefit.adjustment > 0 ? "+" : ""}${benefit.adjustment} koreksi`}
            />
          )}
        </p>
        <p className="text-sm text-muted">{detail}</p>
        {blocked && <p className="text-sm text-warning">{blocked}</p>}
      </div>

      <div>
        {perk ? (
          <span className="text-sm text-muted">Fasilitas</span>
        ) : unlimited ? (
          <span className="text-sm text-muted tabular-nums">
            Dipakai {benefit.usedTotal ?? 0}× sejauh ini
          </span>
        ) : (
          <div
            role="progressbar"
            aria-label={`${benefit.label} terpakai`}
            aria-valuemin={0}
            aria-valuemax={cap}
            aria-valuenow={Math.min(used, cap)}
            className="h-2 overflow-hidden rounded-full bg-navy-100"
          >
            <div
              className={cn("h-full rounded-full", full ? "bg-warning" : "bg-primary")}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      <div className="sm:text-right">
        {perk ? null : unlimited ? (
          <p className="text-sm font-semibold text-foreground">Tanpa batas</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {left} tersisa
            </p>
            <p className="text-sm text-muted tabular-nums">
              {used} dari {cap} · {resets}
            </p>
            {full && benefit.nextAvailableAt && (
              <p className="text-sm text-muted">bisa lagi {formatDate(benefit.nextAvailableAt)}</p>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/**
 * "Grooming 1/3" chips — at most two, then "+n" (BO, 16 October 2026: tags
 * short and simple). `∞` for an unlimited benefit; perks are left out, they
 * have nothing to count.
 */
export function JatahChips({
  benefits,
  max = 2,
  label,
}: {
  benefits: BenefitAvailability[] | undefined;
  max?: number;
  /** Names the list for a screen reader. */
  label?: string;
}) {
  const countable = (benefits ?? []).filter((benefit) => benefit.kind !== "perk");
  if (!countable.length) return <span className="text-sm text-muted">—</span>;

  const shown = countable.slice(0, max);
  const more = countable.length - shown.length;

  return (
    <ul className="flex flex-wrap gap-1" aria-label={label ?? "Jatah periode ini"}>
      {shown.map((benefit) => {
        const unlimited = benefit.unlimited || benefit.cap === null;
        const full = !unlimited && (benefit.remaining ?? 0) <= 0;
        return (
          <li
            key={benefit.id}
            className={cn(
              "whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
              full ? "bg-tint-warning text-warning" : "bg-tint-neutral text-foreground",
            )}
          >
            {unlimited
              ? benefitChip({ label: benefit.label, quota: null })
              : `${benefit.label} ${benefit.used ?? 0}/${benefit.cap}`}
          </li>
        );
      })}
      {more > 0 && (
        <li className="rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-muted">
          +{more}
        </li>
      )}
    </ul>
  );
}
