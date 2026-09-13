"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";

import { Alert, Card, Spinner, StatTile } from "@/components";
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
import { Can } from "@/features/permissions";
import {
  formatDuration,
  formatServicePrice,
  servicePriceBounds,
} from "@/features/services";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";
import type { Service } from "@/types/api";

import { formatMoneyShort } from "../board";
import {
  axesLabel,
  missingPieces,
  PLACE_LONG,
  placeOf,
  serviceEditPath,
  sessionShares,
  statusOf,
  variantCoverage,
  variantRows,
} from "../serviceDisplay";

/**
 * The four tabs of a service's detail page — from `buloo-grooming-v3.html`.
 *
 * READ-ONLY, where the mockup edits in place. The service form stays the one
 * editor (decided 13 September 2026, on request): every panel that shows
 * something changeable carries an Ubah that opens it. Two editors for one
 * service is two sets of validation to keep agreeing.
 */

function EditLink({ serviceId, label = "Ubah" }: { serviceId: string; label?: string }) {
  return (
    <Can feature="services" action="update">
      <Button asChild variant="secondary" size="sm">
        <Link href={serviceEditPath(serviceId)}>
          <Pencil className="size-4" />
          {label}
        </Link>
      </Button>
    </Can>
  );
}

function Fact({
  label,
  children,
  numeric = false,
}: {
  label: string;
  children: ReactNode;
  numeric?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-semibold text-foreground",
          numeric && "tabular-nums",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function AvailabilityOption({
  checked,
  label,
  hint,
  disabled,
  soon = false,
  onSelect,
}: {
  checked: boolean;
  label: string;
  hint: string;
  disabled: boolean;
  soon?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "rounded-xl border p-4 text-left transition focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        checked
          ? "border-primary bg-surface-selected"
          : "border-border bg-surface enabled:hover:bg-surface-hover",
        disabled && !checked && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {soon && <Badge variant="outline">Segera</Badge>}
      </span>
      <span className="mt-0.5 block text-xs text-muted">{hint}</span>
    </button>
  );
}

export interface BookingUsage {
  /** `bookings:read` — without it the figure is not the reader's to see. */
  allowed: boolean;
  count: number | null;
  loading: boolean;
  failed: boolean;
}

/** Ringkasan — the four figures, availability, the basics, and what is missing. */
export function ServiceSummaryPanel({
  service,
  usage,
  addons,
  branchText,
  mayUpdate,
  busy,
  onSetActive,
}: {
  service: Service;
  usage: BookingUsage;
  /** Null while the add-ons are unknown. */
  addons: Service[] | null;
  branchText: string;
  mayUpdate: boolean;
  busy: boolean;
  onSetActive: (active: boolean) => void;
}) {
  const bounds = servicePriceBounds(service);
  const coverage = variantCoverage(service);
  const shares = sessionShares(service);
  const weighted = shares.some((share) => share.weight !== null);
  const missing = missingPieces(service, addons);

  const priceCaption = !bounds
    ? service.hasVariants
      ? "belum ada varian berharga"
      : "belum diisi"
    : service.hasVariants
      ? `${
          formatMoneyShort(bounds.low) !== formatMoneyShort(bounds.high)
            ? `sampai ${formatMoneyShort(bounds.high)} · `
            : ""
        }${coverage.priced} varian`
      : "harga tunggal";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Rentang harga"
          value={bounds ? formatMoneyShort(bounds.low) : "—"}
          caption={priceCaption}
        />
        <StatTile
          label="Durasi"
          value={service.durationMin === null ? "—" : String(service.durationMin)}
          caption={service.durationMin === null ? "belum diisi" : "menit per booking"}
        />
        <StatTile
          label="Tahapan"
          value={String(shares.length)}
          caption={
            shares.length === 0
              ? "belum ada"
              : weighted
                ? "bobot 100%"
                : "bobot dibagi rata"
          }
        />
        <StatTile
          label="Dipakai"
          value={usage.count === null ? "—" : String(usage.count)}
          caption={usage.allowed ? "booking sejauh ini" : "tidak bisa dilihat"}
          loading={usage.loading}
          error={usage.failed}
        />
      </div>

      <Card title="Ketersediaan">
        <div
          role="radiogroup"
          aria-label="Ketersediaan layanan"
          className="grid gap-3 md:grid-cols-3"
        >
          <AvailabilityOption
            checked={service.isActive}
            label="Aktif"
            hint="Ditawarkan di kasir dan booking"
            disabled={!mayUpdate || busy}
            onSelect={() => onSetActive(true)}
          />
          {/* The mockup's third state needs a portal and a publish flag;
              neither exists, so it is drawn and cannot be chosen. */}
          <AvailabilityOption
            checked={false}
            label="Aktif + terbit di portal"
            hint="Portal pelanggan belum ada"
            disabled
            soon
          />
          <AvailabilityOption
            checked={!service.isActive}
            label="Nonaktif"
            hint="Tidak ditawarkan di booking baru dan kasir"
            disabled={!mayUpdate || busy}
            onSelect={() => onSetActive(false)}
          />
        </div>
      </Card>

      <Card title="Informasi dasar">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Fact label="Kode" numeric>
            {service.code}
          </Fact>
          <Fact label="Tempat pengerjaan">
            {PLACE_LONG[placeOf(service.serviceLocations)]}
          </Fact>
          <Fact label="Jenis">
            {service.serviceType === "addon" ? "Add-on" : "Layanan utama"}
          </Fact>
          <Fact label="Opsi varian">
            {service.hasVariants ? axesLabel(service) : "—"}
          </Fact>
          <Fact label="Cabang">{branchText}</Fact>
          <Fact label="Add-on">
            {service.serviceType === "addon"
              ? "—"
              : `${(service.addonServiceIds ?? []).length} terpasang`}
          </Fact>
        </dl>
      </Card>

      <Card title="Yang perlu dilengkapi">
        {missing.length === 0 ? (
          <p className="text-sm font-semibold text-success">Lengkap.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
            {missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Varian & Harga — where it is done, what the price depends on, and the grid. */
export function ServiceVariantsPanel({ service }: { service: Service }) {
  const rows = variantRows(service);
  const coverage = variantCoverage(service);
  const duration =
    service.durationMin === null ? "belum diisi" : formatDuration(service.durationMin);

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Tempat pengerjaan"
        action={<EditLink serviceId={service._id} />}
      >
        <p className="text-sm font-semibold text-foreground">
          {PLACE_LONG[placeOf(service.serviceLocations)]}
        </p>
        <p className="mt-1 text-sm text-muted">
          {service.pickupDeliveryAvailable
            ? "Antar-jemput bisa ditambahkan ke booking."
            : "Tanpa antar-jemput."}
        </p>
      </Card>

      <Card title="Opsi yang membedakan harga">
        {service.hasVariants ? (
          <p className="text-sm font-semibold text-foreground">
            {axesLabel(service)}
          </p>
        ) : (
          <p className="text-sm text-muted">
            Harga tunggal — tidak ada opsi yang membedakan harga.
          </p>
        )}
      </Card>

      {service.hasVariants ? (
        <Card
          title="Daftar varian"
          description={`${coverage.priced} dari ${coverage.possible} kombinasi sudah berharga · durasi ${duration} untuk semua varian`}
          action={<EditLink serviceId={service._id} label="Ubah harga" />}
        >
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Varian</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="text-sm font-semibold text-foreground">
                      {row.label}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {row.price === null ? (
                        <span className="font-semibold text-danger">
                          Belum diberi harga
                        </span>
                      ) : (
                        formatMoney(row.price)
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-sm text-muted">
            Rentang:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatServicePrice(service)}
            </span>
          </p>
        </Card>
      ) : (
        <Card
          title="Harga & durasi"
          action={<EditLink serviceId={service._id} label="Ubah harga" />}
        >
          <dl className="grid max-w-md gap-4 sm:grid-cols-2">
            <Fact label="Harga" numeric>
              {formatServicePrice(service)}
            </Fact>
            <Fact label="Durasi" numeric>
              {service.durationMin === null
                ? "Belum diisi"
                : formatDuration(service.durationMin)}
            </Fact>
          </dl>
        </Card>
      )}
    </div>
  );
}

/** Tahapan & Add-on — the turns and their commission weights, and the add-ons. */
export function ServiceStepsPanel({
  service,
  addons,
}: {
  service: Service;
  addons: { items: Service[]; missing: number; loading: boolean; failed: boolean };
}) {
  const shares = sessionShares(service);
  const weighted = shares.some((share) => share.weight !== null);
  const addonCount = (service.addonServiceIds ?? []).length;

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Tahapan & bobot komisi"
        description={
          weighted
            ? "Bagian komisi tiap tahapan dari layanan ini."
            : "Bobot kosong, jadi komisinya dibagi rata ke semua tahapan."
        }
        action={<EditLink serviceId={service._id} />}
      >
        {shares.length === 0 ? (
          <p className="text-sm text-muted">Belum ada tahapan.</p>
        ) : (
          <>
            <ol className="flex flex-col gap-2">
              {shares.map((share, index) => (
                <li
                  key={`${index}-${share.name}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <span className="flex size-7 flex-none items-center justify-center rounded-full bg-surface-selected text-xs font-semibold tabular-nums text-primary">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                    {share.name}
                  </span>
                  <span className="text-sm tabular-nums text-muted">
                    {share.weight === null ? "rata" : `${share.weight}%`}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-muted">
              {weighted ? "Total 100%" : "Dibagi rata"}
            </p>
          </>
        )}
      </Card>

      <Card
        title="Add-on yang boleh dipasang"
        action={
          service.serviceType === "main" ? (
            <EditLink serviceId={service._id} />
          ) : undefined
        }
      >
        {service.serviceType === "addon" ? (
          <p className="text-sm text-muted">
            Layanan ini sendiri add-on, jadi tidak bisa punya add-on.
          </p>
        ) : addonCount === 0 ? (
          <p className="text-sm text-muted">Belum ada add-on yang dipasang.</p>
        ) : addons.loading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Memuat add-on…
          </div>
        ) : addons.failed ? (
          <Alert variant="error">Daftar add-on tidak bisa dimuat. Coba muat ulang.</Alert>
        ) : (
          <>
            <ul className="grid gap-3 md:grid-cols-2">
              {addons.items.map((addon) => {
                const status = statusOf(addon);
                const retired = addon.deletedAt !== null || !addon.isActive;

                return (
                  <li
                    key={addon._id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">
                        {addon.name}
                      </span>
                      <span className="block text-xs text-muted">
                        <span className="tabular-nums">{addon.code}</span>
                        {addon.durationMin !== null &&
                          ` · +${formatDuration(addon.durationMin)}`}
                      </span>
                    </span>
                    {retired && (
                      <Badge
                        variant="outline"
                        className={cn("border-transparent", status.className)}
                      >
                        {status.label}
                      </Badge>
                    )}
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatServicePrice(addon)}
                    </span>
                  </li>
                );
              })}
            </ul>
            {addons.missing > 0 && (
              <p className="mt-3 text-xs text-muted">
                {addons.missing} add-on tidak ditemukan di daftar add-on.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

/**
 * Portal — what a customer would read. The content is real (`image`,
 * `description`, `included` are stored on the service); publishing it is not,
 * because there is no portal yet, and the panel says so first.
 */
export function ServicePortalPanel({ service }: { service: Service }) {
  const bounds = servicePriceBounds(service);
  const included = service.included ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Alert variant="info">
        Portal pelanggan belum ada, jadi layanan ini belum bisa terbit. Foto,
        deskripsi, dan isi layanan di bawah sudah tersimpan dan akan dipakai
        portal nanti.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <Card
          title="Konten untuk pelanggan"
          action={<EditLink serviceId={service._id} />}
        >
          <dl className="flex flex-col gap-4">
            <div>
              <dt className="text-xs text-muted">Foto</dt>
              <dd className="mt-1">
                {service.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={service.image.url}
                    alt={`Foto ${service.name}`}
                    className="h-36 w-full max-w-sm rounded-xl object-cover"
                  />
                ) : (
                  <span className="text-sm text-muted">Belum ada foto.</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Deskripsi</dt>
              <dd className="mt-1 whitespace-pre-line text-sm text-foreground">
                {service.description || (
                  <span className="text-muted">Belum diisi.</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Termasuk</dt>
              <dd className="mt-1">
                {included.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {included.map((item, index) => (
                      <li key={`${index}-${item}`}>
                        <Badge
                          variant="outline"
                          className="border-transparent bg-tint-brand text-primary"
                        >
                          {item}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-sm text-muted">Belum diisi.</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <section aria-label="Pratinjau">
          <h3 className="mb-2 text-base font-bold text-foreground">Pratinjau</h3>
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            {service.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={service.image.url}
                alt=""
                className="h-32 w-full object-cover"
              />
            ) : (
              <div className="flex h-32 items-center justify-center bg-surface-selected text-sm text-muted">
                Belum ada foto
              </div>
            )}
            <div className="p-4">
              <p className="text-base font-bold text-foreground">{service.name}</p>
              <p className="mt-1 text-sm text-muted">
                {service.description || "Belum ada deskripsi."}
              </p>
              {included.length > 0 && (
                <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-foreground">
                  {included.slice(0, 4).map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                  {included.length > 4 && (
                    <li className="text-muted">+{included.length - 4} lainnya</li>
                  )}
                </ul>
              )}
              <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-xs text-muted">Mulai dari</span>
                <span className="text-lg font-bold tabular-nums text-foreground">
                  {bounds ? formatMoney(bounds.low) : "—"}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
