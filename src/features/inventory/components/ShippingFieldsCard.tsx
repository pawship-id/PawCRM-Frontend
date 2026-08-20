"use client";

import { Card } from "@/components";
import { TextField } from "@/components/TextField";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProductShipping, WeightUnit } from "@/types/inventory";

/** The editable shape — every field a string, as a form holds it. */
export interface ShippingDraft {
  weight: string;
  weightUnit: string;
  length: string;
  width: string;
  height: string;
  packageContents: string;
}

export const EMPTY_SHIPPING: ShippingDraft = {
  weight: "",
  weightUnit: "",
  length: "",
  width: "",
  height: "",
  packageContents: "",
};

/** A stored `shipping` object as the form holds it — nulls become "". */
export function toShippingDraft(
  shipping: ProductShipping | undefined,
): ShippingDraft {
  return {
    weight: shipping?.weight ?? "",
    weightUnit: shipping?.weightUnit ?? "",
    length: shipping?.length ?? "",
    width: shipping?.width ?? "",
    height: shipping?.height ?? "",
    packageContents: shipping?.packageContents ?? "",
  };
}

/**
 * The draft as an API payload — `""` becomes `null`, which is what CLEARS an
 * override and makes the field inherit again.
 *
 * Every leaf is sent, including the untouched ones, and that is deliberate on a
 * PATCH: the server merges leaf by leaf, so a field the user emptied has to
 * arrive as an explicit null rather than as an absence the merge would skip.
 */
export function toShippingPayload(
  draft: ShippingDraft,
): Partial<ProductShipping> {
  const value = (raw: string) => (raw.trim() === "" ? null : raw.trim());

  return {
    weight: value(draft.weight),
    weightUnit: (value(draft.weightUnit) as WeightUnit | null) ?? null,
    length: value(draft.length),
    width: value(draft.width),
    height: value(draft.height),
    packageContents: value(draft.packageContents),
  };
}

/** True when nothing at all has been entered — nothing to send on a create. */
export function isShippingEmpty(draft: ShippingDraft): boolean {
  return Object.values(draft).every((value) => value.trim() === "");
}

const WEIGHT_UNITS: Array<{ value: WeightUnit; label: string }> = [
  { value: "gr", label: "gram (gr)" },
  { value: "kg", label: "kilogram (kg)" },
];

interface ShippingFieldsCardProps {
  value: ShippingDraft;
  onChange: (next: ShippingDraft) => void;
  errors?: Partial<Record<keyof ShippingDraft, string>>;
  /**
   * What this product would use if it set nothing — its parent's values.
   *
   * ⚠️ RENDERED AS PLACEHOLDERS, NEVER AS VALUES, and this is the single most
   * important rule in the feature. Seeding an input with an inherited value
   * means the next save writes it as an explicit override, so a variant silently
   * stops following its parent on a save the user thought changed something
   * else. A placeholder shows the number without ever becoming form state.
   */
  inherited?: ProductShipping | null;
  /** Omitted on a parent/standalone, where there is nothing to inherit from. */
  inheritedLabel?: string;
  /**
   * A bundle's weight as computed from its components, in GRAMS.
   *
   * Rendered as a placeholder for exactly the reason `inherited` is: seeding the
   * input with the sum would turn it into an override on the next save, and the
   * bundle would stop following its components. Leaving the field empty is what
   * keeps it derived.
   */
  derivedWeightGrams?: string | null;
  /**
   * Component names with no weight recorded, which contributed zero to the sum
   * above. Named rather than hidden — a total the user cannot explain is worse
   * than no total.
   */
  unweighedComponents?: string[];
}

/**
 * "Informasi pengiriman" — weight, box dimensions and what is in the package.
 *
 * OPTIONAL THROUGHOUT. A tenant that does not ship fills none of it in, and the
 * fields exist for the marketplace and courier integrations that quote against
 * them.
 *
 * One card serves both levels. On a parent or a standalone it is a plain form;
 * on a variant, `inherited` turns every empty input into a window onto the
 * parent's value, so a family sets its shipping once and only the rows that
 * genuinely differ say so.
 */
