"use client";

import Link from "next/link";
import { CalendarClock, CalendarDays, Store, Ticket } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  Alert,
  Card,
  FilterPills,
  FilterSelect,
  InfoTooltip,
  ScopeCard,
  ScopeField,
  Spinner,
  StatTile,
  withAll,
} from "@/components";
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
import { cardHref, formatDate, formatRupiah } from "@/features/memberships/labels";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import type { AttentionCard } from "@/types/membership";
import { formatMoneyShort } from "@/utils/decimal";
import { whatsAppLink } from "@/utils/phone";

import {
  SUMMARY_PERIODS,
  usePromosiSummary,
  type SummaryPeriod,
} from "../hooks/usePromosiSummary";
import { PromosiModuleHeader } from "./PromosiModuleHeader";

/**
 * Promosi › Ringkasan — the membership version of the BO prototype's
 * `tabRingkasan` (16 October 2026).
 *
 *   1. Cabang + Periode — the scope row. ONE cabang, not several: the summary
 *      and attention endpoints take a single `branchId`, so the row wears the
 *      `ScopeCard` shell with a single-select rather than `ScopeFilterCard`'s
 *      multi-select (which would offer a choice the numbers cannot honour).
 *   2. Four StatTiles from GET /pet-memberships/summary, each with its ⓘ and a
 *      one-line basis ("dari 18 pelanggan · 22 hewan").
 *   3. "Perlu tindakan" from GET /pet-memberships/attention — the renewal call
 *      list (formerly the Perpanjangan tab) and allowances about to lapse.
 *   4. "Kinerja paket" from GET /reports/membership — which has no cabang.
 *
 * NOTHING HERE SENDS ANYTHING. "Tawarkan perpanjang" and "Ingatkan" open a
 * WhatsApp chat with a drafted line, or copy the number — the shop's own phone
 * is where the conversation happens.
 */

/** Rows shown per attention list before "Tampilkan semua". */
const PREVIEW_ROWS = 5;

