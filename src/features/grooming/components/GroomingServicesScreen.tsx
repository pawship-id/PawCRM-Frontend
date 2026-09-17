"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw } from "lucide-react";

import { Alert, Card, HighlightText, Pagination, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can, usePermissions } from "@/features/permissions";
import {
  formatDurationRange,
  serviceDurationBounds,
  ServiceLifecycleDialog,
  type ServiceLifecycleAction,
  useVariantAxisValues,
} from "@/features/services";
import { cn } from "@/lib/utils";

import { periodRange, type DateRange, type GroomingPeriod } from "../board";
import { useGroomingLine } from "../hooks/useGroomingLine";
import { useGroomingServices } from "../hooks/useGroomingServices";
import { useGroomingServiceTotals } from "../hooks/useGroomingServiceTotals";
import { useServiceBookingCounts } from "../hooks/useServiceBookingCounts";
import { groomingServicePath } from "../paths";
import {
  axesLabel,
  PLACE_SHORT,
  placeOf,
  priceRangeShort,
  statusOf,
  variantCounts,
} from "../serviceDisplay";
import { GroomingModuleHeader } from "./GroomingModuleHeader";
import { GroomingPeriodBar } from "./GroomingPeriodBar";
import {
  countServiceFilters,
  EMPTY_SERVICE_FILTERS,
  GroomingServicesToolbar,
} from "./GroomingServicesToolbar";

/**
 * The service form for a MAIN service — Jenis layanan is not drawn and the save
 * files it as `main`. Add-ons are made from Pengaturan › Layanan › Add-on.
 */
const NEW_MAIN_SERVICE_PATH = "/dashboard/master/layanan/new?jenis=utama";

/**
 * Layanan › Grooming › Layanan & Harga — the Grooming line's services.
 *
 * ─── THE MOCKUP'S COLUMNS, AND A ROW OPENS THE SERVICE ─────────────────────
 *
 * Decided 13 September 2026, on request, replacing the same day's decision to
 * send a row straight to the form: Layanan · Tempat · Varian · Harga · Durasi ·
 * Tahapan · Status, as `buloo-grooming-v3.html` draws them, and a row opens the
 * service's detail page (`GroomingServiceDetailScreen`). The form is one Ubah
 * away from there.
 *
 * VARIAN AND DURASI READ THE VARIANTS (13 September 2026): each variant has its
 * own on/off and its own length, so Varian is the mockup's "8 / 8" — variants
 * on, out of variants stored — and Durasi is the range across the variants that
 * are on ("45–115 mnt"). Harga is likewise the range across the active ones.
 *
 * WHERE THE COLUMNS STILL SAY LESS THAN THE MOCKUP: "N booking" appears only for
 * a role with `bookings:read`, and Status has no Portal badge, since there is no
 * portal.
 *
 * ─── THE CARD: CABANG AND PERIODE ──────────────────────────────────────────
 *
 * The mockup's context card, drawn with the Booking tab's `GroomingPeriodBar`
 * so the two tabs read the same. What each control means HERE:
 *
 *  - Cabang narrows the LIST (services offered there) and the booking count. It
 *    is the same value as the panel's Cabang, so it counts in `Filter (n)` and
 *    "Reset filter" clears it — unlike the Booking tab, where Cabang changes
 *    only the numbers and stays out of the count.
 *  - Periode narrows ONLY what "N booking" counts. A service has no date; a
 *    period that hid services would hide the ones nobody booked this month,
 *    which are exactly the ones worth seeing. The panel's "Tanggal booking" is
 *    the same four pills and the same dates behind Custom, drafted until
 *    Terapkan.
 *
 * THE LINE UNDER THE SEARCH — "6 layanan · 6 aktif dari 6" — is what is listed,
 * then the line's whole catalogue whatever the filters say.
 *
 * ─── HAPUS LIVES ON THE DETAIL PAGE, PULIHKAN ON THE ROW ───────────────────
 *
 * The mockup's table has no action column, so deleting moved to the service's
 * own page. Restoring could not follow it there: `GET /services/:id` does not
 * return a deleted service, so a deleted row opens nothing and carries its
 * Pulihkan beside the "Terhapus" badge instead.
 */
