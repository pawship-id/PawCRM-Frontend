"use client";

import { Plus, Trash2 } from "lucide-react";

import { Card, SelectField, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import type { Service } from "@/types/api";
import type { OptionKind } from "@/types/membership";
import { MEMBERSHIP_LIMITS } from "@/types/membership";

import type { CatalogItem } from "../hooks/useMembershipCatalog";
import { isHomeService } from "../hooks/useMembershipCatalog";
import {
  BENEFIT_TYPE_TOOLTIP,
  OPTION_KIND_LABEL,
  OPTION_PRICE_MODE_LABEL,
  QUOTA_CHOICE_LABEL,
  QUOTA_PERIOD_TOOLTIP,
  VISIT_FEE_LABEL,
  type QuotaChoice,
} from "../labels";
import {
  newBenefitDraft,
  newOptionDraft,
  specialPriceAllowed,
  type BenefitDraft,
  type OptionDraft,
} from "../planDraft";
import { servicePriceFor, serviceVariantPrices, parseVariantKey } from "../variantKey";
import { BenefitScopeField } from "./BenefitScopeField";
import { FieldBlock, Segmented, SelectBlock } from "./FormBits";
import { VariantPriceTable } from "./VariantPriceTable";

/**
 * THE BENEFIT BUILDER, inside the plan form.
 *
 * ONE BENEFIT = ONE ALLOWANCE (contract §2.2): a name, a quota, and one or more
 * OPTIONS joined by "ATAU". Whichever option prices the line, one use spends
 * the benefit's quota once — "Grooming 1× per bulan: Basic gratis ATAU Full
 * jadi Rp 120.000".
 *
 * A benefit can also be a FASILITAS (`perk`) — a promise with no price, no quota
 * and no options ("Prioritas booking"). It is a type of benefit, not an option.
 *
 * THERE IS NO BENEFIT SCREEN AND NO BENEFIT ROUTE. A benefit belongs to its
 * package and freezes into a card when one is sold; editing it anywhere else
 * would be a second place for the ids the ledger points at to be written.
 *
 * Errors arrive keyed the way `membershipFailure` normalises them:
 * `benefits[0].label`, `benefits[0].options[1].value`.
 */

const QUOTA_OPTIONS = (Object.keys(QUOTA_CHOICE_LABEL) as QuotaChoice[]).map((value) => ({
  value,
  label: QUOTA_CHOICE_LABEL[value],
}));

const KIND_ORDER: OptionKind[] = ["free_item", "discount_percent", "special_price", "discount_amount"];

export function BenefitEditor({
  benefits,
  onChange,
  services,
  serviceById,
  products,
  catalogLoading,
  petSpecies,
  errors = {},
}: {
  benefits: BenefitDraft[];
  onChange: (next: BenefitDraft[]) => void;
  services: Service[];
  serviceById: Map<string, Service>;
  products: CatalogItem[];
  catalogLoading: boolean;
  /** The plan's species — the variant tables only offer these. */
  petSpecies: string[];
  errors?: Record<string, string>;
}) {
  const patch = (index: number, changes: Partial<BenefitDraft>) =>
    onChange(benefits.map((benefit, i) => (i === index ? { ...benefit, ...changes } : benefit)));

  const patchOption = (index: number, optionIndex: number, changes: Partial<OptionDraft>) =>
    patch(index, {
      options: benefits[index].options.map((option, j) =>
        j === optionIndex ? { ...option, ...changes } : option,
      ),
    });

  const atLimit = benefits.length >= MEMBERSHIP_LIMITS.maxBenefitsPerPlan;

  return (
    <Card
      title="Benefit"
      description={`${benefits.length} benefit · Satu benefit = satu jatah. Kalau jatahnya bisa dipakai untuk beberapa layanan, tambahkan sebagai opsi "atau", lalu atur harga tiap opsi.`}
    >
      <div className="flex flex-col gap-4">
        {benefits.length === 0 && (
          <p className="text-sm text-muted">
            Belum ada benefit. Paket tanpa benefit tetap bisa dijual, tapi tidak memberi
            potongan apa pun.
          </p>
        )}

        {benefits.map((benefit, index) => {
          const err = (field: string) => errors[`benefits[${index}].${field}`];
          const perk = benefit.type === "perk";

          return (
            <section
              key={benefit.key}
              aria-label={`Benefit ${index + 1}`}
              className="flex flex-col gap-4 rounded-xl border border-border p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-bold">Benefit {index + 1}</h3>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-danger-ink"
                  onClick={() => onChange(benefits.filter((_, i) => i !== index))}
                  aria-label={`Hapus benefit ${index + 1}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Hapus benefit
                </Button>
              </div>

              <SelectBlock<"allowance" | "perk">
                label="Jenis benefit"
                tooltip={BENEFIT_TYPE_TOOLTIP}
                value={benefit.type}
                options={[
                  { value: "allowance", label: "Jatah & potongan" },
                  { value: "perk", label: "Fasilitas" },
                ]}
                onChange={(type) =>
                  patch(index, {
                    type,
                    // Coming back from a perk, start with one option to fill.
                    options:
                      type === "allowance" && benefit.options.length === 0
                        ? [newOptionDraft()]
                        : benefit.options,
                  })
                }
              />

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,13rem)]">
                <TextField
                  label="Nama benefit"
                  required
                  value={benefit.label}
                  placeholder={perk ? "mis. Prioritas booking" : "mis. Basic Grooming"}
                  onChange={(event) => patch(index, { label: event.target.value })}
                  error={err("label")}
                />
                {!perk && (
                  <>
                    <TextField
                      label="Kuota"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={benefit.quotaChoice === "unlimited" ? "" : benefit.quotaCount}
                      placeholder={benefit.quotaChoice === "unlimited" ? "—" : "1"}
                      disabled={benefit.quotaChoice === "unlimited"}
                      onChange={(event) => patch(index, { quotaCount: event.target.value })}
                      error={err("quota.perPeriod") ?? err("quota.total")}
                    />
                    <SelectBlock<QuotaChoice>
                      label="Periode kuota"
                      tooltip={QUOTA_PERIOD_TOOLTIP}
                      value={benefit.quotaChoice}
                      options={QUOTA_OPTIONS}
                      onChange={(value) =>
                        patch(index, {
                          quotaChoice: value,
                          quotaCount:
                            value !== "unlimited" && !benefit.quotaCount ? "1" : benefit.quotaCount,
                        })
                      }
                      error={err("quota")}
                    />
                  </>
                )}
              </div>

              {!perk && (
                <>
                  <div className="flex flex-col gap-3">
                    {benefit.options.map((option, optionIndex) => (
                      <div key={option.key} className="flex flex-col gap-3">
                        {optionIndex > 0 && (
                          <div className="flex items-center gap-3" aria-hidden>
                            <span className="h-px flex-1 bg-border" />
                            <span className="text-xs font-semibold text-muted">ATAU</span>
                            <span className="h-px flex-1 bg-border" />
                          </div>
                        )}
                        <OptionRow
                          option={option}
                          index={index}
                          optionIndex={optionIndex}
                          removable={benefit.options.length > 1}
                          onChange={(changes) => patchOption(index, optionIndex, changes)}
                          onRemove={() =>
                            patch(index, {
                              options: benefit.options.filter((_, j) => j !== optionIndex),
                            })
                          }
                          services={services}
                          serviceById={serviceById}
                          products={products}
                          catalogLoading={catalogLoading}
                          petSpecies={petSpecies}
                          errors={errors}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={benefit.options.length >= MEMBERSHIP_LIMITS.maxOptionsPerBenefit}
                      onClick={() => patch(index, { options: [...benefit.options, newOptionDraft()] })}
                    >
                      <Plus className="size-4" aria-hidden />
                      Opsi lain (atau)
                    </Button>
                    {benefit.options.length > 1 && (
                      <p className="text-sm text-muted">
                        Tiap pemakaian mengambil 1 dari kuota yang sama, opsi mana pun yang dipilih.
                      </p>
                    )}
                  </div>
                  {err("options") && (
                    <p role="alert" className="text-xs font-semibold text-danger">
                      {err("options")}
                    </p>
                  )}

                </>
              )}
            </section>
          );
        })}

        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={atLimit}
            onClick={() => onChange([...benefits, newBenefitDraft()])}
          >
            <Plus className="size-4" aria-hidden />
            Tambah benefit
          </Button>
        </div>

        {benefits.some((benefit) => benefit.id) && (
          <p className="text-sm text-muted">
            Mengubah atau menghapus benefit hanya berlaku untuk kartu yang dijual setelahnya.
            Kartu yang sudah terbit memegang salinannya sendiri.
          </p>
        )}
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────── one option */

function OptionRow({
  option,
  index,
  optionIndex,
  removable,
  onChange,
  onRemove,
  services,
  serviceById,
  products,
  catalogLoading,
  petSpecies,
  errors,
}: {
  option: OptionDraft;
  index: number;
  optionIndex: number;
  removable: boolean;
  onChange: (changes: Partial<OptionDraft>) => void;
  onRemove: () => void;
  services: Service[];
  serviceById: Map<string, Service>;
  products: CatalogItem[];
  catalogLoading: boolean;
  petSpecies: string[];
  errors: Record<string, string>;
}) {
  const err = (field: string) => errors[`benefits[${index}].options[${optionIndex}].${field}`];
  const named = option.scope.serviceIds.map((id) => serviceById.get(id)).filter(Boolean) as Service[];
  const priced = named.find((service) => service.hasVariants) ?? named[0];
  const homeService = named.some(isHomeService);
  const specialAllowed = specialPriceAllowed(option.scope);

  const kindOptions = KIND_ORDER.map((kind) => ({
    value: kind,
    label: OPTION_KIND_LABEL[kind],
    disabled: kind === "special_price" && !specialAllowed && option.kind !== "special_price",
  }));

  /** Seed "Beda per varian" from the service's own grid, so the rows line up. */
  const seedVariantRows = () =>
    serviceVariantPrices(priced)
      .filter(
        (row) =>
          petSpecies.length === 0 || petSpecies.includes(parseVariantKey(row.variantKey).species),
      )
      .map((row) => ({ variantKey: row.variantKey, price: "" }));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">Opsi {optionIndex + 1}</p>
        {removable && (
          <Button
            type="button"
            variant="ghost"
            className="size-9"
            onClick={onRemove}
            aria-label={`Hapus opsi ${optionIndex + 1} dari benefit ${index + 1}`}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      <BenefitScopeField
        scope={option.scope}
        onChange={(scope) => onChange({ scope })}
        services={services}
        products={products}
        loading={catalogLoading}
        error={err("scope")}
      />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <SelectField
          label="Perlakuan harga"
          value={option.kind}
          options={kindOptions}
          onChange={(value) =>
            onChange({
              kind: value as OptionKind,
              // The old number means something else under a new kind.
              value: "",
              priceMode: "same",
              variantPrices: [],
            })
          }
          hint={
            option.kind === "special_price" && !specialAllowed
              ? "Harga khusus butuh layanan atau produk tertentu."
              : undefined
          }
          error={err("kind")}
        />

        {option.kind === "free_item" && (
          <p className="self-end pb-3 text-sm text-muted">Harga jadi Rp 0.</p>
        )}
        {option.kind === "discount_percent" && (
          <TextField
            label="Diskon (%)"
            inputMode="decimal"
            value={option.value}
            placeholder="10"
            onChange={(event) => onChange({ value: event.target.value })}
            error={err("value")}
          />
        )}
        {option.kind === "discount_amount" && (
          <TextField
            label="Potongan (Rp)"
            inputMode="decimal"
            value={option.value}
            placeholder="20.000"
            onChange={(event) => onChange({ value: event.target.value })}
            hint="Tidak pernah melebihi harga barisnya."
            error={err("value")}
          />
        )}
        {option.kind === "special_price" && option.priceMode === "same" && (
          <TextField
            label="Harga member (Rp)"
            inputMode="decimal"
            value={option.value}
            placeholder="120.000"
            onChange={(event) => onChange({ value: event.target.value })}
            error={err("value")}
          />
        )}
        {option.kind === "special_price" && option.priceMode === "variant" && (
          <TextField
            label="Harga cadangan (Rp)"
            inputMode="decimal"
            value={option.value}
            placeholder="Opsional"
            onChange={(event) => onChange({ value: event.target.value })}
            hint="Dipakai kalau varian hewannya tidak ada di tabel."
            error={err("value")}
          />
        )}
      </div>

      {(option.kind === "special_price" || homeService) && (
        <div className="flex flex-wrap gap-4">
          {option.kind === "special_price" && (
            <FieldBlock label="Harga khusus">
              <Segmented
                ariaLabel={`Harga khusus opsi ${optionIndex + 1}`}
                value={option.priceMode}
                options={(["same", "variant"] as const).map((mode) => ({
                  value: mode,
                  label: OPTION_PRICE_MODE_LABEL[mode],
                }))}
                onChange={(priceMode) =>
                  onChange({
                    priceMode,
                    variantPrices:
                      priceMode === "variant" && option.variantPrices.length === 0
                        ? seedVariantRows()
                        : option.variantPrices,
                  })
                }
              />
            </FieldBlock>
          )}
          {homeService && (
            <FieldBlock
              label="Biaya kunjungan"
              tooltip="Untuk layanan di rumah pelanggan: Gratis membebaskan biaya kunjungan (TRV) perjalanan itu saat opsi ini dipakai."
            >
              <Segmented
                ariaLabel={`Biaya kunjungan opsi ${optionIndex + 1}`}
                value={option.visitFee}
                options={(["free", "zone"] as const).map((fee) => ({
                  value: fee,
                  label: VISIT_FEE_LABEL[fee],
                }))}
                onChange={(visitFee) => onChange({ visitFee })}
              />
            </FieldBlock>
          )}
        </div>
      )}

      {option.kind === "special_price" && option.priceMode === "variant" && (
        <VariantPriceTable
          rows={option.variantPrices}
          onChange={(variantPrices) => onChange({ variantPrices })}
          species={petSpecies}
          normalPrice={priced ? (key) => servicePriceFor(priced, key) : undefined}
          priceLabel="Harga member"
          ariaLabel={`Harga member per varian, opsi ${optionIndex + 1}`}
          error={err("variantPrices")}
        />
      )}
    </div>
  );
}
