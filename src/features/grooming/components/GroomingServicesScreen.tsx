"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw } from "lucide-react";

import {
  Alert,
  DataTable,
  HighlightText,
  Pagination,
  type DataTableColumn,
  type SortOptions,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can, usePermissions } from "@/features/permissions";
import {
  formatDurationRange,
  serviceDurationBounds,
  ServiceFormLink,
  ServiceLifecycleDialog,
  type ServiceLifecycleAction,
  useVariantAxisValues,
} from "@/features/services";
import { cn } from "@/lib/utils";
import type { Service, ServiceSort } from "@/types/api";

import { periodRange, type DateRange, type GroomingPeriod } from "../board";
import { useGroomingServices } from "../hooks/useGroomingServices";
import { useGroomingServiceTotals } from "../hooks/useGroomingServiceTotals";
import { useServiceBookingCounts } from "../hooks/useServiceBookingCounts";
import {
  GROOMING_LINE,
  lineFormOrigin,
  lineServicePath,
  NEW_MAIN_SERVICE_PATH,
  type ServiceLine,
} from "../line";
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
 * THE TABLE SORTS FROM THREE HEADERS (BO, 20 October 2026), on the server —
 * the list is paged — each mapped to the two SERVICE_SORTS names for it:
 *
 *   Layanan — the name, A first. `nameAsc` is also where the list opens: the
 *             menu order the catalogue always had.
 *   Harga   — the number the cell LEADS WITH: a flat service's price, or the
 *             cheapest ACTIVE variant of a range ("Rp 89 rb – Rp 249 rb" ranks
 *             at 89 rb). CHEAPEST FIRST on the first click: a price list is
 *             scanned from the cheap end.
 *   Durasi  — likewise the low end of the cell's range, SHORTEST FIRST.
 *
 * A service with no price or no length ("—", "Belum diisi") sorts LAST in both
 * directions. Tempat, Varian, Tahapan and Status are plain headers. There is no
 * Urutkan in the Filter panel, so its Reset never touches the ordering and
 * `Filter (n)` never counts it.
 */
const SORT_OPTIONS: SortOptions<ServiceSort> = {
  name: { asc: "nameAsc", desc: "nameDesc" },
  price: { asc: "priceAsc", desc: "priceDesc", first: "asc" },
  duration: { asc: "durationAsc", desc: "durationDesc", first: "asc" },
};

