"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Breadcrumb,
  Card,
  CheckRow,
  CheckRowGroup,
  FilterMultiSelect,
  FilterSelect,
  FormActionBar,
  SelectField,
  TextField,
  TextareaField,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBranchOptions } from "@/features/inventory/hooks/useBranchOptions";
import { usePetOptions } from "@/hooks/usePetOptions";
import { swalToast } from "@/lib/swal";
import { membershipService } from "@/services/membership.service";
import type { AttachTo, Eligibility, MembershipPlan, PlanPriceMode } from "@/types/membership";
import { multiplyDecimals } from "@/utils/decimal";

import { membershipFailure } from "../errors";
import { useMembershipCatalog } from "../hooks/useMembershipCatalog";
import {
  ATTACH_TO_HINT,
  ATTACH_TO_LABEL,
  DURATION_MONTH_PRESETS,
  ELIGIBILITY_HINT,
  ELIGIBILITY_LABEL,
  MEMBERSHIP_HREF,
  PLAN_PRICE_MODE_HINT,
  PLAN_PRICE_MODE_LABEL,
  PROMOSI_HREF,
  planHref,
} from "../labels";
import {
  draftToPayload,
  normalizeMoney,
  planBlockedReason,
  planToDraft,
  type PlanDraft,
} from "../planDraft";
import { parseVariantKey, serviceVariantPrices } from "../variantKey";
import { BenefitEditor } from "./BenefitEditor";
import { FieldBlock, Segmented } from "./FormBits";
import { PlanPreview } from "./PlanPreview";
import { VariantPriceTable } from "./VariantPriceTable";

/**
 * Add or edit a membership package — the V1 builder (BO prototype `paketForm`).
 *
 * FOUR CARDS ON THE LEFT, A STICKY PREVIEW ON THE RIGHT (stacked under the form
 * on a phone): Info paket · Siapa yang bisa beli dan pakai · Benefit ·
 * Tampilan publik. The preview is the point of the layout — it says back, as
 * a buyer will read it, what the fields add up to.
 *
 * ONE FORM FOR BOTH ACTIONS. `plan` present means edit; the API's PATCH takes
 * exactly what its POST does. Benefit and option ids travel back with the
 * payload — that is what keeps every redemption attached across an edit.
 *
 * The state is a `PlanDraft` (strings, as the inputs hold them) and every rule
 * that turns it into the API payload lives in `planDraft.ts`, tested on its own.
 */
