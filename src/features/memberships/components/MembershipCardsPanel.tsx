"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Card,
  FilterBar,
  FilterPills,
  FilterSearch,
  FilterSelect,
  ListFooter,
  Spinner,
  withAll,
  type PillOption,
} from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { membershipService } from "@/services/membership.service";
import type { AttachTo, MembershipPlan, PetMembership } from "@/types/membership";

import {
  MEMBER_LENS_QUERY,
  type MemberLens,
  useMembershipCounts,
} from "../hooks/useMembershipCounts";
import { CARD_PAGE_SIZE, usePetMemberships } from "../hooks/usePetMemberships";
import { dayKey, formatDay } from "../kelola";
import { ATTACH_TO_LABEL, EXPIRING_SOON_LABEL, STATUS_LABEL, cardHref, formatDate } from "../labels";
import { JatahChips } from "./JatahRows";
import { MembershipStatusBadge } from "./MembershipStatusBadge";

/**
 * Anggota — every membership card in the shop (BO prototype
 * `membershipAnggota`).
 *
 * THE PILL ROW IS THE LENS (ui-rules §8): Aktif · Segera berakhir · Jatah
 * belum terpakai · Berakhir, each with its count, applying on click; clicking
 * the lit pill again lets go. Ditunda and Belum lunas join the row only when
 * there is something in them — a pill reading 0 on every visit is noise.
 *
 * THE QUICK BAR holds search, Paket and Melekat ke — single selects that
 * auto-apply.
 *
 * SEARCH IS THE SERVER'S: card number, plan name, customer name or phone,
 * and pet name (contract §3.6).
 */

const BASE_LENSES: MemberLens[] = ["active", "expiringSoon", "unusedQuota", "expired"];
const EXTRA_LENSES: MemberLens[] = ["paused", "awaiting_payment"];

const LENS_LABEL: Record<MemberLens, string> = {
  active: STATUS_LABEL.active,
  expiringSoon: EXPIRING_SOON_LABEL,
  unusedQuota: "Jatah belum terpakai",
  expired: STATUS_LABEL.expired,
  paused: STATUS_LABEL.paused,
  awaiting_payment: STATUS_LABEL.awaiting_payment,
};

const ATTACH_OPTIONS = withAll(
  (Object.keys(ATTACH_TO_LABEL) as AttachTo[]).map((value) => ({
    value,
    label: ATTACH_TO_LABEL[value],
  })),
  "Semua",
);

