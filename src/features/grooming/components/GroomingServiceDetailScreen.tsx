"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Pencil, Trash2 } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can, usePermissions } from "@/features/permissions";
import {
  ServiceLifecycleDialog,
  type ServiceLifecycleAction,
} from "@/features/services";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { serviceService } from "@/services/service.service";
import type { CreateServiceInput, Service } from "@/types/api";

import {
  useBranchNames,
  useGroomingService,
  useServiceAddons,
} from "../hooks/useGroomingServiceDetail";
import { useServiceBookingCounts } from "../hooks/useServiceBookingCounts";
import { GROOMING_CATALOG_PATH, groomingServicePath } from "../paths";
import { branchesText, serviceEditPath, statusOf } from "../serviceDisplay";
import {
  ServicePortalPanel,
  ServiceStepsPanel,
  ServiceSummaryPanel,
  ServiceVariantsPanel,
} from "./GroomingServiceDetailPanels";
import { GroomingModuleHeader } from "./GroomingModuleHeader";

type DetailTab = "ringkasan" | "varian" | "tahapan" | "portal";

const TABS: { id: DetailTab; label: string }[] = [
  { id: "ringkasan", label: "Ringkasan" },
  { id: "varian", label: "Varian & Harga" },
  { id: "tahapan", label: "Tahapan & Add-on" },
  { id: "portal", label: "Portal" },
];

/** Backend caps — service.model.js. */
const NAME_MAX_LENGTH = 160;
const CODE_MAX_LENGTH = 40;

/** Tried in order; a 409 on one means the code is taken, so the next is tried. */
const COPY_SUFFIXES = ["-SALIN", "-SALIN2", "-SALIN3"];

/**
 * A new, INACTIVE service carrying this one's prices, variants, tahapan and
 * add-ons — the mockup's Duplikat.
 *
 * THE PHOTO IS NOT COPIED. Two services sharing one stored file is a picture
 * that disappears from both the day one of them replaces it.
 */
function copyOf(service: Service, suffix: string): CreateServiceInput {
  const name = `${service.name} (salinan)`;

  return {
    name: name.slice(0, NAME_MAX_LENGTH),
    code: `${service.code.slice(0, CODE_MAX_LENGTH - suffix.length)}${suffix}`,
    businessLineId: service.businessLineId,
    durationMin: service.durationMin as number,
    serviceLocations: service.serviceLocations?.length
      ? service.serviceLocations
      : ["in_store"],
    ...(service.hasVariants
      ? {
          hasVariants: true,
          variantAxes: service.variantAxes,
          variants: service.variants.map(
            ({ petType, sizeCategory, furType, price }) => ({
              petType,
              sizeCategory,
              furType,
              price,
            }),
          ),
        }
      : { hasVariants: false, price: service.price as string }),
    ...(service.categoryId ? { categoryId: service.categoryId } : {}),
    ...(service.salesAccountId ? { salesAccountId: service.salesAccountId } : {}),
    description: service.description,
    sessions: service.sessions ?? [],
    sessionWeights: service.sessionWeights ?? [],
    allBranches: service.allBranches,
    branchIds: service.allBranches ? [] : service.branchIds,
    serviceType: service.serviceType,
    addonServiceIds:
      service.serviceType === "main" ? (service.addonServiceIds ?? []) : [],
    included: service.included ?? [],
    pickupDeliveryAvailable: service.pickupDeliveryAvailable,
    taxExempt: service.taxExempt,
    isActive: false,
  };
}

/**
 * Layanan › Grooming › Layanan & Harga › one service — from
 * `buloo-grooming-v3.html` (decided 13 September 2026).
 *
 * A PAGE TO READ, WITH AN UBAH TO CHANGE IT. The mockup edits in its tabs; here
 * the service form stays the one editor, and this page opens it. What the page
 * does do itself is what is one click in the mockup and one field on the API:
 * Aktif / Nonaktif, Duplikat, and Hapus.
 *
 * WHAT THE MOCKUP HAS AND THIS DOES NOT: the Portal/Internal badge and the
 * "terbit di portal" choice (no portal, no flag — drawn "Segera"), durations and
 * on/off per variant (a variant carries a price only), "satuan tagihan" (no such
 * field), and the reason a service was turned off (no such field).
 *
 * THE SUB-TABS ARE STATE, NOT ROUTES: they are four readings of one record, and
 * nobody links to the Portal tab of a service.
 */
