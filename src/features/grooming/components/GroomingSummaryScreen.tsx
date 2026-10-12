"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PawPrint, Plus } from "lucide-react";

import {
  ActionGroup,
  Alert,
  FilterSelect,
  StatTile,
  formatRangeShort,
} from "@/components";
import { Button } from "@/components/ui/button";
import { changePct, previousPeriod } from "@/features/accounting/financeSummary";
import { Can } from "@/features/permissions";
import {
  divideRound,
  formatMoney,
  sumDecimals,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";

import {
  dayOf,
  formatMoneyShort,
  periodRange,
  PERIOD_WORDS,
  type DateRange,
  type GroomingPeriod,
  type GroomingScope,
} from "../board";
import { useFirstVisits } from "../hooks/useFirstVisits";
import {
  UTILISATION_MAX_DAYS,
  useGroomerUtilisation,
} from "../hooks/useGroomerUtilisation";
import { MAX_BOOKING_PAGES } from "../hooks/useGroomingBoard";
import { useGroomingCatalog } from "../hooks/useGroomingCatalog";
import { useGroomingRows } from "../hooks/useGroomingRows";
import { GROOMING_LINE } from "../line";
import { GROOMING_NEW_BOOKING_PATH } from "../paths";
import {
  DEFAULT_DORMANT_DAYS,
  DORMANT_CHOICES,
  REBOOK_DAYS,
  dormantCustomers,
  historyRange,
  newPets,
  rebookRate,
} from "../summary";
import { GroomingModuleHeader } from "./GroomingModuleHeader";
import { GroomingPeriodBar } from "./GroomingPeriodBar";

/** Rows each worklist shows before saying how many more there are. */
const LIST_ROWS = 8;

/** "↗ 22% vs periode sebelumnya" — or null when there is no before. */
function delta(pct: number | null): string | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  const arrow = pct > 0.5 ? "↗" : pct < -0.5 ? "↘" : "→";
  return `${arrow} ${Math.abs(pct).toLocaleString("id-ID", {
    maximumFractionDigits: 1,
  })}% vs periode sebelumnya`;
}

const hours = (minutes: number) =>
  `${Math.round(minutes / 60).toLocaleString("id-ID")} jam`;

/**
 * Layanan › Grooming › Ringkasan — how grooming did over the period, from
 * `buloo-navigation-v3` (`groomingRingkasan`): six figures and two worklists.
 *
 * PERFORMANCE, NOT TODAY. "Belum ditagih" and "sedang dikerjakan" stay on the
 * Booking tab and are not repeated here, as the mockup decides.
 *
 * ─── WHAT EACH FIGURE IS READ FROM ─────────────────────────────────────────
 *
 * The period's grooming rows (the Booking tab's own read): jumlah booking,
 * pendapatan, rupiah per booking, add-on. The period before it: the delta. One
 * longer HISTORY read (`summary.ts`): rebook rate, pelanggan belum kembali and
 * hewan baru — questions whose answer lies outside the period. And
 * `GET /bookings/capacity`, per day: utilisasi.
 *
 * NET IS EACH BOOKING'S OWN DISCOUNTED PRICE, not the mockup's flat average
 * discount — a booking knows what it will be billed.
 */
