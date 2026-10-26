"use client";

import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { ChevronRight, MessageCircle, UserRound } from "lucide-react";

import { Alert, Breadcrumb, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBranchOptions } from "@/features/inventory/hooks/useBranchOptions";
import { Can, usePermissions } from "@/features/permissions";
import { usePetOptions } from "@/hooks/usePetOptions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { membershipService } from "@/services/membership.service";
import type {
  BenefitAvailability,
  MembershipRedemption,
  PetMembership,
} from "@/types/membership";
import { whatsAppLink } from "@/utils/phone";

import { membershipFailure } from "../errors";
import { useMembershipCard } from "../hooks/useMembershipCard";
import { useMembershipCatalog } from "../hooks/useMembershipCatalog";
import { benefitOfRow, canMoveRow, dayKey, formatDayRange, type KelolaType } from "../kelola";
import {
  HISTORY_ACTION_LABEL,
  KELOLA_ACTIONS,
  KELOLA_CANCEL,
  KELOLA_ROLES_TEXT,
  MEMBERSHIP_CARDS_HREF,
  PROMOSI_SUMMARY_HREF,
  REDEMPTION_CONTEXT_LABEL,
  formatDate,
  formatRupiah,
} from "../labels";
import { variantKeyLabel } from "../variantKey";
import { scopeSummary } from "./BenefitScopeField";
import { JatahRows } from "./JatahRows";
import { KelolaDialog, type KelolaTarget } from "./KelolaDialog";
import { MembershipStatusBadge, ToneBadge } from "./MembershipStatusBadge";
import { RecognitionPanel } from "./RecognitionPanel";

/**
 * One member — the BO prototype's `anggotaDetail`: a hero saying whose card
 * this is and where in its term it stands, "Sisa jatah", the ledger
 * ("Riwayat pemakaian") with "Ubah tanggal" per row, the read-only change log
 * ("Riwayat perubahan"), and the Kelola panel at the side.
 *
 * A REVERSED SPEND STAYS IN THE LEDGER, struck through and labelled
 * "dikembalikan": a void that erased its own trace would leave a quota changing
 * for no reason anybody could point at.
 */
export function MembershipCardDetail({ id }: { id: string }) {
  const { card, loading, error, reload } = useMembershipCard(id);
  const [kelola, setKelola] = useState<KelolaTarget | null>(null);
  const [renewing, setRenewing] = useState(false);
  /* One catalogue fetch for the whole screen — names what each option covers. */
  const { optionText, names } = useOptionText();

  const open = useCallback(
    (type: KelolaType, redemption?: MembershipRedemption) => setKelola({ type, redemption }),
    [],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size={24} />
      </div>
    );
  }

  if (error || !card) {
    return <Alert variant="error">{error ?? "Membership tidak ditemukan."}</Alert>;
  }

  async function renew() {
    if (!card) return;
    setRenewing(true);
    try {
      const next = await membershipService.renew(card.id);
      swalToast(`Kartu baru ${next.number}, berlaku sampai ${formatDate(next.endDate)}.`, "success");
      reload();
    } catch (err) {
      swalToast(membershipFailure(err, "Gagal memperpanjang.").toast, "error", 6000);
    } finally {
      setRenewing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: "Promosi", href: PROMOSI_SUMMARY_HREF },
          { label: "Anggota", href: MEMBERSHIP_CARDS_HREF },
          { label: card.number },
        ]}
      />

      <Hero card={card} renewing={renewing} onRenew={renew} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <SisaJatah card={card} optionText={optionText} />
          <Ledger card={card} names={names} onMove={(row) => open("move", row)} />
          <RecognitionPanel card={card} onChanged={reload} />
          <ChangeLog card={card} />
        </div>

        <KelolaPanel card={card} onOpen={open} />
      </div>

      <KelolaDialog card={card} target={kelola} onClose={() => setKelola(null)} onSaved={reload} />
    </div>
  );
}

/* ───────────────────────────────────────────────────────── hero */

function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums",
        tone === "warning" ? "bg-tint-warning text-warning" : "bg-tint-neutral text-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** The pause worth naming in the hero: the running one, else the next one ahead. */
function shownPause(card: PetMembership) {
  if (card.activePause) return card.activePause;
  const now = Date.now();
  return (
    [...(card.pauses ?? [])]
      .filter((pause) => new Date(pause.startDate).getTime() > now)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  );
}

