"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw } from "lucide-react";

import {
  Alert,
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  HighlightText,
  Pagination,
  Spinner,
  withAll,
} from "@/components";
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
  formatDuration,
  ServiceLifecycleDialog,
  type ServiceLifecycleAction,
} from "@/features/services";
import { cn } from "@/lib/utils";

import { useGroomingLine } from "../hooks/useGroomingLine";
import {
  useGroomingServices,
  type GroomingServicesQuery,
} from "../hooks/useGroomingServices";
import { useServiceBookingCounts } from "../hooks/useServiceBookingCounts";
import { groomingServicePath } from "../paths";
import {
  axesLabel,
  PLACE_SHORT,
  placeOf,
  priceRangeShort,
  statusOf,
  variantCoverage,
} from "../serviceDisplay";
import { GroomingModuleHeader } from "./GroomingModuleHeader";

const STATUS_OPTIONS = withAll<GroomingServicesQuery["isActive"]>(
  [
    { value: "true", label: "Aktif" },
    { value: "false", label: "Nonaktif" },
  ],
  "Semua status",
);

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
 * WHERE THE COLUMNS SAY LESS THAN THE MOCKUP: "N booking" appears only for a
 * role with `bookings:read`; Varian is priced / possible combinations, since a
 * variant has no on/off of its own; Durasi is one figure, since a variant has no
 * duration of its own; and Status has no Portal badge, since there is no portal.
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
  const usage = useServiceBookingCounts(
    services.map((service) => service._id),
    can("bookings", "read"),
  );
  const [pending, setPending] = useState<ServiceLifecycleAction | null>(null);

  const mayRestore = can("services", "restore");
  const narrowed =
    query.search.trim() !== "" || query.isActive !== "" || query.includeDeleted;

  return (
    <div className="flex flex-col gap-6">
      <GroomingModuleHeader
        action={
          <Can feature="services" action="create">
            <Button asChild>
              <Link href="/dashboard/master/layanan/new">
                <Plus className="size-4" />
                Layanan baru
              </Link>
            </Button>
          </Can>
        }
      />

      <FilterBar
        searchPlacement="leading"
        searchClassName="min-w-[12rem] flex-1"
        search={
          <FilterSearch
            value={query.search}
            onChange={(search) => setQuery({ search })}
            placeholder="Cari nama atau kode layanan…"
            ariaLabel="Cari layanan grooming"
            fill
          />
        }
      >
        <FilterSelect
          label="Status"
          ariaLabel="Filter status layanan"
          value={query.isActive}
          options={STATUS_OPTIONS}
          onChange={(isActive) => setQuery({ isActive })}
        />
        <FilterToggle
          label="Tampilkan terhapus"
          checked={query.includeDeleted}
          onChange={(includeDeleted) => setQuery({ includeDeleted })}
        />
      </FilterBar>

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
                  href="/dashboard/master/layanan/new"
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
            <Table className={cn("min-w-[960px]", loading && "opacity-60")}>
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
                  const coverage = variantCoverage(service);
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
                              {coverage.priced} / {coverage.possible}
                              <span className="sr-only"> kombinasi berharga</span>
                            </Badge>
                            <span className="mt-0.5 block text-xs text-muted">
                              {axesLabel(service)}
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
                        {service.durationMin === null ? (
                          <span className="font-semibold text-danger">
                            Belum diisi
                          </span>
                        ) : (
                          formatDuration(service.durationMin)
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
        }}
      />
    </div>
  );
}
