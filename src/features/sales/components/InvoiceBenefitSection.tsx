"use client";

import { Button } from "@/components/ui/button";
import { REASON_LABEL } from "@/features/memberships/labels";
import { formatMoney } from "@/utils/decimal";
import type { Pet } from "@/types/api";
import type { BenefitCandidate, BenefitQuoteResponse } from "@/types/membership";

/**
 * BENEFIT MEMBERSHIP on a faktur — every benefit the customer's animals hold,
 * under Diskon faktur (1 October 2026, on request).
 *
 * THE SAME MOVE THE TILL ALREADY MADE (`PosBenefitSection`), for the same
 * reason: a benefit offered as a chip on the row it could pay for showed only
 * what happened to MATCH. A customer holding four benefits saw one button on
 * one row and no sign the other three existed — a question nobody typing a
 * faktur could answer by looking at it.
 *
 * EVERY BENEFIT IS LISTED, and the ones that cannot be used are DISABLED WITH
 * THE REASON rather than hidden — "Jatah periode ini sudah dipakai" is the
 * answer somebody came here to find.
 *
 * ─── WHICH ROW A BENEFIT LANDS ON ──────────────────────────────────────────
 *
 * It still applies to one ROW — that is what the server takes — so this picks
 * the row where it is worth MOST, the same rule a row's own `recommended` chip
 * used. A row already carrying some other benefit is not a target: one row
 * takes one.
 */
export interface InvoiceBenefitRow {
  key: string;
  label: string;
  planName: string | null;
  membershipNumber: string;
  /** The animal whose card this is — a customer may bring two. */
  petName: string | null;
  /** Set when this benefit is already on a row: that row's key. */
  appliedTo: string | null;
  /** Set when it could go on a row: that row's key and the server's quote. */
  target: { key: string; candidate: BenefitCandidate } | null;
  /** Why it cannot be used — null when it can. */
  blocked: string | null;
}

/** The shape this reads off a draft row — structurally compatible with `DraftLine`. */
export interface BenefitLineLike {
  key: string;
  petId: string;
  benefit: { membershipId: string; benefitId: string; amount: string } | null;
}

/**
 * Every benefit, with what the faktur can currently do with it.
 *
 * EXPORTED AND PURE so the arithmetic is testable without a DOM — the same
 * reason `benefitRows` is separate from `PosBenefitSection`.
 */
export function invoiceBenefitRows(
  quote: BenefitQuoteResponse | null,
  lines: BenefitLineLike[],
  pets: Pet[],
): InvoiceBenefitRow[] {
  const cards = quote?.cards ?? [];
  const quoteLines = quote?.lines ?? [];
  const byKey = new Map(lines.map((line) => [line.key, line]));
  const petNameOf = (petId: string | null) =>
    petId ? (pets.find((pet) => pet._id === petId)?.name ?? null) : null;

  return cards.flatMap((card) =>
    card.benefits.map((benefit) => {
      const appliedLine = lines.find(
        (line) =>
          line.benefit?.membershipId === card.id &&
          line.benefit?.benefitId === benefit.id,
      );

      /*
        THE ROW IT IS WORTH MOST ON. A row already carrying SOME benefit is not
        a target: one row takes one.
      */
      let target: { key: string; candidate: BenefitCandidate } | null = null;
      for (const quoteLine of quoteLines) {
        if (quoteLine.ref === null) continue;
        const line = byKey.get(quoteLine.ref);
        if (!line || line.benefit) continue;

        const match = quoteLine.candidates.find(
          (candidate) =>
            candidate.membershipId === card.id &&
            candidate.benefitId === benefit.id,
        );
        if (!match) continue;

        if (!target || Number(match.discount) > Number(target.candidate.discount)) {
          target = { key: quoteLine.ref, candidate: match };
        }
      }

      const blocked = !benefit.available
        ? (benefit.reason ? REASON_LABEL[benefit.reason] : "Belum bisa dipakai")
        : !appliedLine && !target
          ? "Tidak ada baris yang cocok di faktur"
          : null;

      /* The animal belonging to whichever row is relevant — the one already
         carrying it, or the one it would land on. */
      const relevantPetId =
        appliedLine?.petId ?? (target ? byKey.get(target.key)?.petId : null) ?? null;

      return {
        key: `${card.id}:${benefit.id}`,
        label: benefit.label,
        planName: card.planName,
        membershipNumber: card.number,
        petName: petNameOf(relevantPetId),
        appliedTo: appliedLine?.key ?? null,
        target,
        blocked,
      };
    }),
  );
}

export function InvoiceBenefitSection({
  quote,
  lines,
  pets,
  disabled = false,
  onApply,
  onRemove,
}: {
  quote: BenefitQuoteResponse | null;
  lines: BenefitLineLike[];
  pets: Pet[];
  disabled?: boolean;
  onApply: (
    key: string,
    benefit: {
      membershipId: string;
      benefitId: string;
      amount: string;
      benefitLabel: string | null;
    },
  ) => void;
  onRemove: (key: string) => void;
}) {
  const rows = invoiceBenefitRows(quote, lines, pets);

  /* NO CARD, NO SECTION. An empty heading on every walk-in faktur is a box
     that never has anything in it, on a form already long. */
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
                        ? `Hemat ${formatMoney(row.target.candidate.discount)} · ${row.petName ?? row.planName ?? row.membershipNumber}`
                        : (row.petName ?? row.planName ?? row.membershipNumber)}
                </p>
              </div>

              {applied ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 shrink-0"
                  disabled={disabled}
                  onClick={() => onRemove(row.appliedTo as string)}
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
                    row.target &&
                    onApply(row.target.key, {
                      membershipId: row.target.candidate.membershipId,
                      benefitId: row.target.candidate.benefitId,
                      amount: row.target.candidate.discount,
                      benefitLabel: row.target.candidate.benefitLabel,
                    })
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
