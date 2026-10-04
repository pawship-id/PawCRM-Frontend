"use client";

import { Sparkles } from "lucide-react";

import { usePetMembershipCards } from "@/features/memberships";
import type { BenefitAvailability } from "@/types/membership";

/**
 * "Pakai benefit membership" on a booking card.
 *
 * ─── IT PLANS, IT DOES NOT SPEND ───────────────────────────────────────────
 *
 * Nothing is deducted when the booking is saved. The quota moves when the
 * booking is BILLED, and the till re-reads the card then — a booking is a
 * promise, and one that ate a customer's weekly free bath and was then
 * cancelled would have taken something from somebody who received nothing.
 *
 * That is the single most important thing this control has to communicate, so
 * it says it in words under the choice rather than leaving somebody to assume
 * the jatah is already gone.
 *
 * ─── IT DRAWS NOTHING WHEN THERE IS NOTHING TO OFFER ───────────────────────
 *
 * No animal chosen yet, no card, or no benefit covering this service: blank. A
 * permanently empty section on every booking card would be a control that never
 * works, on a form that already has plenty to read.
 *
 * ─── AND IT DOES NOT CHECK THE QUOTA ───────────────────────────────────────
 *
 * A booking may be a fortnight out. Whether the jatah is still there is a
 * question about the day it is billed, and greying out a plan today for a quota
 * that will have reset by then would be refusing a fact about the future. The
 * server takes the same view and validates only the shape.
 */
export function BookingBenefitField({
  petId,
  serviceId,
  value,
  onChange,
}: {
  petId: string;
  serviceId: string;
  value: { membershipId: string; benefitId: string } | null;
  onChange: (next: { membershipId: string; benefitId: string } | null) => void;
}) {
  const { cards } = usePetMembershipCards(petId || null);

  /*
    EVERY BENEFIT ON EVERY LIVE CARD THAT COVERS THIS SERVICE, paired with the
    card it belongs to — a customer may hold two packages, and the choice has to
    say which one is being spent.

    SCOPE IS MATCHED LOOSELY HERE, on the service alone: the engine's full rule
    (kelompok layanan, add-on parents, targets) lives on the server and is
    applied for real when the line is priced. A form offering one benefit too
    many is recoverable; one that hid a benefit the customer is entitled to is
    the failure nobody notices.
  */
  const options = cards
    .filter((membership) => membership.status === "active")
    .flatMap((membership) =>
      (membership.benefits ?? [])
        .filter(
          (benefit: BenefitAvailability) =>
            benefit.kind !== "perk" &&
            (benefit.scope.serviceIds.length === 0 ||
              benefit.scope.serviceIds.includes(serviceId)),
        )
        .map((benefit: BenefitAvailability) => ({
          membershipId: membership.id,
          benefitId: benefit.id,
          label: benefit.label,
          planName: membership.plan.name,
        })),
    );

  if (!petId || !serviceId || options.length === 0) return null;

  const selectedKey = value ? `${value.membershipId}|${value.benefitId}` : "";

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-muted">Membership</p>

      <select
        aria-label="Benefit membership yang dipakai"
        className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        value={selectedKey}
        onChange={(event) => {
          if (!event.target.value) {
            onChange(null);
            return;
          }

          const [membershipId, benefitId] = event.target.value.split("|");
          onChange({ membershipId, benefitId });
        }}
      >
        <option value="">Tidak pakai benefit</option>
        {options.map((option) => (
          <option
            key={`${option.membershipId}|${option.benefitId}`}
            value={`${option.membershipId}|${option.benefitId}`}
          >
            {option.label} — {option.planName}
          </option>
        ))}
      </select>

      {value && (
        <p className="mt-1 flex items-start gap-1 text-xs text-muted">
          <Sparkles className="mt-0.5 size-3 shrink-0" aria-hidden />
          Baru dicatat sebagai rencana. Jatahnya berkurang saat booking ini
          ditagih di kasir, bukan sekarang.
        </p>
      )}
    </div>
  );
}
