"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { CheckRow, CheckRowGroup, FIELD_HEIGHT, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type {
  PetFurType,
  PetSize,
  PetSpecies,
  ServiceLocation,
  ServiceVariantAxis,
} from "@/types/api";

/**
 * The service form's fields that are more than one control each.
 *
 * Kept beside the form rather than in `@/components`, per ui-rules §14: none of
 * these has a second caller yet. `ServiceBranchScope` is the one that will —
 * suppliers and users each carry their own copy of the same checkbox-plus-list
 * — but promoting all three is a sweep, and the rules say not to open one
 * unasked.
 */

/** The pet's own vocabulary, in the language the counter speaks. */
export const PET_TYPE_LABELS: Record<PetSpecies, string> = {
  cat: "Kucing",
  dog: "Anjing",
};

export const SIZE_LABELS: Record<PetSize, string> = {
  small: "Kecil",
  medium: "Sedang",
  large: "Besar",
};

export const FUR_LABELS: Record<PetFurType, string> = {
  "long hair": "Bulu panjang",
  "short hair": "Bulu pendek",
};

export const LOCATION_LABELS: Record<ServiceLocation, string> = {
  in_store: "Di toko",
  in_home: "Di rumah pelanggan",
};

/**
 * The axes, their values and their labels — one table, so the checkbox list,
 * the generated rows and the payload can never disagree about what an axis is.
 *
 * The values mirror `PET_SPECIES`, `PET_SIZES` and `PET_FUR_TYPES` in
 * `pet.model.js`. They are a CLOSED list on the server; a value added there
 * without being added here simply cannot be priced, which is a visible gap
 * rather than a silent one.
 */
export const VARIANT_AXIS_TABLE: Array<{
  axis: ServiceVariantAxis;
  label: string;
  hint: string;
  values: string[];
  labels: Record<string, string>;
}> = [
  {
    axis: "petType",
    label: "Tipe hewan",
    hint: "Harga anjing beda dari kucing.",
    values: ["cat", "dog"],
    labels: PET_TYPE_LABELS,
  },
  {
    axis: "sizeCategory",
    label: "Kategori ukuran",
    hint: "Harga naik mengikuti besar hewannya.",
    values: ["small", "medium", "large"],
    labels: SIZE_LABELS,
  },
  {
    axis: "furType",
    label: "Kategori bulu",
    hint: "Bulu panjang makan waktu lebih lama.",
    values: ["long hair", "short hair"],
    labels: FUR_LABELS,
  },
];

/** One generated combination: the axis values, and the key its price is held under. */
export interface VariantCombo {
  key: string;
  petType: PetSpecies | null;
  sizeCategory: PetSize | null;
  furType: PetFurType | null;
  label: string;
}

/**
 * `["petType", "sizeCategory"]` → every combination of the two, in axis order.
 *
 * GENERATED RATHER THAN TYPED IN, which is what makes three of the server's
 * rules unreachable from this screen: no duplicate combination, no variant
 * missing a declared axis, and no variant setting one the service never
 * declared. A hand-built list could break all three, and the user would only
 * find out on save.
 *
 * The ceiling is arithmetic: 2 × 3 × 2 is twelve rows at the very widest, well
 * under the server's `MAX_VARIANTS`.
 */
export function buildVariantCombos(axes: ServiceVariantAxis[]): VariantCombo[] {
  const ordered = VARIANT_AXIS_TABLE.filter((entry) =>
    axes.includes(entry.axis),
  );

  if (ordered.length === 0) return [];

  let rows: VariantCombo[] = [
    { key: "", petType: null, sizeCategory: null, furType: null, label: "" },
  ];

  for (const entry of ordered) {
    rows = rows.flatMap((row) =>
      entry.values.map((value) => ({
        ...row,
        [entry.axis]: value,
        key: `${row.key}${value}|`,
        label: row.label
          ? `${row.label} · ${entry.labels[value]}`
          : entry.labels[value],
      })),
    ) as VariantCombo[];
  }

  return rows;
}

/** The key a stored variant is held under — must match `buildVariantCombos`. */
export function comboKey(
  axes: ServiceVariantAxis[],
  variant: {
    petType?: string | null;
    sizeCategory?: string | null;
    furType?: string | null;
  },
): string {
  return VARIANT_AXIS_TABLE.filter((entry) => axes.includes(entry.axis))
    .map((entry) => `${variant[entry.axis] ?? ""}|`)
    .join("");
}