export function GroomingServicesScreen() {
  const router = useRouter();
  const { can } = usePermissions();
  const line = useGroomingLine();
  const lineId = line.line?._id ?? null;
  const { services, pagination, query, setQuery, refetch, loading, error } =
    useGroomingServices(lineId);
  // Per row, over that row's own variants — see variantRows.
  const { valuesFor, axes: axisDefs } = useVariantAxisValues();
  /* The tenant's card names — "Ukuran × Lokasi", not only the pet's three. */
  const axisName = (key: string) => axisDefs.find((def) => def.key === key)?.name;

  const [period, setPeriod] = useState<GroomingPeriod>("month");
  const [custom, setCustom] = useState<DateRange>({ from: "", to: "" });
  const range = useMemo(
    () => (period === "custom" ? custom : periodRange(period)),
    [period, custom],
  );

  const usage = useServiceBookingCounts(
    services.map((service) => service._id),
    can("bookings", "read"),
    {
      branchId: query.branchId || undefined,
      scheduledFrom: range.from || undefined,
      scheduledTo: range.to || undefined,
    },
  );

  // Bumped after a delete or restore — the only things here that move a total.
  const [version, setVersion] = useState(0);
  const totals = useGroomingServiceTotals(lineId, version);
  const [pending, setPending] = useState<ServiceLifecycleAction | null>(null);

  const mayRestore = can("services", "restore");
  const filterCount = countServiceFilters(query);
  const narrowed = query.search.trim() !== "" || filterCount > 0;

  /** Custom's dates, from the card or the panel. */
  function pickCustomRange(next: DateRange) {
    // An emptied range — the date field's own Reset — goes back to the default.
    if (!next.from && !next.to) {
      setPeriod("month");
      return;
    }

    setCustom(next);
    setPeriod("custom");
  }

  const listed =
    lineId !== null && !line.loading && !error && !(loading && services.length === 0);

  return (
    <div className="flex flex-col gap-6">
      <GroomingModuleHeader
        action={
          <Can feature="services" action="create">
            <Button asChild>
              <Link href={NEW_MAIN_SERVICE_PATH}>
                <Plus className="size-4" />
                Layanan baru
              </Link>
            </Button>
          </Can>
        }
      />

      <Card className="py-3">
        <div className="flex flex-wrap items-center gap-3">
          <GroomingPeriodBar
            branchId={query.branchId}
            onBranchChange={(branchId) => setQuery({ branchId })}
            period={period}
            customRange={custom}
            onPeriodChange={setPeriod}
            onCustomRange={pickCustomRange}
          />
          {filterCount > 0 && (
            <Button
              type="button"
              variant="link"
              className="ml-auto min-h-11"
              onClick={() => setQuery(EMPTY_SERVICE_FILTERS)}
            >
              Reset filter ({filterCount})
            </Button>
          )}
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <GroomingServicesToolbar
          search={query.search}
          onSearch={(search) => setQuery({ search })}
          filters={query}
          period={period}
          customRange={custom}
          onApply={(filters, nextPeriod, nextCustom) => {
            setQuery(filters);
            if (nextPeriod === "custom") {
              pickCustomRange(nextCustom);
            } else {
              setPeriod(nextPeriod);
            }
          }}
          onReset={() => setQuery(EMPTY_SERVICE_FILTERS)}
        />

        {listed && (
          <p className="text-sm tabular-nums text-muted">
            {pagination.total} layanan
            {totals && ` · ${totals.active} aktif dari ${totals.all}`}
          </p>
        )}
      </div>

      {line.failed && (
        <Alert variant="error">
          Lini bisnis tidak bisa dimuat, jadi layanan grooming belum bisa
          dipisahkan. Coba muat ulang halaman.
        </Alert>
      )}
      {line.missing && (
        <Alert variant="warning">
          Belum ada lini bisnis bernama Grooming. Buat atau ganti nama lini
          bisnisnya di Keuangan › Ringkasan › Lini Bisnis, lalu pasang di
          layanannya.
        </Alert>
      )}
      {error && <Alert variant="error">{error}</Alert>}

      {line.loading || (loading && services.length === 0) ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat layanan grooming…
        </div>
      ) : lineId === null ? null : services.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
          {narrowed ? (
            "Tidak ada layanan grooming yang cocok dengan saringan ini."
          ) : (
            <>
              Belum ada layanan grooming.{" "}
              <Can feature="services" action="create">
                <Link
                  href={NEW_MAIN_SERVICE_PATH}
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Tambah yang pertama →
                </Link>
              </Can>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <Table className={cn("min-w-240", loading && "opacity-60")}>
              <TableHeader>
                <TableRow>
                  <TableHead>Layanan</TableHead>
                  <TableHead>Tempat</TableHead>
                  <TableHead>Varian</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                  <TableHead>Durasi</TableHead>
                  <TableHead>Tahapan</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {services.map((service) => {
                  const href = groomingServicePath(service._id);
                  const deleted = service.deletedAt !== null;
                  const place = placeOf(service.serviceLocations);
                  const counts = variantCounts(
                    service,
                    valuesFor(service.variants),
                  );
                  const duration = serviceDurationBounds(service);
                  const sessions = (service.sessions ?? []).length;
                  const status = statusOf(service);
                  const used = usage.counts?.[service._id];

                  return (
                    <TableRow
                      key={service._id}
                      className={cn(!deleted && "cursor-pointer")}
                      onClick={
                        deleted
                          ? undefined
                          : (event) => {
                              if ((event.target as HTMLElement).closest("a, button")) {
                                return;
                              }
                              router.push(href);
                            }
                      }
                    >
                      <TableCell className="whitespace-normal">
                        {deleted ? (
                          <span className="text-sm font-semibold text-foreground">
                            <HighlightText text={service.name} query={query.search} />
                          </span>
                        ) : (
                          <Link
                            href={href}
                            className="rounded text-sm font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          >
                            <HighlightText text={service.name} query={query.search} />
                          </Link>
                        )}
                        <span className="block text-xs tabular-nums text-muted">
                          <HighlightText text={service.code ?? ""} query={query.search} />
                          {service.serviceType === "addon" && " · add-on"}
                          {used !== undefined && ` · ${used} booking`}
                        </span>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "border-transparent",
                            place === "store"
                              ? "bg-tint-neutral text-muted"
                              : "bg-tint-info text-info",
                          )}
                        >
                          {PLACE_SHORT[place]}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        {service.hasVariants ? (
                          <>
                            <Badge
                              variant="outline"
                              className="border-transparent bg-tint-brand tabular-nums text-primary"
                            >
                              {counts.active} / {counts.total}
                              <span className="sr-only"> varian aktif</span>
                            </Badge>
                            <span className="mt-0.5 block text-xs text-muted">
                              {axesLabel(service, axisName)}
                            </span>
                          </>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-tint-neutral text-muted"
                          >
                            Tunggal
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-right text-sm font-semibold tabular-nums text-foreground">
                        {priceRangeShort(service)}
                      </TableCell>

                      <TableCell className="text-sm tabular-nums">
                        {duration === null ? (
                          <span className="font-semibold text-danger">
                            Belum diisi
                          </span>
                        ) : (
                          formatDurationRange(duration)
                        )}
                      </TableCell>

                      <TableCell className="text-sm tabular-nums">
                        {sessions ? (
                          `${sessions} tahap`
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn("border-transparent", status.className)}
                          >
                            {status.label}
                          </Badge>
                          {deleted && mayRestore && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setPending({ kind: "restore", service })
                              }
                            >
                              <RotateCcw className="size-4" />
                              Pulihkan
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="layanan"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}

      <ServiceLifecycleDialog
        action={pending}
        onCancel={() => setPending(null)}
        onDone={() => {
          setPending(null);
          refetch();
          setVersion((current) => current + 1);
        }}
      />
    </div>
  );
}
