"use client";

import Link from "next/link";
import {
  BellRing,
  CalendarDays,
  CircleCheck,
  Clock,
  CreditCard,
  Gift,
  Store,
  Tag,
} from "lucide-react";
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
import { promoEditHref } from "@/features/promos/labels";
import { swalToast } from "@/lib/swal";
import type { AttentionCard } from "@/types/membership";
import type { PromoAttentionItem, PromoReportRow } from "@/types/promo";
import { whatsAppLink } from "@/utils/phone";

import {
  SUMMARY_PERIODS,
  usePromosiSummary,
  type SummaryPeriod,
} from "../hooks/usePromosiSummary";
import { PromosiModuleHeader } from "./PromosiModuleHeader";
import { UnrecognizedBalanceCard } from "./UnrecognizedBalanceCard";

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
 * PROMO (Promo V1, 8 November 2026), for a role with `promos:read`: a
 * "Potongan promo" tile and a "Promo berjalan" table from GET /promos/report
 * (cabang + periode), and "Promo berakhir ≤14 hari" from GET /promos/attention
 * in Perlu tindakan, each with an Ubah link to push the end date out.
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
  const canPromos = can("promos", "read");

  const { branches } = useBranchOptions();
  const [branchId, setBranchId] = useState("");
  const [period, setPeriod] = useState<SummaryPeriod>("thisMonth");

  const { summary, attention, report, promoReport, promoAttention } = usePromosiSummary({
    branchId,
    period,
    canCards,
    canReport,
    canPromos,
  });
  const promoTotals = promoReport.data?.totals;
  const runningPromos = (promoReport.data?.promos ?? []).filter((row) => row.status === "running");

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

      {(canCards || canPromos) && (
        <>
          {canCards && summary.error && <Alert variant="error">{summary.error}</Alert>}

          <div
            className={
              canCards && canPromos
                ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
                : "grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            }
          >
            {canCards && (
              <>
                <StatTile
                  label="Penjualan paket"
                  value={data ? formatRupiah(data.packagesSold.revenue) : "—"}
                  caption={data ? `${data.packagesSold.count} paket terjual` : undefined}
                  hint={`Nilai paket membership yang terjual ${periodLabel.toLowerCase()}. Paket yang diterima di muka baru jadi pendapatan bertahap, lihat Saldo membership belum diakui. Paket yang dibatalkan tidak dihitung.`}
                  loading={summary.loading && !data}
                  error={Boolean(summary.error)}
                />
                <StatTile
                  label="Nilai benefit terpakai"
                  value={data ? formatRupiah(data.benefitValue.amount) : "—"}
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
              </>
            )}
            {canPromos && (
              <StatTile
                label="Potongan promo"
                value={promoTotals ? formatRupiah(promoTotals.discount) : "—"}
                caption={promoTotals ? `${promoTotals.transactions} transaksi` : undefined}
                hint={`Total potongan harga coret yang dipakai di kasir dan faktur ${periodLabel.toLowerCase()}. Void dan retur dikurangkan. Di jurnal, potongan ini ikut Diskon Penjualan.`}
                loading={promoReport.loading && !promoReport.data}
                error={Boolean(promoReport.error)}
              />
            )}
          </div>

          {canCards && <UnrecognizedBalanceCard branchId={branchId} />}

          <AttentionPanel
            membership={canCards}
            loading={attention.loading && !attention.data}
            error={attention.error}
            expiring={attention.data?.expiring ?? []}
            unused={attention.data?.unusedQuota ?? []}
            promo={
              canPromos
                ? {
                    loading: promoAttention.loading && !promoAttention.data,
                    error: promoAttention.error,
                    rows: promoAttention.data ?? [],
                  }
                : null
            }
          />
        </>
      )}

      {(canReport || canPromos) && (
        <Card
          title={
            canReport && canPromos
              ? "Kinerja paket & promo"
              : canReport
                ? "Kinerja paket"
                : "Kinerja promo"
          }
          description={`${periodLabel}${canReport && branchId ? " · paket: semua cabang (laporan paket belum bisa dipilah per cabang)" : ""}`}
        >
          <div className="flex flex-col gap-6">
            {canReport &&
              (report.error ? (
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
                          <TableCell className="text-right tabular-nums">
                            {row.benefitsUsed}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatRupiah(row.benefitValue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            {canPromos && (
              <RunningPromosTable
                loading={promoReport.loading && !promoReport.data}
                error={promoReport.error}
                rows={runningPromos}
              />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

/** Promo berjalan — transaksi and potongan per running promo, in the Kinerja card. */
function RunningPromosTable({
  loading,
  error,
  rows,
}: {
  loading: boolean;
  error: string | null;
  rows: PromoReportRow[];
}) {
  return (
    <section aria-label="Promo berjalan" className="flex flex-col gap-2">
      <h3 className="text-base font-bold">Promo berjalan</h3>
      {error ? (
        <Alert variant="error">{error}</Alert>
      ) : loading ? (
        <div className="flex justify-center py-6">
          <Spinner size={24} />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">Tidak ada promo yang sedang berjalan.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Promo</TableHead>
                <TableHead className="text-right">Transaksi</TableHead>
                <TableHead className="text-right">Potongan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <span className="block font-medium">{row.name}</span>
                    <span className="block text-sm text-muted tabular-nums">{row.code}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.transactions}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRupiah(row.discount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
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
  membership,
  loading,
  error,
  expiring,
  unused,
  promo,
}: {
  /** The membership lists — only for a role that may read cards. */
  membership: boolean;
  /** "Promo berakhir ≤14 hari" — null for a role without `promos:read`. */
  promo: {
    loading: boolean;
    error: string | null;
    rows: PromoAttentionItem[];
  } | null;
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
    <Card
      title={
        <span className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-tint-danger text-danger">
            <BellRing className="size-4" aria-hidden />
          </span>
          Perlu tindakan
        </span>
      }
      action={<span className="text-sm text-muted">Ikut cabang di atas</span>}
    >
      <div className="flex flex-col gap-4">
        {membership &&
          (error ? (
            <Alert variant="error">{error}</Alert>
          ) : loading ? (
            <div className="flex justify-center py-8">
              <Spinner size={24} />
            </div>
          ) : (
            <>
              <AttentionList
                tone="warning"
                icon={<Clock className="size-4" aria-hidden />}
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
                icon={<CreditCard className="size-4" aria-hidden />}
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
              {/*
            Not in V1 (BO, 15 October 2026: membership first). Drawn now so the
            panel already has the shape the prototype shows, and says plainly
            that these lists arrive with kartu stempel and promo.
          */}
              <ComingSoonList
                icon={<CircleCheck className="size-4" aria-hidden />}
                title="Kartu stempel kurang 1 lagi"
                note="Muncul setelah fitur kartu stempel tersedia."
              />
              <ComingSoonList
                icon={<Gift className="size-4" aria-hidden />}
                title="Reward stempel belum dipakai"
                note="Muncul setelah fitur kartu stempel tersedia."
              />
            </>
          ))}
        {promo && <PromoEndingList {...promo} />}
      </div>
    </Card>
  );
}

/**
 * Promo berakhir ≤14 hari — running promos about to end. "Ubah" opens the
 * promo's form, where the end date can be pushed out (Perpanjang).
 */
function PromoEndingList({
  loading,
  error,
  rows,
}: {
  loading: boolean;
  error: string | null;
  rows: PromoAttentionItem[];
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, PREVIEW_ROWS);
  const title = "Promo berakhir ≤14 hari";

  return (
    <AttentionBox
      label={title}
      header={
        <>
          <Tag className="size-4" aria-hidden />
          {title}
          <InfoTooltip hint="Promo yang sedang berjalan dan tanggal selesainya tinggal 14 hari atau kurang. Perpanjang lewat Ubah kalau promonya masih ingin dijalankan." />
          <CountBadge>{rows.length}</CountBadge>
        </>
      }
    >
      {error ? (
        <div className="py-3">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-6">
          <Spinner size={24} />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-3 text-sm text-muted">Tidak ada promo yang segera berakhir.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {shown.map((promo) => (
            <li key={promo.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">{promo.name}</p>
                <p className="text-sm text-muted tabular-nums">
                  {promo.code} · berakhir {formatDate(promo.restrictions.endDate)} ·{" "}
                  {promo.daysLeft <= 0 ? "hari ini" : `${promo.daysLeft} hari lagi`}
                </p>
              </div>
              <Link
                href={promoEditHref(promo.id)}
                className="shrink-0 text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Ubah
              </Link>
            </li>
          ))}
        </ul>
      )}

      {rows.length > PREVIEW_ROWS && (
        <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => setAll(!all)}>
          {all ? "Tampilkan lebih sedikit" : `Tampilkan semua (${rows.length})`}
        </Button>
      )}
    </AttentionBox>
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

/** The bordered box every list in the panel sits in; warning tint for the urgent one. */
function AttentionBox({
  tone,
  label,
  header,
  children,
}: {
  tone?: "warning";
  label: string;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className={
        tone === "warning"
          ? "rounded-xl border border-warning/40 bg-tint-warning/50 px-4 py-3"
          : "rounded-xl border border-border bg-surface px-4 py-3"
      }
    >
      <h3 className="flex items-center gap-2 border-b border-border pb-3 text-base font-bold">
        {header}
      </h3>
      {children}
    </section>
  );
}

function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto inline-flex min-w-7 items-center justify-center rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-semibold tabular-nums">
      {children}
    </span>
  );
}

function AttentionList({
  tone,
  icon,
  title,
  hint,
  empty,
  rows,
}: {
  tone?: "warning";
  icon: ReactNode;
  title: string;
  hint: string;
  empty: string;
  rows: AttentionRow[];
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, PREVIEW_ROWS);

  return (
    <AttentionBox
      tone={tone}
      label={title}
      header={
        <>
          {icon}
          {title}
          <InfoTooltip hint={hint} />
          <CountBadge>{rows.length}</CountBadge>
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {shown.map((row) => {
            const wa = whatsAppWith(row.phone, row.message);
            return (
              <li key={row.key} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link
                    href={row.href}
                    className="text-[15px] font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {row.name}
                  </Link>
                  <p className="text-sm text-muted tabular-nums">{row.detail}</p>
                </div>
                {wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-sm font-semibold text-warning underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {row.actionLabel}
                  </a>
                ) : row.phone ? (
                  <button
                    type="button"
                    onClick={() => copyPhone(row.phone!)}
                    className="shrink-0 cursor-pointer text-sm font-semibold text-warning underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    Salin nomor
                  </button>
                ) : (
                  <span className="shrink-0 text-sm text-muted">Nomor belum ada</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > PREVIEW_ROWS && (
        <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => setAll(!all)}>
          {all ? "Tampilkan lebih sedikit" : `Tampilkan semua (${rows.length})`}
        </Button>
      )}
    </AttentionBox>
  );
}

function ComingSoonList({ icon, title, note }: { icon: ReactNode; title: string; note: string }) {
  return (
    <AttentionBox
      label={title}
      header={
        <>
          <span className="text-muted">{icon}</span>
          <span className="text-muted">{title}</span>
          <span className="ml-auto rounded-full bg-tint-warning px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
            Segera
          </span>
        </>
      }
    >
      <p className="py-3 text-sm text-muted">{note}</p>
    </AttentionBox>
  );
}