function Hero({
  card,
  renewing,
  onRenew,
}: {
  card: PetMembership;
  renewing: boolean;
  onRenew: () => void;
}) {
  const { branches } = useBranchOptions();
  const { label } = usePetOptions();
  const branch = branches.find((entry) => entry._id === card.branchId)?.name ?? null;
  const holder = card.petName
    ? `${card.petName} · ${card.customerName ?? "Pelanggan"}`
    : (card.customerName ?? "Pelanggan");
  const pause = shownPause(card);
  const chat = whatsAppLink(card.customerPhone ?? null);
  const ended = card.status === "expired" || card.status === "cancelled";

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(card.customerPhone ?? "");
      swalToast("Nomor disalin.", "success");
    } catch {
      swalToast("Gagal menyalin nomor.", "error");
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">{holder}</h1>
          <p className="mt-1 text-sm text-muted">
            {card.plan.name ?? "Membership"} · <span className="tabular-nums">{card.number}</span>
            {branch ? ` · ${branch}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <MembershipStatusBadge status={card.status} expiringSoon={card.expiringSoon} />
            <Chip>{formatDayRange(dayKey(card.startDate), dayKey(card.endDate))}</Chip>
            {card.cycle && !ended && (
              <Chip>
                Bulan ke-{card.cycle.index} dari {card.cycle.of} ·{" "}
                {formatDayRange(dayKey(card.cycle.start), dayKey(card.cycle.end))}
              </Chip>
            )}
            {pause && (
              <Chip tone="warning">
                Ditunda {formatDate(pause.startDate)} · {pause.days} hari
              </Chip>
            )}
            <Chip>
              {card.attachTo === "customer" ? "Melekat ke pelanggan (semua hewan)" : "Melekat ke hewan"}
            </Chip>
            {card.variantKey && (
              <Chip>{variantKeyLabel(card.variantKey, (type, value) => label(type, value))}</Chip>
            )}
          </div>
          {card.cancelledAt && (
            <p className="mt-2 text-sm font-semibold text-danger-ink">
              Dibatalkan {formatDate(card.cancelledAt)}
              {card.cancelReason ? ` — ${card.cancelReason}` : ""}.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={`/dashboard/customers/${card.customerId}`}>
              <UserRound className="size-4" aria-hidden />
              Profil pelanggan
            </Link>
          </Button>
          {chat ? (
            <Button asChild variant="secondary" size="sm">
              <a href={chat} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4" aria-hidden />
                Hubungi
              </a>
            </Button>
          ) : card.customerPhone ? (
            <Button type="button" variant="secondary" size="sm" onClick={copyPhone}>
              Salin nomor
            </Button>
          ) : null}
          {card.status !== "cancelled" && (
            <Can feature="petMemberships" action="create">
              <Button size="sm" onClick={onRenew} disabled={renewing}>
                Perpanjang
              </Button>
            </Can>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────────────────────────────────────── sisa jatah */

/** "Basic Grooming (Gratis) · atau Full Grooming (Harga khusus)" — names from the catalogue. */
function useOptionText() {
  const { services, products } = useMembershipCatalog();
  const names = useCallback(
    (id: string) =>
      services.find((service) => service._id === id)?.name ??
      products.find((product) => product.id === id)?.name,
    [services, products],
  );

  const optionText = useCallback(
    (benefit: BenefitAvailability) => {
      if (!benefit.options.length) return null;
      return benefit.options
        .map((option) => `${scopeSummary(option.scope, names)} (${option.summary})`)
        .join(" · atau ");
    },
    [names],
  );

  return { optionText, names };
}

function SisaJatah({
  card,
  optionText,
}: {
  card: PetMembership;
  optionText: (benefit: BenefitAvailability) => string | null;
}) {
  const ended = card.status === "expired" || card.status === "cancelled";

  return (
    <Card
      title="Sisa jatah"
      description={
        ended
          ? "Sudah berakhir"
          : card.cycle
            ? `Periode ${formatDayRange(dayKey(card.cycle.start), dayKey(card.cycle.end))}`
            : undefined
      }
    >
      <JatahRows card={card} optionText={optionText} />
    </Card>
  );
}

/* ───────────────────────────────────────────────────────── ledger */

function Ledger({
  card,
  names,
  onMove,
}: {
  card: PetMembership;
  names: (id: string) => string | undefined;
  onMove: (row: MembershipRedemption) => void;
}) {
  const { can } = usePermissions();
  const manage = can("petMemberships", "manage");
  /* A reversal row (amount −1) is drawn on the row it reverses, not as a row of its own. */
  const rows = (card.redemptions ?? []).filter((row) => row.amount > 0);

  /* The server names the source line (`itemName`); older rows fall back to the option's scope. */
  const itemOf = (row: MembershipRedemption) => {
    if (row.itemName) return row.itemName;
    const benefit = benefitOfRow(card, row);
    const option = benefit?.options.find((entry) => entry.id === row.optionId) ?? benefit?.options[0];
    return option ? scopeSummary(option.scope, names) : (row.benefitLabel ?? "—");
  };

  return (
    <Card title="Riwayat pemakaian" description="Dari kasir, faktur, dan booking">
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Belum ada pemakaian.</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal pakai</TableHead>
                <TableHead>Transaksi</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Benefit</TableHead>
                <TableHead className="text-right">Potongan</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Aksi</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const reversed = Boolean(row.reversedAt);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      <span className={cn(reversed && "text-muted line-through")}>
                        {formatDate(row.usedAt)}
                      </span>
                      {row.originalUsedAt && (
                        <span className="block text-sm text-muted">
                          diubah · dari {formatDate(row.originalUsedAt)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.invoiceId ? (
                        <Link
                          href={`/dashboard/sales/invoice/${row.invoiceId}`}
                          className="font-medium tabular-nums underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          {row.documentNumber ?? REDEMPTION_CONTEXT_LABEL[row.context] ?? "Faktur"}
                        </Link>
                      ) : row.documentNumber ? (
                        <span className="font-medium tabular-nums">{row.documentNumber}</span>
                      ) : (
                        (REDEMPTION_CONTEXT_LABEL[row.context] ?? row.context)
                      )}
                      {row.documentNumber && (
                        <span className="block text-sm text-muted">
                          {REDEMPTION_CONTEXT_LABEL[row.context] ?? row.context}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={cn(reversed && "text-muted line-through")}>
                      {itemOf(row)}
                    </TableCell>
                    <TableCell>
                      <span className={cn(reversed && "text-muted line-through")}>
                        {row.benefitLabel ?? benefitOfRow(card, row)?.label ?? "—"}
                      </span>
                      {reversed && <ToneBadge tone="neutral" label="dikembalikan" className="ml-2" />}
                    </TableCell>
                    <TableCell
                      className={cn("text-right tabular-nums", reversed && "text-muted line-through")}
                    >
                      {formatRupiah(row.value)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {manage && canMoveRow(card, row) && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => onMove(row)}>
                          Ubah tanggal
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="mt-3 text-sm text-muted">
            Pemakaian tercatat otomatis dari transaksi. Untuk membatalkan pemakaian, void atau
            retur transaksinya — jatah kembali otomatis.
          </p>
        </>
      )}
    </Card>
  );
}

/* ───────────────────────────────────────────────────────── change log */

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${formatDate(date)} ${date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
}

function ChangeLog({ card }: { card: PetMembership }) {
  const rows = card.history ?? [];

  return (
    <Card title="Riwayat perubahan" description="Hanya bisa dibaca">
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Belum ada perubahan.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Oleh</TableHead>
              <TableHead>Perubahan</TableHead>
              <TableHead>Alasan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap tabular-nums">{formatStamp(entry.at)}</TableCell>
                <TableCell>{entry.byName ?? "Sistem"}</TableCell>
                <TableCell>
                  <ToneBadge tone="brand" label={HISTORY_ACTION_LABEL[entry.action] ?? entry.action} />
                  <span className="mt-1 block text-sm">{entry.summary}</span>
                </TableCell>
                <TableCell>
                  {entry.reason ?? "—"}
                  {entry.note && <span className="block text-sm text-muted">{entry.note}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

/* ───────────────────────────────────────────────────────── kelola panel */

interface KelolaRowSpec {
  type: KelolaType;
  title: string;
  description: string;
  disabled: string | null;
  danger?: boolean;
}

/** Which Kelola rows this card offers, and why any of them is switched off. */
export function kelolaRows(
  card: PetMembership,
  grants: { manage: boolean; cancel: boolean },
): KelolaRowSpec[] {
  const cancelled = card.status === "cancelled";
  const expired = card.status === "expired";
  const noGrant = "Butuh izin kelola membership.";
  const gate = (allowedWhenExpired: boolean): string | null => {
    if (cancelled) return "Membership sudah dibatalkan.";
    if (expired && !allowedWhenExpired) return "Membership sudah berakhir.";
    if (!grants.manage) return noGrant;
    return null;
  };

  const rows: KelolaRowSpec[] = [
    { type: "adjust-dates", ...KELOLA_ACTIONS["adjust-dates"], disabled: gate(true) },
    { type: "pause", ...KELOLA_ACTIONS.pause, disabled: gate(false) },
    { type: "adjust-quota", ...KELOLA_ACTIONS["adjust-quota"], disabled: gate(false) },
  ];
  if (card.attachTo === "pet") {
    rows.push({ type: "transfer", ...KELOLA_ACTIONS.transfer, disabled: gate(false) });
  }
  rows.push({
    type: "cancel",
    ...KELOLA_CANCEL,
    danger: true,
    disabled: cancelled
      ? "Membership sudah dibatalkan."
      : grants.cancel
        ? null
        : "Butuh izin batalkan membership.",
  });
  return rows;
}

function KelolaPanel({
  card,
  onOpen,
}: {
  card: PetMembership;
  onOpen: (type: KelolaType) => void;
}) {
  const { can } = usePermissions();
  const rows = kelolaRows(card, {
    manage: can("petMemberships", "manage"),
    cancel: can("petMemberships", "cancel"),
  });

  return (
    <Card
      title="Kelola keanggotaan"
      description="Semua perubahan wajib pakai alasan dan tercatat di riwayat perubahan."
    >
      <ul className="-mx-2 flex flex-col">
        {rows.map((row) => (
          <li key={row.type}>
            <button
              type="button"
              disabled={row.disabled !== null}
              onClick={() => onOpen(row.type)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border border-transparent px-2 py-3 text-left transition",
                "outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                "enabled:hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-sm font-semibold",
                    row.danger ? "text-danger-ink" : "text-foreground",
                  )}
                >
                  {row.title}
                </span>
                <span className="block text-sm text-muted">{row.disabled ?? row.description}</span>
                <span className="mt-0.5 block text-xs text-muted">{KELOLA_ROLES_TEXT}</span>
              </span>
              <ChevronRight className="mt-0.5 size-4 flex-none text-muted" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