export function PromosiSummaryScreen() {
  const { can } = usePermissions();
  const canCards = can("petMemberships", "read");
  const canReport = can("membershipReports", "read");

  const { branches } = useBranchOptions();
  const [branchId, setBranchId] = useState("");
  const [period, setPeriod] = useState<SummaryPeriod>("thisMonth");

  const { summary, attention, report } = usePromosiSummary({
    branchId,
    period,
    canCards,
    canReport,
  });

  const data = summary.data;
  const periodLabel = SUMMARY_PERIODS.find((option) => option.value === period)?.label ?? "";

  return (
    <div className="flex flex-col gap-6">
      <PromosiModuleHeader />

      <ScopeCard>
        <ScopeField icon={<Store className="size-4" />} label="Cabang">
          <FilterSelect
            layout="bar"
            label="Cabang"
            ariaLabel="Cabang"
            value={branchId}
            options={withAll(
              branches.map((branch) => ({ value: branch._id, label: branch.name })),
              "Semua cabang",
            )}
            onChange={setBranchId}
          />
        </ScopeField>
        <ScopeField icon={<CalendarDays className="size-4" />} label="Periode">
          <FilterPills
            ariaLabel="Periode"
            value={period}
            options={SUMMARY_PERIODS}
            onChange={setPeriod}
          />
        </ScopeField>
      </ScopeCard>

      {canCards && (
        <>
          {summary.error && <Alert variant="error">{summary.error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Penjualan paket"
              value={data ? formatMoneyShort(data.packagesSold.revenue) : "—"}
              caption={data ? `${data.packagesSold.count} paket terjual` : undefined}
              hint={`Nilai paket membership yang terjual ${periodLabel.toLowerCase()}, diakui sebagai pendapatan saat terjual. Paket yang dibatalkan tidak dihitung.`}
              loading={summary.loading && !data}
              error={Boolean(summary.error)}
            />
            <StatTile
              label="Nilai benefit terpakai"
              value={data ? formatMoneyShort(data.benefitValue.amount) : "—"}
              caption={
                data
                  ? `dari ${data.benefitValue.customers} pelanggan · ${data.benefitValue.pets} hewan`
                  : undefined
              }
              hint={
                data
                  ? `Harga normal layanan yang dipakai lewat jatah membership (${data.benefitValue.uses} pemakaian), dicatat sebagai potongan. Pemakaian yang dibatalkan dikurangkan. Ini biaya membership yang sebenarnya.`
                  : "Harga normal layanan yang dipakai lewat jatah membership, dicatat sebagai potongan. Ini biaya membership yang sebenarnya."
              }
              loading={summary.loading && !data}
              error={Boolean(summary.error)}
            />
            <StatTile
              label="Anggota aktif"
              value={data ? String(data.activeMembers.count) : "—"}
              caption={
                data
                  ? `dari ${data.activeMembers.customers} pelanggan · ${data.activeMembers.pets} hewan`
                  : undefined
              }
              hint="Membership yang berlaku saat ini (termasuk yang sedang ditunda), lintas paket. Tidak mengikuti periode. Membership yang melekat ke pelanggan dihitung sekali per pelanggan."
              loading={summary.loading && !data}
              error={Boolean(summary.error)}
            />
            <StatTile
              label="Perpanjangan"
              value={data ? String(data.packagesSold.renewals) : "—"}
              caption={
                data
                  ? data.packagesSold.count
                    ? `${Math.round((data.packagesSold.renewals / data.packagesSold.count) * 100)}% dari paket terjual`
                    : "belum ada paket terjual"
                  : undefined
              }
              hint={`Paket terjual ${periodLabel.toLowerCase()} yang merupakan perpanjangan membership sebelumnya. Makin tinggi, makin banyak anggota yang merasa paketnya bernilai.`}
              loading={summary.loading && !data}
              error={Boolean(summary.error)}
            />
          </div>

          <AttentionPanel
            loading={attention.loading && !attention.data}
            error={attention.error}
            expiring={attention.data?.expiring ?? []}
            unused={attention.data?.unusedQuota ?? []}
          />
        </>
      )}

      {canReport && (
        <Card
          title="Kinerja paket"
          description={`${periodLabel}${branchId ? " · semua cabang (laporan ini belum bisa dipilah per cabang)" : ""}`}
        >
          {report.error ? (
            <Alert variant="error">{report.error}</Alert>
          ) : report.loading && !report.data ? (
            <div className="flex justify-center py-8">
              <Spinner size={24} />
            </div>
          ) : !report.data?.plans.length ? (
            <p className="py-6 text-center text-sm text-muted">
              Belum ada paket terjual di periode ini.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paket</TableHead>
                    <TableHead className="text-right">Terjual</TableHead>
                    <TableHead className="text-right">Penjualan</TableHead>
                    <TableHead className="text-right">Jatah dipakai</TableHead>
                    <TableHead className="text-right">Nilai benefit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.data.plans.map((row) => (
                    <TableRow key={row.planId}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.cards}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(row.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.benefitsUsed}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(row.benefitValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────── Perlu tindakan */

function holderName(card: AttentionCard): string {
  return card.petName
    ? `${card.petName} · ${card.customerName ?? "Pelanggan"}`
    : (card.customerName ?? "Pelanggan");
}

/** `wa.me` with a drafted line — the one place copy is written for the owner. */
function whatsAppWith(phone: string | null, text: string): string | null {
  const link = whatsAppLink(phone);
  return link ? `${link}?text=${encodeURIComponent(text)}` : null;
}

async function copyPhone(phone: string) {
  try {
    await navigator.clipboard.writeText(phone);
    swalToast("Nomor disalin.", "success");
  } catch {
    swalToast("Gagal menyalin nomor.", "error");
  }
}

function AttentionPanel({
  loading,
  error,
  expiring,
  unused,
}: {
  loading: boolean;
  error: string | null;
  expiring: AttentionCard[];
  unused: {
    card: AttentionCard;
    benefit: { id: string; label: string };
    used: number;
    /** Booking holds in the bucket — already off `remaining`. */
    reserved?: number;
    cap: number;
    remaining: number;
    periodEnd: string;
    daysLeft: number;
  }[];
}) {
  return (
    <Card title="Perlu tindakan" description="Mengikuti cabang di atas · 14 hari ke depan.">
      {error ? (
        <Alert variant="error">{error}</Alert>
      ) : loading ? (
        <div className="flex justify-center py-8">
          <Spinner size={24} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <AttentionList
            icon={<CalendarClock className="size-4" aria-hidden />}
            title="Membership berakhir ≤14 hari"
            hint="Waktu paling tepat menawarkan perpanjangan (paket dengan syarat pembeli Perpanjangan)."
            empty="Tidak ada membership yang segera berakhir."
            rows={expiring.map((card) => ({
              key: card.id,
              href: cardHref(card.id),
              name: holderName(card),
              detail: `${card.planName ?? "Membership"} · berakhir ${formatDate(card.endDate)} · ${card.daysLeft} hari lagi`,
              phone: card.customerPhone,
              actionLabel: "Tawarkan perpanjang",
              message: `Halo Kak ${card.customerName ?? ""}, membership ${card.planName ?? ""}${card.petName ? ` untuk ${card.petName}` : ""} berakhir ${formatDate(card.endDate)}. Mau sekalian diperpanjang?`,
            }))}
          />
          <AttentionList
            icon={<Ticket className="size-4" aria-hidden />}
            title="Jatah belum terpakai, periode hampir habis"
            hint="Jatah per bulan atau per minggu hangus di akhir periode. Mengingatkan pelanggan membuat mereka datang dan merasa paketnya bernilai."
            empty="Tidak ada jatah yang hampir hangus."
            rows={unused.map((row) => ({
              key: `${row.card.id}-${row.benefit.id}`,
              href: cardHref(row.card.id),
              name: holderName(row.card),
              detail: `${row.benefit.label} sisa ${row.remaining} dari ${row.cap}${row.reserved ? ` · ${row.reserved} dipesan` : ""} · hangus ${formatDate(row.periodEnd)} (${row.daysLeft} hari lagi)`,
              phone: row.card.customerPhone,
              actionLabel: "Ingatkan",
              message: `Halo Kak ${row.card.customerName ?? ""}, jatah ${row.benefit.label}${row.card.petName ? ` untuk ${row.card.petName}` : ""} masih ${row.remaining}× dan berlaku sampai ${formatDate(row.periodEnd)}. Mau dijadwalkan?`,
            }))}
          />
        </div>
      )}
    </Card>
  );
}

interface AttentionRow {
  key: string;
  href: string;
  name: string;
  detail: string;
  phone: string | null;
  actionLabel: string;
  message: string;
}

function AttentionList({
  icon,
  title,
  hint,
  empty,
  rows,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  empty: string;
  rows: AttentionRow[];
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, PREVIEW_ROWS);

  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-primary">{icon}</span>
        {title}
        <InfoTooltip hint={hint} />
        <span className="ml-auto rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-muted tabular-nums">
          {rows.length}
        </span>
      </h3>

      {rows.length === 0 ? (
        <p className="py-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {shown.map((row) => {
            const wa = whatsAppWith(row.phone, row.message);
            return (
              <li key={row.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link
                    href={row.href}
                    className="text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {row.name}
                  </Link>
                  <p className="text-sm text-muted tabular-nums">{row.detail}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.phone && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => copyPhone(row.phone!)}>
                      Salin nomor
                    </Button>
                  )}
                  {wa ? (
                    <Button asChild variant="secondary" size="sm">
                      <a href={wa} target="_blank" rel="noopener noreferrer">
                        {row.actionLabel}
                      </a>
                    </Button>
                  ) : (
                    <span className="text-sm text-muted">Nomor belum ada</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > PREVIEW_ROWS && (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setAll(!all)}>
          {all ? "Tampilkan lebih sedikit" : `Tampilkan semua (${rows.length})`}
        </Button>
      )}
    </section>
  );
}
