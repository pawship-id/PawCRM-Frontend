"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { membershipService } from "@/services/membership.service";
import { swalToast } from "@/lib/swal";

import { usePetMembershipCards } from "../hooks/usePetMembershipCards";
import { cardHref, formatDate } from "../labels";
import { BenefitList } from "./BenefitList";
import { IssueMembershipDialog } from "./IssueMembershipDialog";
import { MembershipStatusBadge } from "./MembershipStatusBadge";

/**
 * "Hewan ini member apa, dan benefit apa yang masih bisa dipakai."
 *
 * ─── LAPSED CARDS STAY ON THE PANEL ────────────────────────────────────────
 *
 * They carry the Perpanjang button, and they are half the reason somebody opens
 * this panel at all. Showing only the active card would mean the renewal
 * conversation could only start from a list somewhere else.
 *
 * ─── SPENT BENEFITS STAY TOO ───────────────────────────────────────────────
 *
 * Dimmed, with the reason, and with the date they come back. See `BenefitList`.
 */
export function PetMembershipPanel({
  petId,
  petName,
}: {
  petId: string;
  petName?: string | null;
}) {
  const { cards, loading, error, reload } = usePetMembershipCards(petId);
  const [issuing, setIssuing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function renew(id: string, number: string) {
    setBusyId(id);
    setActionError(null);

    try {
      const card = await membershipService.renew(id);
      swalToast(
        `Diperpanjang — kartu baru ${card.number}, berlaku sampai ${formatDate(card.endDate)}.`,
        "success",
      );
      reload();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.fullMessage
          : `Gagal memperpanjang ${number}.`,
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card
      title="Membership"
      description="Melekat pada hewan ini, bukan pada pemiliknya."
      action={
        <Can feature="petMemberships" action="create">
          <Button variant="secondary" onClick={() => setIssuing(true)}>
            Beli Membership
          </Button>
        </Can>
      }
    >
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner size={20} />
        </div>
      ) : error ? (
        <Alert variant="error">{error}</Alert>
      ) : cards.length === 0 ? (
        <p className="text-sm text-muted">
          Hewan ini belum punya membership.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {cards.map((card) => (
            <li key={card.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={cardHref(card.id)}
                      className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {card.plan.name ?? "Membership"}
                    </Link>
                    <MembershipStatusBadge status={card.status} />
                  </div>

                  <p className="text-sm text-muted tabular-nums">
                    {card.number}
                  </p>

                  {/*
                    BOTH DATES, ALWAYS. "Dibeli" and "Aktif" are separate facts
                    and the customer asks about both — one when querying the
                    charge, the other when querying the cover.
                  */}
                  <p className="mt-1 text-sm text-foreground tabular-nums">
                    Dibeli {formatDate(card.purchasedAt)} · Aktif{" "}
                    {formatDate(card.startDate)} – {formatDate(card.endDate)}
                    {card.status === "active" && ` · ${card.daysLeft} hari lagi`}
                    {card.status === "scheduled" &&
                      " · belum mulai, benefit belum bisa dipakai"}
                  </p>
                </div>

                {(card.status === "expired" || card.renewalDue) &&
                  card.status !== "cancelled" && (
                    <Can feature="petMemberships" action="create">
                      <Button
                        onClick={() => renew(card.id, card.number)}
                        disabled={busyId === card.id}
                      >
                        Perpanjang
                      </Button>
                    </Can>
                  )}
              </div>

              {actionError && busyId === null && (
                <Alert variant="error" className="mt-3">
                  {actionError}
                </Alert>
              )}

              <div className="mt-3 border-t border-border pt-3">
                <BenefitList benefits={card.benefits ?? card.plan.benefits} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <IssueMembershipDialog
        petId={petId}
        petName={petName}
        open={issuing}
        onClose={() => setIssuing(false)}
        onIssued={reload}
      />
    </Card>
  );
}
