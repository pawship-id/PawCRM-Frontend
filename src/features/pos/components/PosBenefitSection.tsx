"use client";

import { Button } from "@/components/ui/button";
import { REASON_LABEL } from "@/features/memberships/labels";
import { formatMoney } from "@/utils/decimal";
import type { PosItem } from "@/types/api";
import type { BenefitQuoteResponse } from "@/types/membership";

/**
 * BENEFIT MEMBERSHIP — every benefit the customer's animals hold, in one place
 * under Diskon keranjang (30 September 2026, on request).
 *
 * ─── WHY IT MOVED OFF THE ROWS ─────────────────────────────────────────────
 *
 * A benefit used to be offered as a chip on the line it could pay for, which
 * showed only what happened to MATCH: a customer holding four benefits saw one
 * button on one row and nothing anywhere saying the other three existed. The
 * owner asked at the counter "kenapa yang potong kuku nggak muncul?" — a
 * question the old surface could not answer, because an unusable benefit drew
 * nothing at all.
 *
 * SO EVERY BENEFIT IS LISTED, and the ones that cannot be used are DISABLED
 * WITH THE REASON rather than hidden. "Jatah periode ini sudah dipakai" is the
 * answer somebody came to ask for; a row that silently vanished is a phone call.
 *
 * ─── WHICH LINE A BENEFIT LANDS ON ─────────────────────────────────────────
 *
 * The section does not ask. A benefit still applies to a LINE — that is what
 * the server takes — so this picks the line where it is worth MOST, which is
 * the same rule `recommended` already used per row. Two identical baths in one
 * basket make the choice arbitrary either way; a dialog asking "which Grooming
 * Lengkap?" would be a question with no better answer than this one.
 *
 * A BENEFIT WITH NOTHING TO LAND ON IS DISABLED TOO, and says so. It is
 * perfectly usable in the abstract — it just has no matching line in this
 * basket yet, which is a different fact from a spent quota and reads as one.
 */
export interface BenefitRow {
  key: string;
  label: string;
  planName: string | null;
  membershipNumber: string;
  /** The animal whose card this is — a customer may bring two. */
  petName: string | null;
  /** Set when this benefit is already on a line: the line's index. */
  appliedTo: number | null;
  /** Set when it could go on a line: that line's index and what it saves. */
  target: { index: number; discount: string } | null;
  /** Why it cannot be used — null when it can. */
  blocked: string | null;
  apply: { membershipId: string; benefitId: string };
}

/**
 * Every benefit, with what the basket can currently do with it.
 *
 * EXPORTED AND PURE so the arithmetic is testable without a DOM — the same
 * reason `board.ts` is separate from the screens that draw it.
 */
export function benefitRows(
  quote: BenefitQuoteResponse | null,
  items: PosItem[],
): BenefitRow[] {
  /* `?? []` like `useBenefitQuote`'s own `cards` — the quote is wire data,
     and one absent field must not take the whole basket down. */
  const cards = quote?.cards ?? [];
  const lines = quote?.lines ?? [];

  return cards.flatMap((card) =>
    card.benefits.map((benefit) => {
      const appliedIndex = items.findIndex(
        (item) =>
          item.discount?.source === "membership" &&
          item.discount.membershipId === card.id &&
          item.discount.benefitId === benefit.id,
      );

      /*
        THE LINE IT IS WORTH MOST ON. `line.ref` is the item's index as a
        string — set where the quote is built — and a line already carrying
        SOME benefit is not a target: one line takes one.
      */
      let target: { index: number; discount: string } | null = null;
      for (const line of lines) {
        if (line.ref === null) continue;
        const index = Number(line.ref);
        if (!Number.isInteger(index) || !items[index]) continue;
        if (items[index].discount?.source === "membership") continue;

        const match = line.candidates.find(
          (candidate) =>
            candidate.membershipId === card.id &&
            candidate.benefitId === benefit.id,
        );
        if (!match) continue;

        if (!target || Number(match.discount) > Number(target.discount)) {
          target = { index, discount: match.discount };
        }
      }

      const blocked = !benefit.available
        ? (benefit.reason ? REASON_LABEL[benefit.reason] : "Belum bisa dipakai")
        : appliedIndex === -1 && !target
          ? "Tidak ada baris yang cocok di keranjang"
          : null;

      return {
        key: `${card.id}:${benefit.id}`,
        label: benefit.label,
        planName: card.planName,
        membershipNumber: card.number,
        /* The quote's cards carry an id, not a name — so the animal is read off
           whichever line in the basket already names it. Null for a card whose
           animal has nothing in the basket, which is the "no matching line"
           case anyway. */
        petName:
          items.find((item) => item.petId === card.petId)?.petName ?? null,
        appliedTo: appliedIndex === -1 ? null : appliedIndex,
        target,
        blocked,
        apply: { membershipId: card.id, benefitId: benefit.id },
      };
    }),
  );
}

export function PosBenefitSection({
  quote,
  items,
  disabled = false,
  onApply,
  onRemove,
}: {
  quote: BenefitQuoteResponse | null;
  items: PosItem[];
  disabled?: boolean;
  onApply: (
    index: number,
    benefit: { membershipId: string; benefitId: string },
  ) => void;
  onRemove: (index: number) => void;
}) {
  const rows = benefitRows(quote, items);

  /* NO CARD, NO SECTION. An empty heading on every walk-in basket is a box
     that never has anything in it, on a screen read at speed. */
  if (rows.length === 0) return null;

  return (
    <section
      aria-label="Benefit membership"
      className="flex flex-col gap-2 border-t border-border pt-3"
    >
      <h3 className="text-xs font-semibold tracking-widest text-muted uppercase">
        Benefit membership
      </h3>

      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const applied = row.appliedTo !== null;

          return (
            <li
              key={row.key}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <p
                  className={`truncate text-sm font-medium ${
                    row.blocked && !applied ? "text-muted" : "text-foreground"
                  }`}
                >
                  {row.label}
                </p>
                {/* WHAT IT SAVES when it can be used, WHY NOT when it cannot —
                    one line, never both, because only one of them is true. */}
                <p className="truncate text-xs text-muted">
                  {row.blocked && !applied
                    ? row.blocked
                    : applied
                      ? `Terpakai · ${row.planName ?? row.membershipNumber}`
                      : row.target
                        ? `Hemat ${formatMoney(row.target.discount)} · ${row.petName ?? row.planName ?? row.membershipNumber}`
                        : (row.petName ?? row.planName ?? row.membershipNumber)}
                </p>
              </div>

              {applied ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 shrink-0"
                  disabled={disabled}
                  onClick={() => onRemove(row.appliedTo as number)}
                >
                  Lepas
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 shrink-0"
                  disabled={disabled || row.blocked !== null || !row.target}
                  onClick={() =>
                    row.target && onApply(row.target.index, row.apply)
                  }
                >
                  Pakai
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