/** The plans the Paket filter offers — retired ones too: members still hold them. */
function usePlanOptions() {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);

  useEffect(() => {
    let active = true;
    membershipService
      .listPlans({ limit: 100, sort: "nameAsc" })
      .then((result) => {
        if (active) setPlans(result.items);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return useMemo(
    () =>
      withAll(
        plans.map((plan) => ({ value: plan.id, label: plan.name, meta: plan.code })),
        "Semua",
      ),
    [plans],
  );
}

/** "Mochi" over "Rina Wijaya · hewan" — or the customer over "pelanggan · semua hewan". */
function Holder({ card }: { card: PetMembership }) {
  return (
    <>
      <span className="block font-medium text-foreground">
        {card.petName ?? card.customerName ?? "—"}
      </span>
      <span className="block text-sm text-muted">
        {card.attachTo === "customer"
          ? "pelanggan · semua hewan"
          : `${card.customerName ?? "Pelanggan"} · hewan`}
      </span>
    </>
  );
}

function Term({ card }: { card: PetMembership }) {
  const ended = card.status === "expired" || card.status === "cancelled";
  return (
    <>
      <span className="block whitespace-nowrap tabular-nums">
        {formatDay(dayKey(card.startDate))} – {formatDate(card.endDate)}
      </span>
      <span className="block text-sm text-muted">
        {card.status === "expired"
          ? "sudah berakhir"
          : ended
            ? STATUS_LABEL[card.status].toLowerCase()
            : card.status === "scheduled"
              ? "belum mulai"
              : card.cycle
                ? `bulan ke-${card.cycle.index} dari ${card.cycle.of}`
                : `${card.daysLeft} hari lagi`}
      </span>
    </>
  );
}

export function MembershipCardsPanel() {
  const router = useRouter();
  const { memberships, pagination, loading, error, query, patchQuery } = usePetMemberships();
  const counts = useMembershipCounts();
  const planOptions = usePlanOptions();
  const [lens, setLens] = useState<MemberLens | "">("");

  const pills: PillOption<MemberLens | "">[] = [
    ...BASE_LENSES,
    ...EXTRA_LENSES.filter((entry) => (counts[entry] ?? 0) > 0 || lens === entry),
  ].map((entry) => ({ value: entry, label: LENS_LABEL[entry], count: counts[entry] }));

  function pickLens(next: MemberLens | "") {
    /* The lit pill pressed again lets go. */
    const value = next === lens ? "" : next;
    setLens(value);
    patchQuery({
      status: undefined,
      hasUnusedQuota: undefined,
      ...(value ? MEMBER_LENS_QUERY[value] : {}),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <FilterPills
          ariaLabel="Status anggota"
          value={lens}
          options={pills}
          onChange={pickLens}
        />
        {lens && <span className="text-sm text-muted">Klik lagi untuk melepas</span>}
      </div>

      <FilterBar
        searchPlacement="leading"
        search={
          <FilterSearch
            value={query.search ?? ""}
            onChange={(value) => patchQuery({ search: value || undefined })}
            ariaLabel="Cari anggota"
            placeholder="Cari pelanggan, hewan, atau nomor"
          />
        }
      >
        <FilterSelect
          label="Paket"
          value={query.planId ?? ""}
          options={planOptions}
          searchable
          onChange={(value) => patchQuery({ planId: value || undefined })}
        />
        <FilterSelect
          label="Melekat ke"
          value={query.attachTo ?? ""}
          options={ATTACH_OPTIONS}
          onChange={(value) => patchQuery({ attachTo: (value || undefined) as AttachTo | undefined })}
        />
      </FilterBar>

      {error && <Alert variant="error">{error}</Alert>}

      <Card className="py-3 [&>[data-slot=card-content]]:px-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner size={24} />
          </div>
        ) : memberships.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {lens || query.search || query.planId || query.attachTo
              ? "Tidak ada anggota yang cocok."
              : "Belum ada anggota. Anggota tercatat otomatis saat paket dijual di kasir."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Pemilik</TableHead>
                <TableHead>Paket</TableHead>
                <TableHead>Masa berlaku</TableHead>
                <TableHead>Jatah periode ini</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberships.map((card) => {
                const ended = card.status === "expired" || card.status === "cancelled";
                return (
                  <TableRow
                    key={card.id}
                    className="cursor-pointer hover:bg-surface-hover"
                    onClick={() => router.push(cardHref(card.id))}
                  >
                    <TableCell className="whitespace-nowrap tabular-nums">
                      <Link
                        href={cardHref(card.id)}
                        onClick={(event) => event.stopPropagation()}
                        className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {card.number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Holder card={card} />
                    </TableCell>
                    <TableCell>
                      <span className="block">{card.plan.name ?? "—"}</span>
                      {card.plan.code && (
                        <span className="block text-sm text-muted tabular-nums">{card.plan.code}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Term card={card} />
                    </TableCell>
                    <TableCell>
                      {ended ? (
                        <span className="text-sm text-muted">—</span>
                      ) : (
                        <JatahChips benefits={card.benefits} label={`Jatah ${card.number}`} />
                      )}
                    </TableCell>
                    <TableCell>
                      <MembershipStatusBadge status={card.status} expiringSoon={card.expiringSoon} />
                      {card.expiringSoon && card.status === "active" && (
                        <span className="mt-1 block text-sm text-muted tabular-nums">
                          {card.daysLeft} hari lagi
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {pagination && pagination.total > 0 && (
        <ListFooter
          page={pagination.page}
          pageSize={pagination.limit}
          pageSizes={[CARD_PAGE_SIZE, 50, 100]}
          total={pagination.total}
          totalPages={pagination.totalPages}
          unit="anggota"
          onPageChange={(page) => patchQuery({ page })}
          onPageSizeChange={(limit) => patchQuery({ limit })}
        />
      )}
    </div>
  );
}
