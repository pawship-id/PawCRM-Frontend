"use client";

import { useEffect, useState } from "react";
import { Check, IdCard } from "lucide-react";

import { formatDate } from "@/features/memberships/labels";
import { membershipService } from "@/services/membership.service";
import type { PosItem, PosTransaction } from "@/types/api";
import type { PetMembership } from "@/types/membership";

/** One line of what a paid sale set off. */
export interface SaleEffect {
  key: string;
  kind: "card" | "used";
  text: string;
}

/**
 * What a paid sale did besides take money (Promosi V1) — pure, from the sale
 * and the cards it issued.
 *
 * - A package line: "Membership Explorer untuk Milo aktif 16 Okt 2026 – 15 Apr
 *   2027 · MBR-2026-0042", or "… aktif setelah lunas" on a credit sale.
 * - A line a card paid for: "Jatah Grooming terpakai · Milo".
 */
export function saleEffects(
  sale: Pick<PosTransaction, "items" | "customer">,
  cards: ReadonlyMap<string, PetMembership>,
): SaleEffect[] {
  const items = sale.items ?? [];
  const holder = (item: PosItem) =>
    item.petName ?? (item.petId ? "hewan" : `${sale.customer?.name ?? "pelanggan"} (semua hewan)`);

  const issued: SaleEffect[] = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.kind === "membership")
    .map(({ item, index }) => {
      const card = item.membershipId ? cards.get(String(item.membershipId)) : undefined;
      const head = `Membership ${item.name} untuk ${holder(item)}`;
      const text = !card
        ? `${head} terbit`
        : card.status === "awaiting_payment" || card.awaitingPayment
          ? `${head} aktif setelah lunas · ${card.number}`
          : `${head} aktif ${formatDate(card.startDate)} – ${formatDate(card.endDate)} · ${card.number}`;
      return { key: `card-${index}`, kind: "card" as const, text };
    });

  const used: SaleEffect[] = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.discount?.source === "membership")
    .map(({ item, index }) => ({
      key: `used-${index}`,
      kind: "used" as const,
      text: item.discount?.visitFeeWaiver
        ? "Biaya kunjungan gratis dari member"
        : `Jatah ${item.discount?.benefitLabel ?? item.name} terpakai${item.petName ? ` · ${item.petName}` : ""}`,
    }));

  return [...issued, ...used];
}

/**
 * The short list above the receipt right after payment. Draws nothing for a
 * sale with no membership in it — which is most of them.
 */
export function PosSaleEffects({ sale }: { sale: PosTransaction | null }) {
  const [cards, setCards] = useState<Map<string, PetMembership>>(new Map());

  const ids = (sale?.items ?? [])
    .filter((item) => item.kind === "membership" && item.membershipId)
    .map((item) => String(item.membershipId))
    .join(",");

  useEffect(() => {
    if (!ids) return;

    let live = true;

    Promise.all(
      ids.split(",").map((id) =>
        membershipService.getMembership(id).then(
          (card) => card,
          () => null,
        ),
      ),
    ).then((found) => {
      if (!live) return;
      setCards(new Map(found.filter((card): card is PetMembership => Boolean(card)).map((card) => [card.id, card])));
    });

    return () => {
      live = false;
    };
  }, [ids]);

  if (!sale) return null;
  const effects = saleEffects(sale, cards);
  if (effects.length === 0) return null;

  return (
    <ul aria-label="Yang terjadi setelah lunas" className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-3">
      {effects.map((effect) => (
        <li key={effect.key} className="flex items-start gap-2 text-sm text-foreground">
          {effect.kind === "card" ? (
            <IdCard className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          )}
          <span className="min-w-0">{effect.text}</span>
        </li>
      ))}
    </ul>
  );
}
