"use client";

import { FilterMultiSelect, SelectField } from "@/components";
import type { BenefitInput, BenefitTarget } from "@/types/membership";

import { useScopeOptions } from "../hooks/useScopeOptions";

/**
 * WHAT A BENEFIT MAY BE SPENT ON — three controls that depend on each other.
 *
 * ─── THE CASCADE (29 September 2026, on BO's design) ───────────────────────
 *
 *   Jenis baris = Layanan  → Kelompok layanan appears; the service picker below
 *                            it lists MAIN services of that kelompok.
 *   Jenis baris = Add-on   → same, but the picker lists ADD-ONS of it.
 *   Jenis baris = Produk   → Kelompok disappears (a bag of feed belongs to no
 *                            kelompok layanan); the picker lists products.
 *   Jenis baris = Apa saja → both disappear. Nothing to narrow.
 *
 * THREE INDEPENDENT CONTROLS WAS THE OLD SHAPE and it was worse: it let an
 * owner scope a benefit to "produk" and then tick a grooming service, which is
 * a sentence the engine can never match and nothing on screen refused.
 *
 * ─── AND THE RULE THE EMPTY PICKER CARRIES ─────────────────────────────────
 *
 * A kelompok with NO service ticked means EVERY service of that kelompok —
 * including ones created next month. That is the point of scoping by kelompok
 * at all, and it is why the trigger says "Semua layanan grooming" rather than
 * "Pilih…" when nothing is chosen: an empty control that silently means
 * "everything" has to say so.
 *
 * Ticking services NARROWS to exactly those, and the ENGINE is what makes that
 * true: once anything more specific is named it matches only those, treating
 * the kelompok as the filter they were chosen through rather than as a second
 * thing to match. So the kelompok stays in the payload even when services are
 * ticked — which is what lets this form reopen on the right filter and show
 * them.
 */

const TARGET_OPTIONS: { value: BenefitTarget; label: string }[] = [
  { value: "service", label: "Layanan" },
  { value: "product", label: "Produk" },
  { value: "addon", label: "Add-on" },
  { value: "any", label: "Apa saja" },
];

/**
 * A SINGLE SELECT, not a multi. A benefit spanning grooming AND hotel is rare,
 * and the picker below can only be filtered by one kelompok at a time without
 * becoming a list nobody can reason about. Two kelompok means two benefits,
 * which also reads better on the card.
 *
 * Stored as an ARRAY all the same (`scope.serviceKinds`), because that is what
 * the engine matches against and a second kelompok may be wanted one day.
 */
const KIND_OPTIONS = [
  { value: "grooming", label: "Grooming" },
  { value: "hotel", label: "Hotel" },
  { value: "pickup-delivery", label: "Antar-jemput" },
];

const kindLabel = (value: string | null) =>
  KIND_OPTIONS.find((option) => option.value === value)?.label ?? "";

export function BenefitScopeField({
  benefit,
  onChange,
  error,
}: {
  benefit: BenefitInput;
  onChange: (scope: Partial<BenefitInput["scope"]>) => void;
  error?: string;
}) {
  const scope = benefit.scope ?? {};
  const target = (scope.target ?? "service") as BenefitTarget;
  const serviceKind = scope.serviceKinds?.[0] ?? null;

  const picksServices = target === "service" || target === "addon";
  const { options, loading } = useScopeOptions({ target, serviceKind });

  // A `perk` never touches a price, so it never needs a scope — offering one
  // would invite somebody to narrow something that is never evaluated.
  if (benefit.kind === "perk") {
    return null;
  }

  const picked = picksServices ? (scope.serviceIds ?? []) : (scope.productIds ?? []);

  const setPicked = (values: string[]) =>
    onChange(picksServices ? { serviceIds: values } : { productIds: values });

  const pickerLabel =
    target === "product"
      ? "Produk tertentu"
      : target === "addon"
        ? "Add-on tertentu"
        : "Layanan tertentu";

  const pickerHint = loading
    ? "Memuat…"
    : target === "product"
      ? "Pilih minimal satu produk — kalau kosong, paket tidak bisa disimpan."
      : picked.length === 0
        ? `Kosong berarti semua ${target === "addon" ? "add-on" : "layanan"} ${kindLabel(serviceKind)} — termasuk yang dibuat nanti.`
        : `Hanya ${picked.length} yang dipilih. Baris yang cocok dengan salah satunya dapat benefit ini.`;

  return (
    <fieldset className="mt-4 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium text-foreground">
        Berlaku untuk
      </legend>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Jenis baris"
          required
          value={target}
          onChange={(next) =>
            /*
              CHANGING THE TARGET CLEARS EVERYTHING UNDER IT. The ids belonged
              to the old list: service ids left behind on a product benefit
              would be a scope the engine can never match, and nothing on the
              screen would be able to show them.
            */
            onChange({
              target: next as BenefitTarget,
              serviceIds: [],
              productIds: [],
              serviceKinds: [],
            })
          }
          options={TARGET_OPTIONS}
        />

        {picksServices && (
          <SelectField
            label="Kelompok layanan"
            required
            value={serviceKind ?? ""}
            onChange={(next) =>
              /*
                A NEW KELOMPOK EMPTIES THE PICKER BELOW IT, for the same reason
                the target does: the ticked services belonged to the old one.
              */
              onChange({ serviceKinds: next ? [next] : [], serviceIds: [] })
            }
            options={KIND_OPTIONS}
            placeholder="Pilih kelompok"
          />
        )}
      </div>

      {(picksServices ? Boolean(serviceKind) : target === "product") && (
        /*
          A LABELLED FIELD, NOT A PILL (29 September 2026, on BO's request). It
          sits under two ordinary `SelectField`s, and a filter-bar trigger among
          them — half the height, label inline instead of above — read as a
          control that had wandered in from another screen. `layout="form"` is
          the same 44px field arrangement those two use.

          STILL A MULTI-SELECT: several services means "layanan 1 ATAU layanan
          2", which a plain select cannot say.
        */
        <FilterMultiSelect
          className="mt-4"
          layout="form"
          label={pickerLabel}
          values={picked}
          options={options.map((option) => ({
            value: option.id,
            label: option.name,
          }))}
          onApply={setPicked}
          onReset={() => setPicked([])}
          searchable
          disabled={loading}
          hint={pickerHint}
          formatValue={(values) => {
            if (!values.length) {
              /*
                THE EMPTY STATE SAYS WHAT IT MEANS. For services that is "every
                one of this kelompok" — a real and useful scope. For products it
                is nothing at all, and the plan is refused on save, so the
                wording has to differ.
              */
              return target === "product"
                ? "Pilih produk"
                : `Semua ${target === "addon" ? "add-on" : "layanan"} ${kindLabel(serviceKind)}`;
            }

            if (values.length === 1) {
              return (
                options.find((option) => option.id === values[0])?.name ??
                "1 dipilih"
              );
            }

            return `${values.length} dipilih`;
          }}
        />
      )}

      {/*
        THE CAPTION MOVES INTO THE FIELD once the picker is showing — a hint
        belongs under the control it is about. This one is left for the states
        where there IS no picker yet: "Apa saja", and a service target whose
        kelompok has not been chosen.
      */}
      {!(picksServices ? Boolean(serviceKind) : target === "product") && (
        <p className="mt-3 text-sm text-muted">
          {target === "any"
            ? "Benefit ini berlaku untuk baris apa pun di struk. Pakai hanya kalau memang itu yang dimaksud."
            : "Pilih kelompok layanannya dulu."}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
