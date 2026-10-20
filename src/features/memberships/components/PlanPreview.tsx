"use client";

import { useMemo, useState } from "react";

import { FilterSelect } from "@/components";
import { usePetOptions } from "@/hooks/usePetOptions";
import type { Service } from "@/types/api";

import {
  ATTACH_TO_LABEL,
  ELIGIBILITY_LABEL,
  VISIT_FEE_LABEL,
  formatRupiah,
  quotaText,
} from "../labels";
import {
  choiceToQuota,
  estimatePlan,
  normalizeMoney,
  rupiahString,
  type OptionDraft,
  type PlanDraft,
} from "../planDraft";
import { isHomeService } from "../hooks/useMembershipCatalog";
import {
  parseVariantKey,
  serviceVariantPrices,
  variantKeyLabel,
} from "../variantKey";
import { scopeSummary } from "./BenefitScopeField";

/**
 * THE PLAN AS A BUYER WILL SEE IT, beside the form and updating as it is typed
 * (BO prototype `paketPreview`): the price, three short tags, what the package
 * gives — and what it is WORTH to the owner if every allowance is used, per
 * pet variant.
 *
 * THE ESTIMATE ONLY COUNTS WHAT IT CAN PRICE: an option that names a specific
 * service, read off that service's own price grid. A kelompok, "semua add-on"
 * or a product has no single normal price, and an unlimited benefit has no
 * count — both are left out and the footnote says so, rather than the figure
 * quietly inventing them.
 */
