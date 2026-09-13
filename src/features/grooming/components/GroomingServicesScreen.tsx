"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw, Trash2 } from "lucide-react";

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
  formatServicePrice,
  ServiceLifecycleDialog,
  type ServiceLifecycleAction,
} from "@/features/services";
import { cn } from "@/lib/utils";
import type { Service, ServiceLocation, ServiceVariantAxis } from "@/types/api";

import { useGroomingLine } from "../hooks/useGroomingLine";
import {
  useGroomingServices,
  type GroomingServicesQuery,
} from "../hooks/useGroomingServices";
import { GroomingModuleHeader } from "./GroomingModuleHeader";

const AXIS_LABELS: Record<ServiceVariantAxis, string> = {
  petType: "Jenis hewan",
  sizeCategory: "Ukuran",
  furType: "Jenis bulu",
};

const STATUS_OPTIONS = withAll<GroomingServicesQuery["isActive"]>(
  [
    { value: "true", label: "Aktif" },
    { value: "false", label: "Nonaktif" },
  ],
  "Semua status",
);

/** An old service has no locations stored — it was a shop service. */
function placeOf(locations: ServiceLocation[]): {
  label: string;
  home: boolean;
} {
  const home = locations.includes("in_home");
  const store = locations.length === 0 || locations.includes("in_store");

  if (home && store) return { label: "Toko & rumah", home };
  return home ? { label: "Di rumah", home } : { label: "Di toko", home };
}

/**
 * Deleted wins over inactive when both are true: a record that should not exist
 * is a more urgent thing to say than one that is merely no longer sold.
 */
function statusOf(service: Service): { label: string; className: string } {
  if (service.deletedAt !== null) {
    return { label: "Terhapus", className: "bg-tint-neutral text-muted" };
  }
  return service.isActive
    ? { label: "Aktif", className: "bg-tint-success text-success" }
    : { label: "Nonaktif", className: "bg-tint-neutral text-muted" };
}

/**
 * Layanan › Grooming › Layanan & Harga — the Grooming line's services.
 *
 * ─── A ROW OPENS THE MASTER DATA FORM ──────────────────────────────────────
 *
 * Decided 13 September 2026. The mockup draws a detail screen of its own
 * (Ringkasan / Varian & Harga / Tahapan & Add-on / Portal); this tab links to
 * `/dashboard/master/layanan/[id]` instead, so a service keeps ONE editor.
 *
 * ─── HAPUS AND PULIHKAN LIVE HERE ──────────────────────────────────────────
 *
 * The catalogue-wide list (`/dashboard/master/layanan/katalog`) was removed on
 * request the same day, and it was the only screen that could delete or restore
 * a service. Both came here, with its "Tampilkan terhapus" toggle. A deleted row
 * opens nothing: there is nothing to edit on a record that should not exist
 * until it is restored.
 *
 * WHAT THE MOCKUP'S TABLE HAS AND THIS DOES NOT: the Portal badge (no such
 * flag), the booking count per service (no such figure), and tahapan weights
 * (stored on the service since 13 September 2026, but edited in its form).
 */
export function GroomingServicesScreen() {
  const router = useRouter();
  const { can } = usePermissions();
  const line = useGroomingLine();
  const lineId = line.line?._id ?? null;
  const { services, pagination, query, setQuery, refetch, loading, error } =
    useGroomingServices(lineId);
  const [pending, setPending] = useState<ServiceLifecycleAction | null>(null);

  const mayEdit = can("services", "update");
  const mayDelete = can("services", "delete");
  const mayRestore = can("services", "restore");
  const narrowed =
    query.search.trim() !== "" || query.isActive !== "" || query.includeDeleted;

  const rowHasAction = (service: Service) =>
    service.deletedAt !== null ? mayRestore : mayDelete;
  const showActions = services.some(rowHasAction);

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
            <Table className={cn("min-w-[1040px]", loading && "opacity-60")}>
              <TableHeader>
                <TableRow>
                  <TableHead>Layanan</TableHead>
                  <TableHead>Tempat</TableHead>
                  <TableHead>Varian</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                  <TableHead>Durasi</TableHead>
                  <TableHead>Tahapan</TableHead>
                  <TableHead>Add-on</TableHead>
                  <TableHead>Status</TableHead>
                  {showActions && (
                    <TableHead className="text-right">Aksi</TableHead>
                  )}
                </TableRow>
              </TableHeader>

              <TableBody>
                {services.map((service) => {
                  const href = `/dashboard/master/layanan/${service._id}`;
                  const deleted = service.deletedAt !== null;
                  const opens = mayEdit && !deleted;
                  const place = placeOf(service.serviceLocations ?? []);
                  const sessions = (service.sessions ?? []).length;
                  const addons = (service.addonServiceIds ?? []).length;
                  const status = statusOf(service);

                  return (
                    <TableRow
                      key={service._id}
                      className={cn(opens && "cursor-pointer")}
                      onClick={
                        opens
                          ? (event) => {
                              if ((event.target as HTMLElement).closest("a, button")) {
                                return;
                              }
                              router.push(href);
                            }
                          : undefined
                      }
                    >
                      <TableCell className="whitespace-normal">
                        {opens ? (
                          <Link
                            href={href}
                            className="rounded text-sm font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          >
                            <HighlightText text={service.name} query={query.search} />
                          </Link>
                        ) : (
                          <span className="text-sm font-semibold text-foreground">
                            <HighlightText text={service.name} query={query.search} />
                          </span>
                        )}
                        <span className="block text-xs tabular-nums text-muted">
                          <HighlightText text={service.code ?? ""} query={query.search} />
                          {service.serviceType === "addon" && " · add-on"}
                        </span>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "border-transparent",
                            place.home
                              ? "bg-tint-info text-info"
                              : "bg-tint-neutral text-muted",
                          )}
                        >
                          {place.label}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        {service.hasVariants ? (
                          <>
                            <Badge
                              variant="outline"
                              className="border-transparent bg-tint-brand text-primary"
                            >
                              {(service.variants ?? []).length} varian
                            </Badge>
                            <span className="mt-0.5 block text-xs text-muted">
                              {(service.variantAxes ?? [])
                                .map((axis) => AXIS_LABELS[axis])
                                .join(" × ")}
                            </span>
                          </>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-tint-neutral text-muted"
                          >
                            Harga tunggal
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-right text-sm font-semibold tabular-nums text-foreground">
                        {formatServicePrice(service)}
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

                      <TableCell className="text-sm tabular-nums">
                        {service.serviceType !== "addon" && addons ? (
                          `${addons} add-on`
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("border-transparent", status.className)}
                        >
                          {status.label}
                        </Badge>
                      </TableCell>

                      {showActions && (
                        <TableCell className="text-right">
                          {deleted ? (
                            mayRestore && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setPending({ kind: "restore", service })
                                }
                              >
                                <RotateCcw className="size-4" />
                                Pulihkan
                              </Button>
                            )
                          ) : (
                            mayDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-danger hover:bg-danger/10 hover:text-danger"
                                onClick={() =>
                                  setPending({ kind: "delete", service })
                                }
                              >
                                <Trash2 className="size-4" />
                                Hapus
                              </Button>
                            )
                          )}
                        </TableCell>
                      )}
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