export function GroomingSummaryScreen() {
  const catalog = useGroomingCatalog(GROOMING_LINE.serviceKind);
  const scope = useMemo<GroomingScope | null>(() => {
    if (catalog.loading) return null;
    return {
      serviceIds: new Set(catalog.services.map((service) => service._id)),
      lineName: GROOMING_LINE.fallbackName,
    };
  }, [catalog.loading, catalog.services]);

  const [now] = useState(() => new Date());
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [period, setPeriod] = useState<GroomingPeriod>("month");
  const [custom, setCustom] = useState<DateRange>({ from: "", to: "" });
  const [dormantDays, setDormantDays] = useState<number>(DEFAULT_DORMANT_DAYS);

  const range = useMemo(
    () => (period === "custom" ? custom : periodRange(period)),
    [period, custom],
  );
  const before = useMemo(() => {
    const prior = previousPeriod(range.from, range.to);
    return prior ? { from: prior.dateFrom, to: prior.dateTo } : null;
  }, [range]);
  const history = useMemo(() => historyRange(now), [now]);

  const current = useGroomingRows(scope, branchIds, range);
  const previous = useGroomingRows(scope, branchIds, before);
  const past = useGroomingRows(scope, branchIds, history);
  const firstVisits = useFirstVisits(scope, branchIds, range);
  const utilisation = useGroomerUtilisation(range, now);

  const periodWords =
    period === "custom"
      ? formatRangeShort(custom.from, custom.to)
      : PERIOD_WORDS[period];

  /* ---- the period ---- */
  const figures = useMemo(() => {
    const live = current.rows.filter((r) => r.booking.status !== "cancelled");
    const gross = sumDecimals(live.map((r) => r.value));
    const net = sumDecimals(live.map((r) => r.net));
    const withAddon = live.filter((r) => r.addons.length > 0).length;
    return {
      count: live.length,
      gross,
      net,
      perBooking: live.length
        ? toDecimalString(divideRound(toMinor(gross) ?? 0n, BigInt(live.length)))
        : null,
      withAddon,
      addonRate: live.length ? Math.round((withAddon / live.length) * 100) : null,
    };
  }, [current.rows]);

  const prior = useMemo(() => {
    if (!before || previous.loading || previous.failed) return null;
    const live = previous.rows.filter((r) => r.booking.status !== "cancelled");
    return { count: live.length, net: sumDecimals(live.map((r) => r.net)) };
  }, [before, previous.loading, previous.failed, previous.rows]);

  /* ---- history ---- */
  const rebook = useMemo(() => rebookRate(past.rows, now), [past.rows, now]);
  const dormant = useMemo(
    () => dormantCustomers(past.rows, dormantDays, now),
    [past.rows, dormantDays, now],
  );
  const pets = useMemo(
    () =>
      firstVisits.firstAtByPet
        ? newPets(
            current.rows,
            past.rows,
            firstVisits.firstAtByPet,
            history.from,
            range.to,
          )
        : [],
    [current.rows, past.rows, firstVisits.firstAtByPet, history.from, range.to],
  );

  const scopeCount =
    (branchIds.length > 0 ? 1 : 0) + (period !== "month" ? 1 : 0);

  const periodState = {
    loading: current.loading,
    error: current.failed,
  };

  return (
    <div className="flex flex-col gap-6">
      <GroomingModuleHeader
        action={
          <Can feature="bookings" action="create">
            <Button asChild>
              <Link href={GROOMING_NEW_BOOKING_PATH}>
                <Plus className="size-4" />
                Booking baru
              </Link>
            </Button>
          </Can>
        }
      />

      <GroomingPeriodBar
        branchIds={branchIds}
        onBranchesChange={setBranchIds}
        period={period}
        customRange={custom}
        onPeriodChange={setPeriod}
        onCustomRange={(next) => {
          if (!next.from && !next.to) {
            setPeriod("month");
          } else {
            setCustom(next);
            setPeriod("custom");
          }
        }}
        trailing={
          scopeCount > 0 ? (
            <Button
              type="button"
              variant="link"
              className="min-h-11 px-0"
              onClick={() => {
                setBranchIds([]);
                setPeriod("month");
              }}
            >
              Reset filter ({scopeCount})
            </Button>
          ) : undefined
        }
      />

      {current.failed && (
        <Alert variant="error">
          Booking grooming tidak bisa dimuat. Coba muat ulang halaman.
        </Alert>
      )}
      {(current.truncated || past.truncated) && (
        <Alert variant="warning">
          Ada lebih dari {MAX_BOOKING_PAGES * 100} booking dalam rentang yang
          dibaca, jadi sebagian angka hanya dari sebagian booking. Persempit
          cabang atau periodenya supaya lengkap.
        </Alert>
      )}

      <section
        aria-label="Kinerja grooming"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <StatTile
          label="Jumlah booking"
          value={figures.count.toLocaleString("id-ID")}
          caption={
            (prior && delta(changePct(String(figures.count), String(prior.count)))) ||
            `booking grooming ${periodWords}`
          }
          hint="Seluruh booking Grooming pada cabang dan periode yang dipilih, termasuk yang belum ditagih. Booking yang dibatalkan tidak dihitung."
          {...periodState}
        />
        <StatTile
          label="Pendapatan (net)"
          value={formatMoneyShort(figures.net)}
          caption={
            (prior && delta(changePct(figures.net, prior.net))) ||
            `Gross ${formatMoneyShort(figures.gross)} sebelum diskon`
          }
          hint={`Nilai booking setelah diskon masing-masing booking (membership, potongan). Gross-nya ${formatMoney(figures.gross)} sebelum diskon. Belum dikurangi HPP atau biaya operasional.`}
          {...periodState}
        />
        <StatTile
          label="Rupiah per booking"
          value={figures.perBooking ? formatMoney(figures.perBooking) : "—"}
          caption="Gross ÷ jumlah booking, sebelum diskon"
          hint="Nilai booking rata-rata. Turun bisa berarti makin banyak booking dasar tanpa add-on, atau makin banyak hewan kecil yang tarifnya lebih murah."
          {...periodState}
        />

        <StatTile
          label={`Rebook rate (${REBOOK_DAYS} hari)`}
          value={rebook.percent === null ? "—" : `${rebook.percent}%`}
          caption={`${rebook.rebooked} dari ${rebook.animals} hewan booking lagi dalam ${REBOOK_DAYS} hari`}
          hint={`Dari hewan yang di-grooming 30–60 hari lalu, berapa yang booking Grooming lagi dalam ${REBOOK_DAYS} hari sejak kunjungan terakhirnya. Sengaja tidak ikut Periode di atas, supaya bisa dibandingkan dari waktu ke waktu. Ikut filter cabang.`}
          loading={past.loading}
          error={past.failed}
        />
        <StatTile
          label="Utilisasi groomer"
          value={
            utilisation.value?.percent != null
              ? `${utilisation.value.percent}%`
              : "—"
          }
          caption={
            !utilisation.available
              ? `Pilih periode ≤ ${UTILISATION_MAX_DAYS} hari`
              : utilisation.value
                ? `${utilisation.value.groomers} dari ${utilisation.value.allGroomers} groomer aktif · ${hours(utilisation.value.usedMin)} dari ${hours(utilisation.value.capacityMin)}`
                : "dari kapasitas groomer"
          }
          hint="Menit booking dibagi kapasitas groomer yang bertugas (Pengaturan › Kapasitas), dijumlah per hari dari awal periode sampai hari ini. Groomer yang libur tidak dihitung. Kapasitas tidak dipisah per cabang."
          loading={utilisation.loading}
          error={utilisation.failed}
        />
        <StatTile
          label="Add-on attach rate"
          value={figures.addonRate === null ? "—" : `${figures.addonRate}%`}
          caption={`${figures.withAddon} dari ${figures.count} booking pakai minimal 1 add-on`}
          hint="Persentase booking yang menambah minimal satu add-on di luar layanan utama — indikator upsell di meja groomer."
          {...periodState}
        />
      </section>

      <ActionGroup
        icon={PawPrint}
        tone="warn"
        title="Pelanggan grooming belum kembali ≥"
        control={
          <FilterSelect
            label="Belum kembali"
            ariaLabel="Batas hari belum kembali"
            layout="bar"
            active={false}
            value={dormantDays}
            options={DORMANT_CHOICES.map((days) => ({
              value: days,
              label: `${days} hari`,
            }))}
            onChange={setDormantDays}
          />
        }
        count={dormant.length}
        loading={past.loading}
        failed={past.failed}
        empty={`Tidak ada pelanggan grooming yang tertinggal ≥${dormantDays} hari.`}
        rows={dormant.slice(0, LIST_ROWS).map((customer) => ({
          key: customer.customerId,
          title: customer.name,
          detail: (
            <span className="tabular-nums">
              Terakhir grooming {dayOf(customer.lastAt)} · {customer.days} hari
              lalu
            </span>
          ),
          action: {
            label: "Hubungi",
            href: `/dashboard/master/customers/${customer.customerId}`,
          },
        }))}
        more={
          dormant.length > LIST_ROWS
            ? {
                label: `+${dormant.length - LIST_ROWS} pelanggan lagi`,
                href: "/dashboard/master/customers/dormant",
              }
            : undefined
        }
      />

      <ActionGroup
        icon={PawPrint}
        title="Hewan baru di Grooming (kunjungan ke-1 atau ke-2)"
        count={pets.length}
        loading={current.loading || past.loading || firstVisits.loading}
        failed={current.failed || past.failed || firstVisits.failed}
        empty={`Tidak ada hewan baru di Grooming ${periodWords}.`}
        rows={pets.slice(0, LIST_ROWS).map((pet) => ({
          key: pet.petId,
          title: `${pet.petName} · ${pet.customerName}`,
          detail: `Kunjungan grooming ke-${pet.visit}`,
          action: {
            label: "Lihat hewan",
            href: `/dashboard/master/pets/${pet.petId}`,
          },
        }))}
        more={
          pets.length > LIST_ROWS
            ? {
                label: `+${pets.length - LIST_ROWS} hewan lagi`,
                href: "/dashboard/master/pets",
              }
            : undefined
        }
      />

      <div className="rounded-xl border border-border border-l-4 border-l-primary bg-surface px-4 py-3">
        <p className="font-bold text-foreground">
          Khusus performa Grooming, bukan status hari ini
        </p>
        <p className="mt-0.5 text-sm text-muted">
          Untuk yang sedang terjadi sekarang — belum ditagih, sedang dikerjakan
          — lihat tab Booking. Rebook rate sengaja memakai jendela tetap{" "}
          {REBOOK_DAYS} hari dan tidak ikut Periode. Daftar pelanggan dan hewan
          di atas dihitung dari booking setahun terakhir.
        </p>
      </div>
    </div>
  );
}
