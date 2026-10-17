"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/services/api-error";
import { membershipService } from "@/services/membership.service";
import { petService } from "@/services/pet.service";
import type { Pet } from "@/types/api";
import type { PetMembership } from "@/types/membership";

import { dayKey, formatDay, formatDayRange } from "../kelola";
import { cardHref, formatDate } from "../labels";
import { JatahChips } from "./JatahRows";
import { MembershipStatusBadge } from "./MembershipStatusBadge";
import { POS_HREF, isLiveCard, primaryLiveCard } from "./PetMembershipPanel";

/**
 * A customer's memberships, on their profile (BO prototype `profilPage`): the
 * card held by the customer themself (shared by every pet), one block per pet
 * with its own card or the way to sell one, and the full history underneath.
 *
 * TWO REQUESTS — the customer's animals and every card on the customer
 * (`GET /pet-memberships?customerId`, which already carries the live jatah
 * counters) — and everything on the section is derived from those two.
 */
export function CustomerMembershipSection({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [pets, setPets] = useState<Pet[]>([]);
  const [cards, setCards] = useState<PetMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      petService.list({ customerId, limit: 100 }),
      membershipService.listMemberships({ customerId, limit: 100, sort: "newest" }),
    ])
      .then(([petPage, cardPage]) => {
        if (!active) return;
        setPets(petPage.items);
        setCards(cardPage.items);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Membership pelanggan ini tidak bisa dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted">
        <Spinner /> Memuat membership…
      </div>
    );
  }

  if (error) return <Alert variant="error">{error}</Alert>;

  const customerCards = cards.filter((card) => card.attachTo === "customer" && isLiveCard(card));

  return (
    <div className="flex flex-col gap-4">
      {customerCards.map((card) => (
        <Block key={card.id} title="Semua hewan" subtitle="Melekat ke pelanggan, kuota dipakai bergantian">
          <MemberRow card={card} />
        </Block>
      ))}

      {pets.map((pet) => {
        const card = primaryLiveCard(cards.filter((entry) => entry.petId === pet._id));
        const variant = [pet.speciesLabel, pet.sizeLabel, pet.furTypeLabel].filter(Boolean).join(" · ");
        return (
          <Block
            key={pet._id}
            title={pet.name}
            subtitle={variant || undefined}
            link={{ href: `/dashboard/master/pets/${pet._id}`, label: "Detail hewan" }}
          >
            {card ? (
              <MemberRow card={card} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">Belum punya membership.</p>
                <Button asChild variant="secondary" size="sm">
                  <Link href={POS_HREF}>Jual paket di kasir</Link>
                </Button>
              </div>
            )}
          </Block>
        );
      })}

      {pets.length === 0 && customerCards.length === 0 && (
        <p className="text-sm text-muted">
          Belum ada hewan terdaftar.{" "}
          <Link href={POS_HREF} className="font-medium text-primary underline underline-offset-2">
            Jual paket di kasir →
          </Link>
        </p>
      )}

      <section aria-labelledby="riwayat-membership" className="flex flex-col gap-2">
        <h3 id="riwayat-membership" className="text-base font-bold">
          Riwayat membership
        </h3>
        {cards.length === 0 ? (
          <p className="text-sm text-muted">Belum pernah punya membership.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Untuk</TableHead>
                <TableHead>Paket</TableHead>
                <TableHead>Masa berlaku</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.map((card) => (
                <TableRow
                  key={card.id}
                  className="cursor-pointer hover:bg-surface-hover"
                  onClick={() => router.push(cardHref(card.id))}
                >
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <Link
                      href={cardHref(card.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {card.number}
                    </Link>
                  </TableCell>
                  <TableCell>{card.petName ?? "Semua hewan"}</TableCell>
                  <TableCell>{card.plan.name ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatDayRange(dayKey(card.startDate), dayKey(card.endDate))}
                  </TableCell>
                  <TableCell>
                    <MembershipStatusBadge status={card.status} expiringSoon={card.expiringSoon} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function Block({
  title,
  subtitle,
  link,
  children,
}: {
  title: string;
  subtitle?: string;
  link?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold">{title}</h3>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {link && (
          <Link
            href={link.href}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {link.label} ›
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Plan, status, "s.d. … · periode …", short jatah chips, and the way in. */
function MemberRow({ card }: { card: PetMembership }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{card.plan.name ?? "Membership"}</span>
          <MembershipStatusBadge status={card.status} expiringSoon={card.expiringSoon} />
        </div>
        <p className="text-sm text-muted tabular-nums">
          s.d. {formatDate(card.endDate)}
          {card.cycle
            ? ` · periode ${formatDay(dayKey(card.cycle.start))}–${formatDay(dayKey(card.cycle.end))}`
            : ""}
        </p>
        <JatahChips benefits={card.benefits} label={`Jatah ${card.number}`} />
      </div>
      <Button asChild variant="secondary" size="sm">
        <Link href={cardHref(card.id)}>Lihat &amp; kelola</Link>
      </Button>
    </div>
  );
}
