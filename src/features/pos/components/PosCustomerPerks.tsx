"use client";

import { IdCard } from "lucide-react";

import { BADGE_CLASS, TONE_CLASS } from "@/features/memberships/labels";
import { cn } from "@/lib/utils";
import type { PetMembership } from "@/types/membership";

/** How many chips before "+n". The header is one short row, not a list. */
const MAX_CHIPS = 3;

/** "Milo · Explorer", "Milo · Explorer · ditunda", "Semua hewan · Family". */
export function perkChipLabel(card: PetMembership): string {
  const holder = card.attachTo === "customer" || !card.petId ? "Semua hewan" : (card.petName ?? "Hewan");
  const plan = card.plan?.name ?? card.number;
  return `${holder} · ${plan}${card.status === "paused" ? " · ditunda" : ""}`;
}

/**
 * THE CUSTOMER'S MEMBERSHIPS, AT A GLANCE (Promosi V1) — one short chip per
 * card under the customer's name: per animal, and "Semua hewan" for a card the
 * customer holds. At most three, then "+n" — BO: tags short and simple.
 *
 * A reminder, not a control: the per-line select in the basket is where a
 * card is actually spent.
 */
export function PosCustomerPerks({ cards }: { cards: PetMembership[] }) {
  if (cards.length === 0) return null;

  const shown = cards.slice(0, MAX_CHIPS);
  const more = cards.length - shown.length;

  return (
    <ul aria-label="Membership pelanggan" className="mt-2 flex flex-wrap gap-1.5">
      {shown.map((card) => (
        <li
          key={card.id}
          className={cn(
            BADGE_CLASS,
            "max-w-full",
            card.status === "paused" ? TONE_CLASS.neutral : TONE_CLASS.success,
          )}
        >
          <IdCard className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{perkChipLabel(card)}</span>
        </li>
      ))}
      {more > 0 && (
        <li className={cn(BADGE_CLASS, TONE_CLASS.neutral)}>+{more}</li>
      )}
    </ul>
  );
}