/** What the catalogue opens on, and what its Reset returns to. */
const DEFAULT_PERIOD: GroomingPeriod = "all";

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
export function GroomingServicesScreen({
  /**
   * Which line's catalogue — Grooming unless said. Antar-Jemput shows the same
   * table for its own line (21 September 2026); see `ServiceLine`.
   */
  serviceLine = GROOMING_LINE,
}: {
  serviceLine?: ServiceLine;
} = {}) {
  const router = useRouter();
  const { can } = usePermissions();
  /*
    The service form, at its one plain address — told this module's Kelompok
    layanan and list through `ServiceFormLink`, never the URL (22 September
    2026). Add-ons are made from Pengaturan › Layanan › Add-on.
  */
  const formOrigin = lineFormOrigin(serviceLine);
  const noun = serviceLine.noun;
  const { services, pagination, query, setQuery, refetch, loading, error } =
    useGroomingServices(serviceLine.serviceKind);
  // Per row, over that row's own variants — see variantRows.
  const { valuesFor, axes: axisDefs } = useVariantAxisValues();
  /* The tenant's card names — "Ukuran × Lokasi", not only the pet's three. */
  const axisName = (key: string) =>
    axisDefs.find((def) => def.key === key)?.name;

  /*
    THE CATALOGUE OPENS ON "SEMUA" (12 October 2026, on request) — every
    booking a service has ever had, where the booking boards open on Bulan ini.
    A price list is read for what sells at all, not this month's run.
  */
  const [period, setPeriod] = useState<GroomingPeriod>(DEFAULT_PERIOD);
  const [custom, setCustom] = useState<DateRange>({ from: "", to: "" });
  const range = useMemo(
    () => (period === "custom" ? custom : periodRange(period)),
    [period, custom],
  );

  const usage = useServiceBookingCounts(
    services.map((service) => service._id),
    can("bookings", "read"),
    {
      branchIds: query.branchIds,
      scheduledFrom: range.from || undefined,
      scheduledTo: range.to || undefined,
    },
  );

  // Bumped after a delete or restore — the only things here that move a total.
  const [version, setVersion] = useState(0);
  const totals = useGroomingServiceTotals(serviceLine.serviceKind, version);
  const [pending, setPending] = useState<ServiceLifecycleAction | null>(null);

  const mayRestore = can("services", "restore");
  const filterCount = countServiceFilters(query);
  const scopeCount = filterCount + (period !== DEFAULT_PERIOD ? 1 : 0);
  const narrowed = query.search.trim() !== "" || filterCount > 0;

  /** Custom's dates, from the card or the panel. */
  function pickCustomRange(next: DateRange) {
    // An emptied range — the date field's own Reset — goes back to the default.
    if (!next.from && !next.to) {
      setPeriod(DEFAULT_PERIOD);
      return;
    }

    setCustom(next);
    setPeriod("custom");
  }

  const listed = !error && !(loading && services.length === 0);

  const columns: DataTableColumn<Service>[] = [
    {
      id: "name",
      header: "Layanan",
      cellClassName: "whitespace-normal",
      cell: (service) => {
        const used = usage.counts?.[service._id];
        const label = (
          <HighlightText text={service.name} query={query.search} />
        );

        return (
          <>
            {service.deletedAt !== null ? (
              <span className="text-sm font-semibold text-foreground">
                {label}
              </span>
            ) : (
              <Link
                href={lineServicePath(serviceLine, service._id)}
                // The row opens the same page; one navigation, not two.
                onClick={(event) => event.stopPropagation()}
                className="rounded text-sm font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {label}
              </Link>
            )}
            <span className="block text-xs tabular-nums text-muted">
              <HighlightText text={service.code ?? ""} query={query.search} />
              {used !== undefined && ` · ${used} booking`}
            </span>
          </>
        );
      },
    },
    {
      id: "place",
      header: "Tempat",
      cell: (service) => {
        const place = placeOf(service.serviceLocations);
        return (
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
        );
      },
    },
    {
      id: "variants",
      header: "Varian",
      cell: (service) => {
        if (!service.hasVariants) {
          return (
            <Badge
              variant="outline"
              className="border-transparent bg-tint-neutral text-muted"
            >
              Tunggal
            </Badge>
          );
        }

        const counts = variantCounts(service, valuesFor(service.variants));
        return (
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
        );
      },
    },
    {
      id: "price",
      header: "Harga",
      align: "right",
      cellClassName: "text-sm font-semibold text-foreground",
      cell: (service) => priceRangeShort(service),
    },
    {
      id: "duration",
      header: "Durasi",
      cellClassName: "text-sm tabular-nums",
      cell: (service) => {
        const duration = serviceDurationBounds(service);
        return duration === null ? (
          <span className="font-semibold text-danger">Belum diisi</span>
        ) : (
          formatDurationRange(duration)
        );
      },
    },
    {
      id: "sessions",
      header: "Tahapan",
      cellClassName: "text-sm tabular-nums",
      cell: (service) => {
        const sessions = (service.sessions ?? []).length;
        return sessions ? (
          `${sessions} tahap`
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: (service) => {
        const status = statusOf(service);
        return (
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("border-transparent", status.className)}
            >
              {status.label}
            </Badge>
            {service.deletedAt !== null && mayRestore && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  setPending({ kind: "restore", service });
                }}
              >
                <RotateCcw className="size-4" />
                Pulihkan
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <GroomingModuleHeader
        line={serviceLine}
        action={
          <Can feature="services" action="create">
            <Button asChild>
              <ServiceFormLink href={NEW_MAIN_SERVICE_PATH} origin={formOrigin}>
                <Plus className="size-4" />
                Layanan baru
              </ServiceFormLink>
            </Button>
          </Can>
        }
      />

      {/*
        THE SHARED SCOPE ROW (12 October 2026, on request) — `ScopeFilterCard`
        through GroomingPeriodBar, so Cabang takes several. Its "Reset filter"
        counts the panel's fields too, plus a period off Bulan ini, and puts
        all of them back.
      */}
      <GroomingPeriodBar
        branchIds={query.branchIds}
        onBranchesChange={(branchIds) => setQuery({ branchIds })}
        period={period}
        customRange={custom}
        onPeriodChange={setPeriod}
        onCustomRange={pickCustomRange}
        trailing={
          scopeCount > 0 ? (
            <Button
              type="button"
              variant="link"
              className="min-h-11 px-0"
              onClick={() => {
                setQuery(EMPTY_SERVICE_FILTERS);
                setPeriod(DEFAULT_PERIOD);
              }}
            >
              Reset filter ({scopeCount})
            </Button>
          ) : undefined
        }
      />

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
          noun={noun}
        />

        {listed && (
          <p className="text-sm tabular-nums text-muted">
            {pagination.total} layanan
            {totals && ` · ${totals.active} aktif dari ${totals.all}`}
          </p>
        )}
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <DataTable
        columns={columns}
        rows={services}
        rowKey={(service) => service._id}
        sort={{
          value: query.sort,
          options: SORT_OPTIONS,
          onChange: (sort) => setQuery({ sort }),
        }}
        loading={loading}
        loadingLabel={`Memuat layanan ${noun}…`}
        tableClassName="min-w-240"
        rowClassName={(service) =>
          service.deletedAt !== null && "cursor-default"
        }
        // A deleted service opens nothing: `GET /services/:id` does not return it.
        onRowClick={(service) => {
          if (service.deletedAt === null) {
            router.push(lineServicePath(serviceLine, service._id));
          }
        }}
        empty={
          <div className="py-16 text-center text-sm text-muted">
            {narrowed ? (
              `Tidak ada layanan ${noun} yang cocok dengan saringan ini.`
            ) : (
              <>
                Belum ada layanan {noun}.{" "}
                <Can feature="services" action="create">
                  <ServiceFormLink
                    href={NEW_MAIN_SERVICE_PATH}
                    origin={formOrigin}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    Tambah yang pertama →
                  </ServiceFormLink>
                </Can>
              </>
            )}
          </div>
        }
      />

      {services.length > 0 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          unit="layanan"
          onPageChange={(page) => setQuery({ page })}
        />
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