/**
 * Which axes the price varies by, and a price box per generated combination.
 *
 * TICKING AN AXIS DOES NOT CLEAR THE OTHER PRICES. Somebody who ticks Ukuran,
 * fills three boxes, then adds Tipe hewan is refining an answer rather than
 * starting again — the prices they already typed for the combinations that
 * survive are kept, and only the genuinely new rows come up blank.
 */
export function ServiceVariantEditor({
  axes,
  prices,
  combos,
  error,
  disabled,
  onToggleAxis,
  onPriceChange,
}: {
  axes: ServiceVariantAxis[];
  prices: Record<string, string>;
  combos: VariantCombo[];
  error?: string;
  disabled: boolean;
  onToggleAxis: (axis: ServiceVariantAxis, checked: boolean) => void;
  onPriceChange: (key: string, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium">Harga dibedakan berdasarkan</p>
        <p className="mt-1 text-xs text-muted">
          Pilih minimal satu. Barisnya dibuat otomatis dari kombinasi yang
          dicentang.
        </p>
        <CheckRowGroup className="mt-2">
          {VARIANT_AXIS_TABLE.map((entry) => (
            <CheckRow
              key={entry.axis}
              label={entry.label}
              description={entry.hint}
              checked={axes.includes(entry.axis)}
              onCheckedChange={(checked) => onToggleAxis(entry.axis, checked)}
              disabled={disabled}
            />
          ))}
        </CheckRowGroup>
      </div>

      {combos.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-sm font-medium">
            Harga per varian{" "}
            <span className="font-normal text-muted">
              ({combos.length} baris)
            </span>
          </p>

          <div className="flex flex-col gap-3">
            {combos.map((combo) => (
              <div
                key={combo.key}
                className="grid items-center gap-3 sm:grid-cols-[1fr_180px]"
              >
                <span className="text-sm">{combo.label}</span>
                {/*
                  An `aria-label` rather than a `TextField`: the row's own text
                  IS the label, and repeating it above every box would make a
                  twelve-row grid read as twelve stacked fields.
                */}
                <Input
                  aria-label={`Harga ${combo.label}`}
                  inputMode="numeric"
                  value={prices[combo.key] ?? ""}
                  onChange={(event) =>
                    onPriceChange(combo.key, event.target.value)
                  }
                  placeholder="150000"
                  disabled={disabled}
                  className={FIELD_HEIGHT}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A free list of short lines — Sesi, and Termasuk.
 *
 * ADD-AND-REMOVE RATHER THAN A COMMA-SEPARATED BOX, because both lists are
 * rendered as separate items downstream (a calendar's stops, a storefront's
 * ticks). A text box would make the separator part of the data, and the first
 * item containing a comma would silently become two.
 */
export function StringListField({
  label,
  hint,
  placeholder,
  values,
  maxItems,
  maxLength,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  placeholder: string;
  values: string[];
  maxItems: number;
  maxLength: number;
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const full = values.length >= maxItems;

  function add() {
    const trimmed = draft.trim();
    if (trimmed === "" || full) return;
    // Silently ignoring a repeat rather than warning about it: the list is a
    // handful of words, and a duplicate is a slip nobody needs a sentence about.
    if (!values.includes(trimmed)) onChange([...values, trimmed]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs text-muted">{hint}</p>
      </div>

      {values.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {values.map((value, index) => (
            <li
              key={`${value}-${index}`}
              className="flex items-center gap-1.5 rounded-full bg-surface-hover px-3 py-1.5 text-sm"
            >
              {value}
              <button
                type="button"
                aria-label={`Hapus ${value}`}
                className="rounded-full p-0.5 text-muted transition hover:text-danger focus-visible:ring-[3px] focus-visible:ring-ring/50"
                disabled={disabled}
                onClick={() =>
                  onChange(values.filter((_, position) => position !== index))
                }
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2">
        <Input
          aria-label={label}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds the line instead of submitting the form — a half-typed
            // list is not a saved service.
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled || full}
          className={`flex-1 ${FIELD_HEIGHT}`}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={add}
          disabled={disabled || full || draft.trim() === ""}
        >
          <Plus className="size-4" aria-hidden />
          Tambah
        </Button>
      </div>

      {full && (
        <p className="text-xs text-muted">Maksimal {maxItems} baris.</p>
      )}
    </div>
  );
}

/**
 * Which branches offer this service.
 *
 * A CHECKBOX PLUS A LIST, not a multi-select, and it mirrors the same field on
 * the supplier and user forms. "Semua cabang" is a genuinely different answer
 * from "these five" — it keeps meaning every branch as new ones open — so it
 * gets a control of its own rather than being expressible only by ticking
 * everything.
 *
 * TICKING IT DROPS THE LIST, matching what the server stores: a leftover list is
 * a trap the day the box is unticked, because the service would silently
 * reappear in exactly the branches somebody picked months ago.
 */
export function ServiceBranchScope({
  branches,
  loading,
  loadError,
  allBranches,
  branchIds,
  error,
  disabled,
  onChange,
}: {
  branches: Array<{ _id: string; name: string }>;
  loading: boolean;
  loadError: string | null;
  allBranches: boolean;
  branchIds: string[];
  error?: string;
  disabled: boolean;
  onChange: (patch: { allBranches?: boolean; branchIds?: string[] }) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Tersedia di cabang</p>

      <div className="flex items-start gap-3">
        <Checkbox
          id="service-all-branches"
          checked={allBranches}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange({
              allBranches: checked === true,
              ...(checked === true ? { branchIds: [] } : {}),
            })
          }
        />
        <div>
          <Label htmlFor="service-all-branches" className="font-normal">
            Semua cabang
          </Label>
          <p className="mt-1 text-xs text-muted">
            Termasuk cabang yang dibuka nanti. Hilangkan centang kalau layanan
            ini cuma ada di sebagian cabang.
          </p>
        </div>
      </div>

      {!allBranches &&
        (loadError ? (
          <p className="text-xs text-danger">
            {loadError} Centang “Semua cabang” untuk melanjutkan.
          </p>
        ) : loading ? (
          <div className="flex h-9 items-center gap-2 text-sm text-muted">
            <Spinner size={16} /> Memuat cabang…
          </div>
        ) : branches.length === 0 ? (
          <p className="text-xs text-muted">
            Belum ada cabang yang bisa dipilih. Centang “Semua cabang”.
          </p>
        ) : (
          <div className="ml-7 flex flex-col gap-2">
            {branches.map((branch) => (
              <div key={branch._id} className="flex items-center gap-3">
                <Checkbox
                  id={`service-branch-${branch._id}`}
                  checked={branchIds.includes(branch._id)}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange({
                      allBranches: false,
                      branchIds:
                        checked === true
                          ? [...branchIds, branch._id]
                          : branchIds.filter((id) => id !== branch._id),
                    })
                  }
                />
                <Label
                  htmlFor={`service-branch-${branch._id}`}
                  className="font-normal"
                >
                  {branch.name}
                </Label>
              </div>
            ))}
          </div>
        ))}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The add-ons a main service can be sold with.
 *
 * ONLY SERVICES FILED AS ADD-ON APPEAR, because those are the only ones the API
 * accepts here — offering a main service and letting the save fail would be a
 * list that lies. A tenant with none yet is told where they come from rather
 * than shown an empty box.
 */
export function ServiceAddonPicker({
  addons,
  loading,
  loadError,
  selected,
  disabled,
  onChange,
}: {
  addons: Array<{ _id: string; name: string; code: string }>;
  loading: boolean;
  loadError: string | null;
  selected: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  if (loadError) {
    return <p className="text-xs text-danger">{loadError}</p>;
  }

  if (loading) {
    return (
      <div className="flex h-9 items-center gap-2 text-sm text-muted">
        <Spinner size={16} /> Memuat add-on…
      </div>
    );
  }

  if (addons.length === 0) {
    return (
      <p className="text-sm text-muted">
        Belum ada layanan yang ditandai sebagai add-on. Buat layanannya dulu
        dengan jenis “Add-on”, nanti muncul di sini.
      </p>
    );
  }

  return (
    <CheckRowGroup>
      {addons.map((addon) => (
        <CheckRow
          key={addon._id}
          label={addon.name}
          description={addon.code}
          checked={selected.includes(addon._id)}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange(
              checked
                ? [...selected, addon._id]
                : selected.filter((id) => id !== addon._id),
            )
          }
        />
      ))}
    </CheckRowGroup>
  );
}
