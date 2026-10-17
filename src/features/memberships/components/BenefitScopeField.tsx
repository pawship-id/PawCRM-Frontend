"use client";

import { FilterMultiSelect, SelectField } from "@/components";
import type { Service } from "@/types/api";
import type { BenefitScope, BenefitTarget } from "@/types/membership";

import type { CatalogItem } from "../hooks/useMembershipCatalog";
import { servicesFor } from "../hooks/useMembershipCatalog";

/**
 * WHAT ONE OPTION COVERS — "Layanan / produk" in the builder (contract §2.3).
 *
 *   Jenis = Layanan  → Kelompok narrows the list; ticking services narrows to
 *                      exactly those. A kelompok with nothing ticked means
 *                      EVERY service of it, including ones created later.
 *   Jenis = Add-on   → same, but nothing at all ticked and no kelompok is
 *                      legal: "Semua add-on", including add-ons added later.
 *   Jenis = Produk   → pick at least one product.
 *   Jenis = Apa saja → every line. No picker.
 *
 * Naming specific items NARROWS; `serviceKinds` only counts when nothing is
 * named, so the kelompok stays in the payload as the filter the services were
 * picked through — which is what lets the form reopen on it.
 */

const TARGET_OPTIONS: { value: BenefitTarget; label: string }[] = [
  { value: "service", label: "Layanan" },
  { value: "addon", label: "Add-on" },
  { value: "product", label: "Produk" },
  { value: "any", label: "Apa saja" },
];

/** `SelectField` takes no `""` option (Radix), so "every kelompok" has a real value. */
const ALL_KINDS = "semua";

const KIND_OPTIONS = [
  { value: ALL_KINDS, label: "Semua kelompok" },
  { value: "grooming", label: "Grooming" },
  { value: "hotel", label: "Hotel" },
  { value: "pickup-delivery", label: "Antar-jemput" },
];

const kindLabel = (value: string | null) =>
  value ? (KIND_OPTIONS.find((option) => option.value === value)?.label ?? value) : "";

/** "Semua layanan Grooming" · "Semua add-on" · "2 dipilih" — the picker's own words. */
export function scopeSummary(
  scope: BenefitScope,
  names: (id: string) => string | undefined,
): string {
  const kind = kindLabel(scope.serviceKinds[0] ?? null);

  if (scope.target === "any") return "Semua layanan & produk";
  if (scope.target === "product") {
    if (!scope.productIds.length) return "Pilih produk";
    return scope.productIds.length === 1
      ? (names(scope.productIds[0]) ?? "1 produk")
      : `${scope.productIds.length} produk`;
  }

  const ids = scope.serviceIds;
  if (ids.length === 1) return names(ids[0]) ?? "1 dipilih";
  if (ids.length > 1) return `${ids.length} dipilih`;

  if (scope.target === "addon") return kind ? `Semua add-on ${kind}` : "Semua add-on";
  return kind ? `Semua layanan ${kind}` : "Pilih layanan";
}

export function BenefitScopeField({
  scope,
  onChange,
  services,
  products,
  loading,
  error,
}: {
  scope: BenefitScope;
  onChange: (scope: BenefitScope) => void;
  services: Service[];
  products: CatalogItem[];
  loading: boolean;
  error?: string;
}) {
  const target = scope.target;
  const serviceKind = scope.serviceKinds[0] ?? null;
  const picksServices = target === "service" || target === "addon";

  const items: CatalogItem[] = picksServices
    ? servicesFor(services, target, serviceKind).map((service) => ({
        id: service._id,
        name: service.name,
      }))
    : target === "product"
      ? products
      : [];

  const nameOf = (id: string) =>
    (picksServices ? services.find((s) => s._id === id)?.name : products.find((p) => p.id === id)?.name) ??
    undefined;

  const picked = picksServices ? scope.serviceIds : scope.productIds;

  const hint = loading
    ? "Memuat daftar…"
    : target === "addon" && picked.length === 0
      ? "Berlaku untuk semua add-on, termasuk yang ditambahkan nanti."
      : target === "service" && picked.length === 0 && serviceKind
        ? `Semua layanan ${kindLabel(serviceKind)}, termasuk yang dibuat nanti.`
        : undefined;

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,11rem)_minmax(0,1fr)]">
      <SelectField
        label="Jenis"
        value={target}
        options={TARGET_OPTIONS}
        onChange={(next) =>
          /*
            A NEW TARGET CLEARS EVERYTHING UNDER IT: service ids left on a
            product option would be a scope nothing can match and nothing on
            screen can show.
          */
          onChange({
            target: next as BenefitTarget,
            serviceIds: [],
            productIds: [],
            categoryIds: [],
            serviceKinds: [],
          })
        }
      />

      {picksServices ? (
        <SelectField
          label="Kelompok"
          value={serviceKind ?? ALL_KINDS}
          options={KIND_OPTIONS}
          onChange={(next) =>
            onChange({
              ...scope,
              serviceKinds: next === ALL_KINDS ? [] : [next],
              // The ticked services belonged to the old kelompok.
              serviceIds: [],
            })
          }
        />
      ) : (
        <div className="hidden sm:block" aria-hidden />
      )}

      {target === "any" ? (
        <p className="self-end pb-3 text-sm text-muted">
          Berlaku untuk baris apa pun di struk.
        </p>
      ) : (
        <FilterMultiSelect
          layout="form"
          label={target === "product" ? "Produk" : target === "addon" ? "Add-on" : "Layanan"}
          values={picked}
          options={items.map((item) => ({ value: item.id, label: item.name }))}
          onApply={(values) =>
            onChange(picksServices ? { ...scope, serviceIds: values } : { ...scope, productIds: values })
          }
          onReset={() =>
            onChange(picksServices ? { ...scope, serviceIds: [] } : { ...scope, productIds: [] })
          }
          searchable
          disabled={loading}
          hint={hint}
          error={error}
          formatValue={() => scopeSummary(scope, nameOf)}
        />
      )}
    </div>
  );
}