export function PlanPreview({
  draft,
  serviceById,
  productName,
}: {
  draft: PlanDraft;
  serviceById: Map<string, Service>;
  productName: (id: string) => string | undefined;
}) {
  const { label } = usePetOptions();
  const months = Number.parseInt(draft.durationMonths, 10) || 0;
  const variantPlan = draft.attachTo === "pet" && draft.priceMode === "variant";

  const keyName = (key: string) => variantKeyLabel(key, (type, id) => label(type, id));
  const nameOf = (id: string) => serviceById.get(id)?.name ?? productName(id);

  /* The variants the estimate can be read for. */
  const variantKeys = useMemo(() => {
    const keys = new Set<string>();
    if (variantPlan) {
      draft.variantPrices.forEach((row) => row.variantKey && keys.add(row.variantKey));
    }
    for (const benefit of draft.benefits) {
      for (const option of benefit.options) {
        for (const id of option.scope.serviceIds) {
          serviceVariantPrices(serviceById.get(id)).forEach((row) => keys.add(row.variantKey));
        }
      }
    }
    return [...keys].filter(
      (key) =>
        draft.attachTo === "customer" ||
        draft.petSpecies.length === 0 ||
        draft.petSpecies.includes(parseVariantKey(key).species),
    );
  }, [draft, serviceById, variantPlan]);

  const [picked, setPicked] = useState("");
  const variantKey = variantKeys.includes(picked) ? picked : (variantKeys[0] ?? "");

  const priceable = draft.benefits.some(
    (benefit) =>
      benefit.type === "allowance" &&
      benefit.options.some((option) => option.scope.serviceIds.length > 0),
  );
  const estimate = estimatePlan(draft, variantKey || null, serviceById);

  const priceRows = draft.variantPrices
    .map((row) => normalizeMoney(row.price))
    .filter(Boolean)
    .map(Number);
  const priceText = variantPlan
    ? priceRows.length
      ? `mulai ${formatRupiah(rupiahString(Math.min(...priceRows)))}`
      : "Harga per varian"
    : normalizeMoney(draft.price)
      ? formatRupiah(normalizeMoney(draft.price))
      : "Rp —";

  const species =
    draft.attachTo === "customer"
      ? null
      : draft.petSpecies.length
        ? draft.petSpecies.map((id) => label("species", id) ?? "").filter(Boolean).join(" & ")
        : "Semua jenis";

  return (
    <aside
      aria-label="Pratinjau paket"
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
    >
      <div className="flex flex-col gap-2 bg-primary p-5 text-primary-foreground">
        <p className="text-xs font-semibold tracking-widest text-primary-foreground/75 uppercase">
          Pratinjau · kasir & website
        </p>
        <h3 className="text-xl font-extrabold text-primary-foreground">
          {draft.name.trim() || "Paket tanpa nama"}
        </h3>
        <p className="text-3xl font-extrabold tracking-tight tabular-nums">
          {priceText}{" "}
          <span className="text-sm font-medium tracking-normal text-primary-foreground/75">
            / {months || "—"} bulan
          </span>
        </p>
        <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Ringkas">
          <Tag>Melekat ke {ATTACH_TO_LABEL[draft.attachTo].toLowerCase()}</Tag>
          <Tag>{ELIGIBILITY_LABEL[draft.eligibility]}</Tag>
          {species && <Tag>{species}</Tag>}
          {draft.publicVisible && draft.publicBadge.trim() && <Tag>{draft.publicBadge.trim()}</Tag>}
        </ul>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <section className="flex flex-col gap-3">
          <h4 className="border-b border-border pb-3 text-xs font-medium text-muted">
            Yang didapat
          </h4>
          {draft.benefits.length === 0 ? (
            <p className="text-sm text-muted">Belum ada benefit.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {draft.benefits.map((benefit) => (
                <li key={benefit.key} className="text-sm">
                  <p>
                    <span className="font-semibold">{benefit.label.trim() || "Benefit tanpa nama"}</span>
                    {benefit.type === "perk" ? (
                      <span className="ml-1.5 text-xs font-semibold text-warning">fasilitas</span>
                    ) : (
                      <span className="ml-1.5 text-xs font-semibold text-warning">
                        {quotaText(choiceToQuota(benefit.quotaChoice, benefit.quotaCount))}
                      </span>
                    )}
                  </p>
                  {benefit.type === "allowance" &&
                    benefit.options.map((option, j) => (
                      <p key={option.key}>
                        {j > 0 && <span className="text-xs font-semibold text-muted">atau </span>}
                        {optionText(option, nameOf, serviceById)}
                      </p>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-xl bg-tint-warning p-4">
          <h4 className="text-xs font-medium text-muted">
            Estimasi nilai untuk owner
          </h4>
          {!priceable ? (
            <p className="text-sm text-muted">
              Estimasi muncul setelah ada opsi yang memilih layanan tertentu.
            </p>
          ) : (
            <>
              {variantKeys.length > 0 && (
                <FilterSelect
                  label="Varian"
                  value={variantKey}
                  options={variantKeys.map((key) => ({ value: key, label: keyName(key) }))}
                  onChange={setPicked}
                  active={false}
                  ariaLabel="Varian untuk estimasi"
                />
              )}
              <dl className="flex flex-col gap-1 text-sm">
                <Line label="Nilai jatah per bulan" value={formatRupiah(rupiahString(estimate.perMonth))} />
                <Line label={`Selama ${months || "—"} bulan`} value={formatRupiah(rupiahString(estimate.total))} />
                <Line
                  label="Harga paket"
                  value={estimate.price === null ? "—" : formatRupiah(rupiahString(estimate.price))}
                />
              </dl>
              <p className="text-sm font-semibold text-warning">
                {estimate.price === null
                  ? "Harga paket untuk varian ini belum diisi"
                  : estimate.price <= 0
                    ? "Paket gratis"
                    : (estimate.saving ?? 0) >= 0
                      ? `Pelanggan hemat hingga ${formatRupiah(rupiahString(estimate.saving ?? 0))}`
                      : `Nilai jatah ${formatRupiah(rupiahString(-(estimate.saving ?? 0)))} di bawah harga`}
              </p>
              <p className="text-xs text-muted">
                Kalau semua jatah dipakai, opsi paling mahal
                {estimate.hasUnlimited ? ". Benefit tanpa batas tidak dihitung" : ""}
                {estimate.hasUnpriced ? ". Opsi per kelompok, add-on, atau produk tidak dihitung" : ""}.
              </p>
            </>
          )}
        </section>
      </div>
    </aside>
  );
}

/** "Basic Grooming — gratis, biaya kunjungan gratis" — one option, as the buyer reads it. */
export function optionText(
  option: OptionDraft,
  nameOf: (id: string) => string | undefined,
  serviceById: Map<string, Service>,
): string {
  const what = scopeSummary(option.scope, nameOf);
  const value = normalizeMoney(option.value);
  const how =
    option.kind === "free_item"
      ? "gratis"
      : option.kind === "discount_percent"
        ? `diskon ${option.value || "…"}%`
        : option.kind === "discount_amount"
          ? `potongan ${value ? formatRupiah(value) : "Rp …"}`
          : option.priceMode === "variant"
            ? "harga khusus per varian"
            : value
              ? formatRupiah(value)
              : "harga khusus";

  const home = option.scope.serviceIds.some((id) => isHomeService(serviceById.get(id)));
  const visit = home ? `, biaya kunjungan ${VISIT_FEE_LABEL[option.visitFee].toLowerCase()}` : "";

  return `${what} — ${how}${visit}`;
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded-full bg-primary-foreground/15 px-2.5 py-1 text-xs font-semibold text-primary-foreground">
      {children}
    </li>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt>{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