export function GroomingServiceDetailScreen({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const { can } = usePermissions();
  const mayUpdate = can("services", "update");
  const mayReadBookings = can("bookings", "read");
  const mayReadBranches = can("branches", "read");

  const { service, loading, error, replace } = useGroomingService(serviceId);
  const usage = useServiceBookingCounts(
    service ? [service._id] : [],
    mayReadBookings,
  );
  const branches = useBranchNames(
    mayReadBranches && service !== null && !service.allBranches,
  );
  const addons = useServiceAddons(
    service?.serviceType === "main" ? (service.addonServiceIds ?? []) : [],
  );

  const [tab, setTab] = useState<DetailTab>("ringkasan");
  const [pending, setPending] = useState<ServiceLifecycleAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const tabRefs = useRef<Partial<Record<DetailTab, HTMLButtonElement | null>>>({});

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((entry) => entry.id === tab);
    const next =
      event.key === "ArrowRight"
        ? TABS[(index + 1) % TABS.length]
        : event.key === "ArrowLeft"
          ? TABS[(index - 1 + TABS.length) % TABS.length]
          : event.key === "Home"
            ? TABS[0]
            : event.key === "End"
              ? TABS[TABS.length - 1]
              : null;

    if (!next) return;
    event.preventDefault();
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  }

  async function setActive(active: boolean) {
    if (!service || busy || service.isActive === active) return;

    setBusy(true);
    setActionError(null);
    try {
      replace(await serviceService.update(service._id, { isActive: active }));
      swalToast(
        active
          ? "Layanan diaktifkan lagi."
          : "Layanan dinonaktifkan. Booking lamanya tetap bisa dibaca.",
      );
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? (err.reason ?? err.message)
          : "Status layanan tidak bisa diubah. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    if (!service || busy) return;

    setBusy(true);
    setActionError(null);
    try {
      for (const suffix of COPY_SUFFIXES) {
        try {
          const created = await serviceService.create(copyOf(service, suffix));
          swalToast(
            "Disalin sebagai nonaktif. Harga, varian, dan tahapan ikut; fotonya tidak.",
          );
          router.push(groomingServicePath(created._id));
          return;
        } catch (err) {
          // The only 409 a create raises is a code already in use.
          if (err instanceof ApiError && err.status === 409) continue;
          throw err;
        }
      }
      setActionError(
        "Kode untuk salinannya sudah terpakai semua. Buat lewat Layanan baru saja.",
      );
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? (err.reason ?? err.message)
          : "Layanan tidak bisa disalin. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  const header = <GroomingModuleHeader />;

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Alert variant="error">{error}</Alert>
        <div>
          <Button asChild variant="secondary">
            <Link href={GROOMING_CATALOG_PATH}>Kembali ke Layanan & Harga</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (loading || !service) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat layanan…
        </div>
      </div>
    );
  }

  const status = statusOf(service);
  const count = usage.counts ? (usage.counts[service._id] ?? 0) : null;
  const branchText = branchesText(service, branches);
  const meta = [
    service.code,
    mayReadBookings && count !== null ? `${count} booking` : null,
    branchText,
  ]
    .filter(Boolean)
    .join(" · ");

  /*
    A COPY NEEDS WHAT A CREATE NEEDS. A service priced before duration was
    required has none, and the API would refuse the copy — so the button says
    why before anybody presses it.
  */
  const copyBlockedBy =
    service.durationMin === null
      ? "Isi durasinya dulu lewat Ubah."
      : !service.hasVariants && service.price === null
        ? "Isi harganya dulu lewat Ubah."
        : null;

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="flex flex-wrap items-start gap-4">
        <Link
          href={GROOMING_CATALOG_PATH}
          aria-label="Kembali ke Layanan & Harga"
          className="flex size-11 flex-none items-center justify-center rounded-full border border-border bg-surface text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft className="size-5" />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-extrabold text-foreground">
              {service.name}
            </h2>
            <Badge
              variant="outline"
              className={cn("border-transparent", status.className)}
            >
              {status.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm tabular-nums text-muted">{meta}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Can feature="services" action="delete">
            <Button
              type="button"
              variant="ghost"
              className="text-danger hover:bg-danger/10 hover:text-danger"
              disabled={busy}
              onClick={() => setPending({ kind: "delete", service })}
            >
              <Trash2 className="size-4" />
              Hapus
            </Button>
          </Can>
          <Can feature="services" action="create">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || copyBlockedBy !== null}
              title={copyBlockedBy ?? undefined}
              onClick={() => void duplicate()}
            >
              <Copy className="size-4" />
              Duplikat
            </Button>
          </Can>
          <Can feature="services" action="update">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void setActive(!service.isActive)}
            >
              {service.isActive ? "Nonaktifkan" : "Aktifkan"}
            </Button>
            <Button asChild>
              <Link href={serviceEditPath(service._id)}>
                <Pencil className="size-4" />
                Ubah
              </Link>
            </Button>
          </Can>
        </div>
      </div>

      {actionError && <Alert variant="error">{actionError}</Alert>}

      <div
        role="tablist"
        aria-label="Bagian detail layanan"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {TABS.map((entry) => {
          const selected = entry.id === tab;

          return (
            <button
              key={entry.id}
              ref={(node) => {
                tabRefs.current[entry.id] = node;
              }}
              type="button"
              role="tab"
              id={`service-detail-tab-${entry.id}`}
              aria-selected={selected}
              aria-controls={`service-detail-panel-${entry.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(entry.id)}
              onKeyDown={onTabKey}
              className={cn(
                "-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`service-detail-panel-${tab}`}
        aria-labelledby={`service-detail-tab-${tab}`}
      >
        {tab === "ringkasan" ? (
          <ServiceSummaryPanel
            service={service}
            usage={{
              allowed: mayReadBookings,
              count,
              loading: usage.loading,
              failed: usage.failed,
            }}
            addons={addons.loading || addons.failed ? null : addons.items}
            branchText={branchText}
            mayUpdate={mayUpdate}
            busy={busy}
            onSetActive={(active) => void setActive(active)}
          />
        ) : tab === "varian" ? (
          <ServiceVariantsPanel service={service} />
        ) : tab === "tahapan" ? (
          <ServiceStepsPanel service={service} addons={addons} />
        ) : (
          <ServicePortalPanel service={service} />
        )}
      </div>

      <ServiceLifecycleDialog
        action={pending}
        onCancel={() => setPending(null)}
        onDone={() => {
          setPending(null);
          router.push(GROOMING_CATALOG_PATH);
        }}
      />
    </div>
  );
}