export function MembershipPlanForm({ plan }: { plan?: MembershipPlan }) {
  const router = useRouter();
  const editing = Boolean(plan);

  const [draft, setDraft] = useState<PlanDraft>(() => planToDraft(plan));
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { choices } = usePetOptions();
  const { branches } = useBranchOptions();
  const catalog = useMembershipCatalog();

  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const blockedReason = planBlockedReason(draft);
  const variantPlan = draft.attachTo === "pet" && draft.priceMode === "variant";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (blockedReason) return;
    setSubmitting(true);
    setFieldErrors({});

    try {
      const payload = draftToPayload(draft, { editing });
      const saved = editing
        ? await membershipService.updatePlan(plan!.id, payload)
        : await membershipService.createPlan(payload);

      swalToast(editing ? "Paket membership tersimpan." : "Paket membership dibuat.", "success");
      router.push(planHref(saved.id));
      router.refresh();
    } catch (err) {
      const failure = membershipFailure(err, "Gagal menyimpan paket membership. Coba lagi.");
      /* Lebih lama dari toast "tersimpan": penolakan harus sempat dibaca. */
      swalToast(failure.toast, "error", 6000);
      setFieldErrors(failure.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  const speciesChoices = choices("species", draft.petSpecies);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Breadcrumb
            items={[
              { label: "Promosi", href: PROMOSI_HREF },
              { label: "Membership", href: MEMBERSHIP_HREF },
              { label: editing ? (plan!.code || plan!.name) : "Paket baru" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold">
            {editing ? plan!.name : "Paket membership baru"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Harga, siapa yang boleh beli, lalu jatah benefit per periode. Pratinjau di kanan
            ikut berubah.
          </p>
        </div>

        <FormActionBar
          submitLabel="Simpan paket"
          submitting={submitting}
          disabled={Boolean(blockedReason)}
          blockedReason={blockedReason}
          cancelHref={editing ? planHref(plan!.id) : MEMBERSHIP_HREF}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* ───────────────────────────────────────────── Info paket */}
          <Card title="Info paket">
            <div className="grid gap-4">
              <TextField
                label="Nama paket"
                required
                value={draft.name}
                placeholder="mis. Explorer – New Member"
                onChange={(event) => set("name", event.target.value)}
                error={fieldErrors.name}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Kode"
                  value={draft.code}
                  placeholder="Otomatis"
                  onChange={(event) => set("code", event.target.value)}
                  error={fieldErrors.code}
                  hint="Kosongkan untuk nomor otomatis (MSP-0001). Bisa diubah manual."
                />

                <div className="flex flex-col gap-2">
                  <TextField
                    label="Durasi (bulan)"
                    required
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={draft.durationMonths}
                    onChange={(event) => set("durationMonths", event.target.value)}
                    error={fieldErrors.durationMonths ?? fieldErrors.durationDays}
                    hint={
                      plan && plan.durationMonths === null
                        ? `Paket lama tercatat ${plan.durationDays} hari. Menyimpan mengubahnya ke hitungan bulan untuk kartu baru.`
                        : "Dihitung dari tanggal aktivasi, bukan bulan kalender."
                    }
                  />
                  <div className="flex flex-wrap gap-1">
                    {DURATION_MONTH_PRESETS.map((months) => (
                      <Button
                        key={months}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => set("durationMonths", String(months))}
                      >
                        {months === 12 ? "1 tahun" : `${months} bulan`}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <FieldBlock label="Status">
                <Segmented
                  ariaLabel="Status paket"
                  value={draft.isActive ? "on" : "off"}
                  options={[
                    { value: "on", label: "Aktif" },
                    { value: "off", label: "Nonaktif" },
                  ]}
                  onChange={(value) => set("isActive", value === "on")}
                />
              </FieldBlock>

              <FieldBlock
                label="Harga"
                required
                tooltip={PLAN_PRICE_MODE_HINT}
                error={fieldErrors.priceMode}
              >
                <Segmented<PlanPriceMode>
                  ariaLabel="Mode harga"
                  value={variantPlan ? "variant" : "fixed"}
                  options={[
                    { value: "fixed", label: PLAN_PRICE_MODE_LABEL.fixed },
                    {
                      value: "variant",
                      label: PLAN_PRICE_MODE_LABEL.variant,
                      disabled: draft.attachTo !== "pet",
                    },
                  ]}
                  onChange={(value) => set("priceMode", value)}
                />
              </FieldBlock>

              {variantPlan ? (
                <VariantPriceTable
                  rows={draft.variantPrices}
                  onChange={(rows) => set("variantPrices", rows)}
                  species={draft.petSpecies}
                  priceLabel="Harga paket"
                  ariaLabel="Harga paket per varian"
                  error={fieldErrors.variantPrices}
                  toolbar={
                    <AutoFill
                      services={catalog.services.filter((service) => service.hasVariants)}
                      onFill={(serviceId, times) => {
                        const service = catalog.serviceById.get(serviceId);
                        const rows = serviceVariantPrices(service).filter(
                          (row) =>
                            draft.petSpecies.length === 0 ||
                            draft.petSpecies.includes(parseVariantKey(row.variantKey).species),
                        );
                        const filled = new Map(
                          draft.variantPrices.map((row) => [row.variantKey, row.price]),
                        );
                        for (const row of rows) {
                          filled.set(
                            row.variantKey,
                            normalizeMoney(multiplyDecimals(row.price, String(times))),
                          );
                        }
                        set(
                          "variantPrices",
                          [...filled].map(([variantKey, price]) => ({ variantKey, price })),
                        );
                      }}
                    />
                  }
                />
              ) : (
                <TextField
                  label="Harga paket (Rp)"
                  required
                  inputMode="decimal"
                  value={draft.price}
                  placeholder="450.000"
                  onChange={(event) => set("price", event.target.value)}
                  error={fieldErrors.price}
                  className="max-w-64"
                />
              )}

              <TextField
                label="Tawarkan perpanjangan (hari sebelum berakhir)"
                type="number"
                min={0}
                value={draft.renewalOfferDays}
                onChange={(event) => set("renewalOfferDays", event.target.value)}
                error={fieldErrors.renewalOfferDays}
                className="max-w-64"
              />

              <TextareaField
                label="Deskripsi"
                value={draft.description}
                onChange={(event) => set("description", event.target.value)}
                error={fieldErrors.description}
                rows={3}
              />
            </div>
          </Card>

          {/* ───────────────────────────────────── Siapa */}
          <Card title="Siapa yang bisa beli dan pakai">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldBlock label="Melekat ke" tooltip={ATTACH_TO_HINT} error={fieldErrors.attachTo}>
                <Segmented<AttachTo>
                  ariaLabel="Melekat ke"
                  value={draft.attachTo}
                  options={(["pet", "customer"] as const).map((value) => ({
                    value,
                    label: ATTACH_TO_LABEL[value],
                  }))}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      attachTo: value,
                      // Per-variant pricing follows an animal; a customer has none.
                      priceMode: value === "customer" ? "fixed" : current.priceMode,
                    }))
                  }
                />
              </FieldBlock>

              {draft.attachTo === "pet" ? (
                <FilterMultiSelect
                  layout="form"
                  label="Jenis hewan"
                  values={draft.petSpecies}
                  options={speciesChoices.map((choice) => ({
                    value: choice.value,
                    label: choice.label,
                  }))}
                  onApply={(values) => set("petSpecies", values)}
                  onReset={() => set("petSpecies", [])}
                  formatValue={(values, options) =>
                    values.length === 0
                      ? "Semua jenis"
                      : values
                          .map((value) => options.find((option) => option.value === value)?.label)
                          .filter(Boolean)
                          .join(", ")
                  }
                  error={fieldErrors.petSpecies}
                />
              ) : (
                <p className="self-end pb-3 text-sm text-muted">
                  Berlaku untuk semua hewan pelanggan itu.
                </p>
              )}

              <SelectField
                label="Syarat pembeli"
                value={draft.eligibility}
                options={(Object.keys(ELIGIBILITY_LABEL) as Eligibility[]).map((value) => ({
                  value,
                  label: ELIGIBILITY_LABEL[value],
                }))}
                onChange={(value) => set("eligibility", value as Eligibility)}
                hint={ELIGIBILITY_HINT}
                error={fieldErrors.eligibility}
              />

              <FilterMultiSelect
                layout="form"
                label="Berlaku di cabang"
                values={draft.branchIds}
                options={branches.map((branch) => ({ value: branch._id, label: branch.name }))}
                onApply={(values) => set("branchIds", values)}
                onReset={() => set("branchIds", [])}
                formatValue={(values, options) =>
                  values.length === 0
                    ? "Semua cabang"
                    : values.length <= 2
                      ? values
                          .map((value) => options.find((option) => option.value === value)?.label ?? "—")
                          .join(", ")
                      : `${values.length} cabang`
                }
                hint="Kosongkan untuk semua cabang."
                error={fieldErrors.branchIds}
              />
            </div>
          </Card>

          {/* ───────────────────────────────────── Benefit */}
          <BenefitEditor
            benefits={draft.benefits}
            onChange={(benefits) => set("benefits", benefits)}
            services={catalog.services}
            serviceById={catalog.serviceById}
            products={catalog.products}
            catalogLoading={catalog.loading}
            petSpecies={draft.attachTo === "pet" ? draft.petSpecies : []}
            errors={fieldErrors}
          />

          {/* ───────────────────────────────────── Tampilan publik */}
          <Card title="Tampilan publik" description="Halaman /membership di website.">
            <div className="flex flex-col gap-4">
              <CheckRowGroup>
                <CheckRow
                  label="Tampil di halaman /membership"
                  description="Paket ini muncul di website dan bisa dibeli dari sana."
                  checked={draft.publicVisible}
                  onCheckedChange={(checked) => set("publicVisible", checked)}
                />
                <CheckRow
                  label="Featured (kartu disorot)"
                  description="Kartunya ditonjolkan di antara paket lain."
                  checked={draft.publicFeatured}
                  onCheckedChange={(checked) => set("publicFeatured", checked)}
                />
              </CheckRowGroup>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Urutan tampil"
                  type="number"
                  min={0}
                  value={draft.publicOrder}
                  onChange={(event) => set("publicOrder", event.target.value)}
                  error={fieldErrors["publicDisplay.order"]}
                />
                <TextField
                  label="Label badge"
                  value={draft.publicBadge}
                  placeholder="mis. Paling laris"
                  onChange={(event) => set("publicBadge", event.target.value)}
                  error={fieldErrors["publicDisplay.badge"]}
                />
              </div>

              <div className="rounded-lg bg-tint-info p-3 text-sm">
                <p className="font-semibold">Harga coret tidak diisi di sini</p>
                <p className="mt-1 text-muted">
                  Untuk menampilkan harga coret di website, buat promo Harga coret untuk paket
                  ini. Harga coret selalu punya periode, jadi angkanya jujur dan potongannya
                  tercatat sebagai biaya promo.
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-20">
          <PlanPreview
            draft={draft}
            serviceById={catalog.serviceById}
            productName={(id) => catalog.products.find((product) => product.id === id)?.name}
          />
        </div>
      </div>
    </form>
  );
}

/**
 * "Isi otomatis dari [layanan] × N" — the package price per variant taken from
 * a service's own grid, times N (a "bayar 5" prepaid package). Merges into the
 * table: a variant already typed for another key stays.
 */
function AutoFill({
  services,
  onFill,
}: {
  services: { _id: string; name: string }[];
  onFill: (serviceId: string, times: number) => void;
}) {
  const [serviceId, setServiceId] = useState("");
  const [times, setTimes] = useState("5");
  const count = Number.parseInt(times, 10);

  if (services.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-hover p-3">
      <FilterSelect
        layout="field"
        label="Isi otomatis dari"
        active={false}
        placeholder="Pilih layanan"
        value={serviceId}
        options={services.map((service) => ({ value: service._id, label: service.name }))}
        onChange={setServiceId}
        className="min-w-56"
      />
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">Dikali</span>
        <Input
          type="number"
          min={1}
          value={times}
          onChange={(event) => setTimes(event.target.value)}
          className="h-10 w-20 tabular-nums"
          aria-label="Dikali berapa"
        />
      </label>
      <Button
        type="button"
        variant="secondary"
        disabled={!serviceId || !(count > 0)}
        onClick={() => onFill(serviceId, count)}
      >
        Isi
      </Button>
    </div>
  );
}
