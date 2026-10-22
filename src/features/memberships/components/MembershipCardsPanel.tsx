"use client";

import Link from "next/link";
import { ListFilter } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Card,
  FilterBar,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
  HighlightText,
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
import { cn } from "@/lib/utils";
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
 * THE CARD ROW IS THE LENS (ui-rules §8, drawn as cards on request, 20
 * October 2026): Aktif · Segera berakhir · Jatah belum terpakai · Berakhir,
 * each with its count, applying on click; clicking the pressed card again lets
 * go. Ditunda and Belum lunas join the row only when there is something in
 * them — a card reading 0 on every visit is noise.
 *
 * Below it: search, and Paket + Melekat ke behind one Filter button.
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
function Holder({ card, query }: { card: PetMembership; query?: string }) {
  return (
    <>
      <span className="block font-medium text-foreground">
        <HighlightText text={card.petName ?? card.customerName ?? "—"} query={query} />
      </span>
      <span className="block text-sm text-muted">
        {card.attachTo === "customer" ? (
          "pelanggan · semua hewan"
        ) : (
          <>
            <HighlightText text={card.customerName ?? "Pelanggan"} query={query} /> · hewan
          </>
        )}
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
      <div
        role="group"
        aria-label="Status anggota"
        className="grid grid-cols-2 gap-3 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none"
      >
        {pills.map((pill) => (
          <LensCard
            key={pill.value}
            label={pill.label}
            count={pill.count}
            tone={pill.value === "expiringSoon" || pill.value === "unusedQuota" ? "warning" : "default"}
            pressed={lens === pill.value}
            onPress={() => pickLens(pill.value)}
          />
        ))}
      </div>

      <FilterBar
        searchPlacement="leading"
        searchClassName="min-w-[12rem] flex-1"
        search={
          <FilterSearch
            value={query.search ?? ""}
            onChange={(value) => patchQuery({ search: value || undefined })}
            ariaLabel="Cari anggota"
            placeholder="Cari pelanggan, hewan, atau nomor"
            fill
          />
        }
      >
        <CardFilterPanel
          planOptions={planOptions}
          applied={{ planId: query.planId ?? "", attachTo: query.attachTo ?? "" }}
          onApply={(next) =>
            patchQuery({
              planId: next.planId || undefined,
              attachTo: (next.attachTo || undefined) as AttachTo | undefined,
            })
          }
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
                        <HighlightText text={card.number} query={query.search} />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Holder card={card} query={query.search} />
                    </TableCell>
                    <TableCell>
                      <span className="block">
                        <HighlightText text={card.plan.name ?? "—"} query={query.search} />
                      </span>
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

/** Everything the panel edits, as one draft. */
interface CardFilters {
  planId: string;
  attachTo: string;
}

const CLEARED_CARD_FILTERS: CardFilters = { planId: "", attachTo: "" };

/**
 * Paket and Melekat ke behind one button, like Paket's list and the rest of
 * the app (ui-rules §8). The status pills stay outside — they are the screen's
 * main lens. Fields wait for Terapkan; Reset applies at once.
 */
function CardFilterPanel({
  planOptions,
  applied,
  onApply,
}: {
  planOptions: ReturnType<typeof usePlanOptions>;
  applied: CardFilters;
  onApply: (next: CardFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  const count = [applied.planId !== "", applied.attachTo !== ""].filter(Boolean).length;

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft.
    if (next) setDraft(applied);
    setOpen(next);
  }

  return (
    <>
      <FilterTrigger
        label={count === 0 ? "Filter" : `Filter (${count})`}
        active={count > 0}
        icon={<ListFilter className="size-4" />}
        aria-label="Filter"
        onClick={() => onOpenChange(true)}
      />

      <FilterPanel
        open={open}
        onOpenChange={onOpenChange}
        onReset={() => {
          onApply(CLEARED_CARD_FILTERS);
          setOpen(false);
        }}
        onApply={() => {
          onApply(draft);
          setOpen(false);
        }}
      >
        <FilterSelect
          layout="field"
          label="Paket"
          ariaLabel="Filter paket"
          value={draft.planId}
          options={planOptions}
          searchable
          onChange={(planId) => setDraft((prev) => ({ ...prev, planId }))}
        />
        <FilterSelect
          layout="field"
          label="Melekat ke"
          ariaLabel="Filter melekat ke"
          value={draft.attachTo}
          options={ATTACH_OPTIONS}
          onChange={(attachTo) => setDraft((prev) => ({ ...prev, attachTo }))}
        />
      </FilterPanel>
    </>
  );
}

/**
 * One status card in the lens row — a label and its count, pressed to narrow
 * the table, pressed again to let go. Spans, not paragraphs: it is a button.
 */
function LensCard({
  label,
  count,
  tone,
  pressed,
  onPress,
}: {
  label: string;
  count: number | undefined;
  tone: "default" | "warning";
  pressed: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={cn(
        "flex w-full cursor-pointer flex-col items-start rounded-xl border p-4 text-left transition",
        "hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        pressed ? "border-primary bg-navy-100" : "border-border bg-surface",
      )}
    >
      <span className="text-sm text-muted">{label}</span>
      <span
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "warning" ? "text-warning" : "text-foreground",
        )}
      >
        {count ?? "—"}
      </span>
    </button>
  );
}
