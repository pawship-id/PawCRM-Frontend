"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components";
import { usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";
import type { PetOptionType } from "@/types/api";

import { useAddonServiceList } from "../hooks/useAddonServiceList";
import { usePetOptionList } from "../hooks/usePetOptionList";
import { useServiceStepList } from "../hooks/useServiceStepList";
import {
  SERVICE_SETTINGS_SECTIONS,
  serviceSettingsPath,
  type ServiceSettingsSection,
} from "../serviceSettingsSections";
import { AddonServicesPanel } from "./AddonServicesPanel";
import { PetOptionsPanel } from "./PetOptionsPanel";
import { ServiceStepsPanel } from "./ServiceStepsPanel";

/** Opsi Varian: the three a service's price may vary by (`ServiceVariantAxis`). */
const VARIANT_OPTION_TYPES: readonly PetOptionType[] = [
  "species",
  "size",
  "furType",
];
const BREED_TYPES: readonly PetOptionType[] = ["breed"];

/** A section's callout — the mockup's navy box, as the app's info Alert. */
function Intro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Alert variant="info">
      <b className="font-semibold">{title}</b>
      <span className="mt-1 block">{children}</span>
    </Alert>
  );
}

/**
 * Pengaturan → Layanan: the lists more than one service draws from.
 *
 * ONE PAGE WITH A RAIL, from mockup `buloo-pengaturan-v3` (17 September 2026).
 * It was a hub of cards leading to Data hewan and Tahapan screens; those are
 * now sections here, opened with `?bagian=`, and their old routes redirect. The
 * rule the mockup draws is unchanged: what more than one service uses rises to
 * here, and what one line uses alone stays in that line's home — grooming
 * commission and capacity are on Layanan › Grooming › Pengaturan.
 *
 * A RAIL, NOT TABS, because it is what grows: a horizontal tab row runs out at
 * about six, a vertical list does not.
 *
 * NO SIMPAN IN THE HEADER, unlike the mockup. Every write here is its own act —
 * a dialog, a row menu, the service form — and saves as it happens; a page-level
 * button would promise a draft that does not exist.
 *
 * THE HUB OWNS THE LOADS, so the rail can count every section at once: pet
 * options (Opsi Varian and Ras share one load), tahapan, and the catalogue for
 * Add-on. A section switch then redraws without re-reading.
 *
 * THE SECTION IS STATE, MIRRORED TO THE URL with `router.replace`, so a link or
 * a reload lands on the same section without a history entry per click.
 *
 * GATED ON `services:read` by the page. Tahapan additionally needs
 * `businessLines:read`, and says so rather than sending a request it knows
 * will be refused.
 */
