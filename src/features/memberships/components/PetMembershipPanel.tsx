"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { membershipService } from "@/services/membership.service";
import { swalToast } from "@/lib/swal";
import type { PetMembership } from "@/types/membership";

import { membershipFailure } from "../errors";
import { usePetMembershipCards } from "../hooks/usePetMembershipCards";
import { dayKey, formatDayRange, type KelolaType } from "../kelola";
import { cardHref, formatDate } from "../labels";
import { IssueMembershipDialog } from "./IssueMembershipDialog";
import { JatahRows } from "./JatahRows";
import { KelolaDialog, type KelolaTarget } from "./KelolaDialog";
import { MembershipStatusBadge } from "./MembershipStatusBadge";

/** Where a package is sold — the till. */
export const POS_HREF = "/dashboard/pos";

/** A card still running or yet to run — not ended, not withdrawn. */
export function isLiveCard(card: Pick<PetMembership, "status">): boolean {
  return card.status !== "expired" && card.status !== "cancelled";
}

/** Running before scheduled, then by start date — the card a counter means by "membership-nya". */
export function primaryLiveCard<T extends Pick<PetMembership, "status" | "startDate">>(
  cards: T[],
): T | null {
  const live = cards.filter(isLiveCard);
  return (
    live.find((card) => card.status !== "scheduled") ??
    [...live].sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ??
    null
  );
}

/**
 * The pet profile's Membership tab (BO prototype `hewanPage`): the animal's
 * live card with its "Sisa jatah" and the Kelola shortcuts, the owner's
 * customer-held card it also draws on ("Juga berlaku dari pelanggan"), and
 * every other card it has held, compact, underneath.
 *
 * NO CARD → THE TILL. Packages are sold at the kasir (the sale is what records
 * the money); "Terbitkan manual" stays for whoever holds `petMemberships:create`,
 * for the card that was sold outside the system.
 */
export function PetMembershipPanel({
  petId,
  petName,
  customerId,
}: {
  petId: string;
  petName?: string | null;
  /** The owner — lets "Terbitkan manual" issue a customer-held plan too. */
  customerId?: string | null;
}) {
  const { cards, customerCards, loading, error, reload } = usePetMembershipCards(petId);
  const [issuing, setIssuing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [kelola, setKelola] = useState<{ card: PetMembership; target: KelolaTarget } | null>(null);

  const name = petName ?? "Hewan ini";
  const main = primaryLiveCard(cards);
  const others = cards.filter((card) => card.id !== main?.id);
  const fromCustomer = customerCards.filter(isLiveCard);

  async function renew(card: PetMembership) {
    setBusyId(card.id);
    try {
      const next = await membershipService.renew(card.id);
      swalToast(
        `Diperpanjang — kartu baru ${next.number}, berlaku sampai ${formatDate(next.endDate)}.`,
        "success",
      );
      reload();
    } catch (err) {
      swalToast(membershipFailure(err, `Gagal memperpanjang ${card.number}.`).toast, "error", 6000);
    } finally {
      setBusyId(null);
    }
  }

  const openKelola = (card: PetMembership, type: KelolaType) =>
    setKelola({ card, target: { type } });

  if (loading) {
    return (
      <Card title="Membership">
        <div className="flex justify-center py-6">
          <Spinner size={20} />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Membership">
        <Alert variant="error">{error}</Alert>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {main ? (
        <Card
          title={`Membership · ${main.plan.name ?? "Paket"}`}
          description={
            <span className="tabular-nums">
              {main.number} · {formatDayRange(dayKey(main.startDate), dayKey(main.endDate))}
            </span>
          }
          action={<MembershipStatusBadge status={main.status} expiringSoon={main.expiringSoon} />}
        >
          <JatahRows card={main} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href={cardHref(main.id)}>Riwayat pemakaian</Link>
            </Button>
            <Can feature="petMemberships" action="manage">
              <Button variant="secondary" size="sm" onClick={() => openKelola(main, "adjust-dates")}>
                Ubah masa berlaku
              </Button>
              <Button variant="secondary" size="sm" onClick={() => openKelola(main, "adjust-quota")}>
                Koreksi jatah
              </Button>
              <Button variant="secondary" size="sm" onClick={() => openKelola(main, "pause")}>
                Tunda
              </Button>
            </Can>
            {main.renewalDue && (
              <Can feature="petMemberships" action="create">
                <Button size="sm" onClick={() => renew(main)} disabled={busyId === main.id}>
                  Perpanjang
                </Button>
              </Can>
            )}
          </div>
        </Card>
      ) : (
        <Card title="Membership">
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm text-foreground">
              {name} belum punya membership.{" "}
              <Link
                href={POS_HREF}
                className="font-medium text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Jual paket di kasir →
              </Link>
            </p>
            <Can feature="petMemberships" action="create">
              <div>
                <Button variant="secondary" size="sm" onClick={() => setIssuing(true)}>
                  Terbitkan manual
                </Button>
              </div>
            </Can>
          </div>
        </Card>
      )}

      {fromCustomer.map((card) => (
        <Card
          key={card.id}
          title="Juga berlaku dari pelanggan"
          description={`${card.plan.name ?? "Membership"} · ${card.number}`}
          action={<MembershipStatusBadge status={card.status} expiringSoon={card.expiringSoon} />}
        >
          <p className="mb-3 text-sm text-muted">
            Membership {card.customerName ?? "pemiliknya"} melekat ke pelanggan, jadi {name} ikut
            memakai kuota yang sama.
          </p>
          <JatahRows card={card} />
          <div className="mt-4">
            <Button asChild variant="secondary" size="sm">
              <Link href={cardHref(card.id)}>Lihat &amp; kelola</Link>
            </Button>
          </div>
        </Card>
      ))}

      {others.length > 0 && (
        <Card title="Membership lain">
          <ul className="flex flex-col divide-y divide-border">
            {others.map((card) => (
              <li
                key={card.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <Link
                    href={cardHref(card.id)}
                    className="text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {card.plan.name ?? "Membership"}
                  </Link>
                  <p className="text-sm text-muted tabular-nums">
                    {card.number} · {formatDayRange(dayKey(card.startDate), dayKey(card.endDate))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <MembershipStatusBadge status={card.status} expiringSoon={card.expiringSoon} />
                  {card.status === "expired" && card.renewalDue && !main && (
                    <Can feature="petMemberships" action="create">
                      <Button size="sm" onClick={() => renew(card)} disabled={busyId === card.id}>
                        Perpanjang
                      </Button>
                    </Can>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <IssueMembershipDialog
        petId={petId}
        petName={petName}
        customerId={customerId}
        open={issuing}
        onClose={() => setIssuing(false)}
        onIssued={reload}
      />

      {kelola && (
        <KelolaDialog
          card={kelola.card}
          target={kelola.target}
          onClose={() => setKelola(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