export function ShippingFieldsCard({
  value,
  onChange,
  errors = {},
  inherited = null,
  inheritedLabel = "induk",
  derivedWeightGrams = null,
  unweighedComponents = [],
}: ShippingFieldsCardProps) {
  const set = (field: keyof ShippingDraft) => (raw: string) =>
    onChange({ ...value, [field]: raw });

  // Shown in the input's own placeholder slot, so an empty field reads as the
  // inherited number rather than as nothing at all.
  const placeholder = (field: keyof ProductShipping, fallback: string) =>
    (inherited?.[field] as string | null) ?? fallback;

  return (
    <Card title="Informasi pengiriman">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">
          Opsional. Dipakai untuk menghitung ongkos kirim di marketplace dan
          website.
          {inherited && (
            <>
              {" "}
              Kosongkan untuk mengikuti {inheritedLabel}; isi hanya kalau varian
              ini memang berbeda.
            </>
          )}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Berat"
            name="weight"
            inputMode="decimal"
            value={value.weight}
            onChange={(event) => set("weight")(event.target.value)}
            error={errors.weight}
            // A bundle's derived sum takes precedence over an inherited value:
            // a bundle has no parent, so only one of the two is ever set.
            placeholder={derivedWeightGrams ?? placeholder("weight", "500")}
            hint={
              derivedWeightGrams
                ? `Kosongkan untuk memakai total berat komponen (${derivedWeightGrams} gr). Isi kalau paketnya memang beda.`
                : undefined
            }
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="weightUnit">Satuan berat</Label>
            <Select
              value={value.weightUnit}
              onValueChange={set("weightUnit")}
            >
              {/* shadcn's SelectTrigger defaults to w-fit, which collapses in a
                  form grid — see the same note in ProductForm. */}
              <SelectTrigger id="weightUnit" className="w-full">
                <SelectValue
                  placeholder={
                    inherited?.weightUnit
                      ? `${inherited.weightUnit} (ikut ${inheritedLabel})`
                      : "Pilih satuan"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {WEIGHT_UNITS.map((unit) => (
                  <SelectItem key={unit.value} value={unit.value}>
                    {unit.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.weightUnit && (
              <p
                role="alert"
                className="text-xs text-danger"
              >
                {errors.weightUnit}
              </p>
            )}
          </div>
        </div>

        <div>
          <Label className="mb-1.5 block">Dimensi paket (cm)</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label="Panjang"
              name="length"
              inputMode="decimal"
              value={value.length}
              onChange={(event) => set("length")(event.target.value)}
              error={errors.length}
              placeholder={placeholder("length", "20")}
            />
            <TextField
              label="Lebar"
              name="width"
              inputMode="decimal"
              value={value.width}
              onChange={(event) => set("width")(event.target.value)}
              error={errors.width}
              placeholder={placeholder("width", "15")}
            />
            <TextField
              label="Tinggi"
              name="height"
              inputMode="decimal"
              value={value.height}
              onChange={(event) => set("height")(event.target.value)}
              error={errors.height}
              placeholder={placeholder("height", "10")}
            />
          </div>
        </div>

        {unweighedComponents.length > 0 && (
          /* The sum is still shown — hiding it would leave the user with
             nothing — but a total that silently counted a component as zero is
             a number nobody could reconcile against the scale. */
          <p className="rounded-lg border border-secondary/40 bg-secondary/15 px-3 py-2 text-xs">
            Total berat belum lengkap: {unweighedComponents.join(", ")} belum
            punya berat, jadi dihitung 0. Isi beratnya di produk masing-masing,
            atau isi berat paket ini secara manual.
          </p>
        )}

        <TextField
          label="Isi paket"
          name="packageContents"
          value={value.packageContents}
          onChange={(event) => set("packageContents")(event.target.value)}
          error={errors.packageContents}
          hint="Misalnya: 1 karung 3kg + 1 sendok takar."
          placeholder={placeholder("packageContents", "1 karung")}
        />
      </div>
    </Card>
  );
}