export function ServiceSettingsScreen({
  initialSection = "opsi",
}: {
  initialSection?: ServiceSettingsSection;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const mayReadLines = can("businessLines", "read");

  const petOptions = usePetOptionList();
  const serviceSteps = useServiceStepList(mayReadLines);
  const addons = useAddonServiceList();

  const [section, setSection] = useState<ServiceSettingsSection>(initialSection);
  const railRefs = useRef<
    Partial<Record<ServiceSettingsSection, HTMLButtonElement | null>>
  >({});

  function open(next: ServiceSettingsSection) {
    setSection(next);
    router.replace(serviceSettingsPath(next), { scroll: false });
  }

  /** A live count per section, or nothing while it is unknown. */
  function countOf(id: ServiceSettingsSection): string | undefined {
    const live = <T extends { deletedAt: string | null }>(items: T[]) =>
      items.filter((item) => item.deletedAt === null).length;

    switch (id) {
      case "opsi":
      case "ras": {
        if (petOptions.loading && petOptions.options.length === 0) return;
        const types = id === "opsi" ? VARIANT_OPTION_TYPES : BREED_TYPES;
        return String(
          live(petOptions.options.filter((o) => types.includes(o.type))),
        );
      }
      case "tahapan":
        if (!mayReadLines) return;
        if (serviceSteps.loading && serviceSteps.steps.length === 0) return;
        return String(live(serviceSteps.steps));
      case "addon":
        if (addons.loading && addons.addons.length === 0) return;
        return String(addons.addons.length);
      case "zona":
        return "Segera";
    }
  }

  function onRailKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = SERVICE_SETTINGS_SECTIONS.findIndex((s) => s.id === section);
    const last = SERVICE_SETTINGS_SECTIONS.length - 1;
    const target =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? (index + 1) % SERVICE_SETTINGS_SECTIONS.length
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? (index - 1 + SERVICE_SETTINGS_SECTIONS.length) %
            SERVICE_SETTINGS_SECTIONS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;

    if (target === null) return;
    event.preventDefault();
    const next = SERVICE_SETTINGS_SECTIONS[target].id;
    open(next);
    railRefs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Layanan</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Yang dipakai lebih dari satu layanan diatur di sini. Yang cuma dipakai
          satu layanan tinggal di rumahnya.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold text-foreground">
            Pengaturan bersama
          </h2>
          <p className="text-sm text-muted">Dipakai semua jenis layanan</p>
        </div>

        <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="border-b border-border bg-background p-3 md:border-r md:border-b-0">
            <p className="hidden px-3 pt-1 pb-2 text-xs font-semibold tracking-wide text-muted uppercase md:block">
              Dipakai bersama
            </p>
            <div
              role="tablist"
              aria-label="Bagian pengaturan layanan"
              aria-orientation="vertical"
              className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible"
            >
              {SERVICE_SETTINGS_SECTIONS.map((entry) => {
                const selected = entry.id === section;
                const count = countOf(entry.id);

                return (
                  <button
                    key={entry.id}
                    ref={(node) => {
                      railRefs.current[entry.id] = node;
                    }}
                    type="button"
                    role="tab"
                    id={`service-settings-tab-${entry.id}`}
                    aria-selected={selected}
                    aria-controls={`service-settings-panel-${entry.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => open(entry.id)}
                    onKeyDown={onRailKey}
                    className={cn(
                      "flex min-h-11 flex-none items-center justify-between gap-3 rounded-lg border border-transparent px-3 text-left text-sm font-semibold whitespace-nowrap transition",
                      "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "text-muted hover:bg-surface-hover hover:text-foreground",
                    )}
                  >
                    <span>{entry.label}</span>
                    {count !== undefined && (
                      <span
                        className={cn(
                          "text-xs font-medium tabular-nums",
                          selected ? "text-primary-foreground/80" : "text-muted",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            role="tabpanel"
            id={`service-settings-panel-${section}`}
            aria-labelledby={`service-settings-tab-${section}`}
            className="min-w-0 p-4 sm:p-6"
          >
            {section === "opsi" && (
              <PetOptionsPanel
                types={VARIANT_OPTION_TYPES}
                list={petOptions}
                intro={
                  <Intro title="Dipakai bersama semua layanan">
                    Kalau grooming dan hotel punya daftar ukuran sendiri-sendiri,
                    satu hewan bisa jadi dua ukuran. Satu daftar di sini — tiap
                    layanan memilih mana yang jadi varian harganya.
                  </Intro>
                }
              />
            )}

            {section === "ras" && (
              <PetOptionsPanel
                types={BREED_TYPES}
                list={petOptions}
                intro={
                  <Intro title="Ras tidak menentukan harga">
                    Ras dicatat di profil hewan. Harga layanan dibedakan per
                    jenis hewan, ukuran, dan jenis bulu — bukan per ras.
                  </Intro>
                }
              />
            )}

            {section === "tahapan" && (
              <ServiceStepsPanel
                list={serviceSteps}
                mayReadLines={mayReadLines}
                intro={
                  <Intro title="Bobot tidak di sini">
                    Yang dibuat di sini hanya nama tahapan. Porsi komisinya
                    diisi per layanan, karena tiap layanan membaginya berbeda.
                  </Intro>
                }
              />
            )}

            {section === "addon" && (
              <AddonServicesPanel
                list={addons}
                intro={
                  <Intro title="Add-on adalah layanan">
                    Dibuat dan diubah di form layanan dengan jenis Add-on. Nilai
                    komisinya diatur sekali di Grooming › Pengaturan › Komisi.
                  </Intro>
                }
              />
            )}

            {section === "zona" && (
              <div className="flex flex-col gap-5">
                <Intro title="Zona saja — tarifnya tidak di sini">
                  Zona akan jadi opsi varian untuk layanan antar-jemput, dan
                  tarif tiap zona diisi sebagai harga varian di layanan itu.
                </Intro>
                <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
                  <p className="font-semibold text-foreground">
                    Zona belum ada di sistem.
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Bagian ini dibuka bersama layanan antar-jemput.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
