"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Breadcrumb,
  Card,
  CheckRow,
  CheckRowGroup,
  FIELD_HEIGHT,
  FilterMultiSelect,
  FilterSelect,
  FormActionBar,
  SelectField,
  TextField,
  TextareaField,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useBranchOptions } from "@/features/inventory/hooks/useBranchOptions";
import { usePetOptions } from "@/hooks/usePetOptions";
import { swalToast } from "@/lib/swal";
import { membershipService } from "@/services/membership.service";
import type { AttachTo, Eligibility, MembershipPlan, PlanPriceMode } from "@/types/membership";
import { cn } from "@/lib/utils";
import { multiplyDecimals } from "@/utils/decimal";

import { membershipFailure } from "../errors";
import { useMembershipCatalog } from "../hooks/useMembershipCatalog";
import {
  ATTACH_TO_HINT,
  ATTACH_TO_LABEL,
  ELIGIBILITY_HINT,
  ELIGIBILITY_LABEL,
  MEMBERSHIP_HREF,
  PLAN_PRICE_MODE_LABEL,
  PROMOSI_SUMMARY_HREF,
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
import { FieldBlock, SelectBlock } from "./FormBits";
import { PlanAccountingCard, useTenantRecognition } from "./PlanAccountingCard";
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
  const tenantRecognition = useTenantRecognition();

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
      const payload = draftToPayload(draft, { editing, tenantRecognition });
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
              { label: "Promosi", href: PROMOSI_SUMMARY_HREF },
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
          className="ml-auto"
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
              {/* Baris 1 — Kode · Nama paket */}
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldBlock
                  label="Kode"
                  tooltip="Kosongkan untuk nomor otomatis (MSP-0001)."
                  error={fieldErrors.code}
                >
                  <Input
                    aria-label="Kode paket"
                    aria-invalid={Boolean(fieldErrors.code) || undefined}
                    value={draft.code}
                    placeholder="Otomatis"
                    onChange={(event) => set("code", event.target.value)}
                    className={cn(
                      FIELD_HEIGHT,
                      fieldErrors.code && "border-danger focus-visible:ring-danger/40",
                    )}
                  />
                </FieldBlock>
                <TextField
                  label="Nama paket"
                  required
                  value={draft.name}
                  placeholder="mis. Explorer – New Member"
                  onChange={(event) => set("name", event.target.value)}
                  error={fieldErrors.name}
                />
              </div>

              {/* Baris 2 — Deskripsi */}
              <TextareaField
                label="Deskripsi"
                value={draft.description}
                onChange={(event) => set("description", event.target.value)}
                error={fieldErrors.description}
                rows={3}
              />

              {/* Baris 3 — Durasi · Tawarkan perpanjangan */}
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldBlock
                  label="Durasi"
                  required
                  tooltip={
                    plan && plan.durationMonths === null
                      ? `Masa berlaku dihitung dari tanggal aktivasi, bukan bulan kalender. Paket lama ini tercatat ${plan.durationDays} hari; menyimpan mengubahnya ke hitungan bulan untuk kartu baru.`
                      : "Masa berlaku dihitung dari tanggal aktivasi, bukan bulan kalender."
                  }
                  error={fieldErrors.durationMonths ?? fieldErrors.durationDays}
                >
                  <SuffixInput
                    ariaLabel="Durasi dalam bulan"
                    suffix="bulan"
                    value={draft.durationMonths}
                    invalid={Boolean(fieldErrors.durationMonths ?? fieldErrors.durationDays)}
                    onChange={(value) => set("durationMonths", value.replace(/[^\d]/g, ""))}
                  />
                </FieldBlock>

                <FieldBlock
                  label="Tawarkan perpanjangan"
                  tooltip="Berapa hari sebelum masa berlaku habis anggota masuk daftar perpanjangan di Ringkasan."
                  error={fieldErrors.renewalOfferDays}
                >
                  <SuffixInput
                    ariaLabel="Tawarkan perpanjangan, hari sebelum berakhir"
                    suffix="hari sebelum berakhir"
                    value={draft.renewalOfferDays}
                    invalid={Boolean(fieldErrors.renewalOfferDays)}
                    onChange={(value) => set("renewalOfferDays", value.replace(/[^\d]/g, ""))}
                  />
                </FieldBlock>
              </div>

              {/* Baris 4 — Status */}
              <FieldBlock label="Status">
                <label className="flex w-fit cursor-pointer items-center gap-3">
                  <Switch
                    aria-label="Paket aktif"
                    checked={draft.isActive}
                    onCheckedChange={(checked) => set("isActive", checked)}
                  />
                  <span className="text-sm">
                    {draft.isActive ? "Aktif — bisa dijual di kasir" : "Nonaktif — tidak dijual"}
                  </span>
                </label>
              </FieldBlock>

              {/* Baris 5 — Jenis harga · Harga paket (satu harga) */}
              <div className={cn("grid gap-4", !variantPlan && "sm:grid-cols-2")}>
                <SelectField
                  label="Jenis harga"
                  required
                  value={variantPlan ? "variant" : "fixed"}
                  options={[
                    { value: "fixed", label: PLAN_PRICE_MODE_LABEL.fixed },
                    {
                      value: "variant",
                      label: PLAN_PRICE_MODE_LABEL.variant,
                      disabled: draft.attachTo !== "pet",
                    },
                  ]}
                  onChange={(value) => set("priceMode", value as PlanPriceMode)}
                  error={fieldErrors.priceMode}
                  hint={
                    draft.attachTo !== "pet"
                      ? "Per varian hewan hanya untuk paket yang melekat ke hewan."
                      : undefined
                  }
                />

                {!variantPlan && (
                  <TextField
                    label="Harga paket (Rp)"
                    required
                    inputMode="decimal"
                    value={draft.price}
                    placeholder="450.000"
                    onChange={(event) => set("price", event.target.value)}
                    error={fieldErrors.price}
                  />
                )}
              </div>

              {variantPlan && (
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
                          [...filled].map(([variantKey, price]) => ({
                            variantKey,
                            price,
                          })),
                        );
                      }}
                    />
                  }
                />
              )}
            </div>
          </Card>

          {/* ───────────────────────────────────── Siapa */}
          <Card title="Siapa yang bisa beli dan pakai">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectBlock<AttachTo>
                label="Melekat ke"
                tooltip={ATTACH_TO_HINT}
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
                error={fieldErrors.attachTo}
              />

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

              <SelectBlock<Eligibility>
                label="Syarat pembeli"
                tooltip={ELIGIBILITY_HINT}
                value={draft.eligibility}
                options={(Object.keys(ELIGIBILITY_LABEL) as Eligibility[]).map((value) => ({
                  value,
                  label: ELIGIBILITY_LABEL[value],
                }))}
                onChange={(value) => set("eligibility", value)}
                error={fieldErrors.eligibility}
              />

              <FilterMultiSelect
                layout="form"
                label="Berlaku di cabang"
                values={draft.branchIds}
                options={branches.map((branch) => ({
                  value: branch._id,
                  label: branch.name,
                }))}
                onApply={(values) => set("branchIds", values)}
                onReset={() => set("branchIds", [])}
                formatValue={(values, options) =>
                  values.length === 0
                    ? "Semua cabang"
                    : values.length <= 2
                      ? values
                          .map(
                            (value) =>
                              options.find((option) => option.value === value)?.label ?? "—",
                          )
                          .join(", ")
                      : `${values.length} cabang`
                }
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

          {/* ───────────────────────────────────── Pengakuan pendapatan */}
          <PlanAccountingCard
            draft={draft}
            onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            disabled={submitting}
          />

          {/* ───────────────────────────────────── Tampilan publik */}
          <Card title="Tampilan publik" description="Halaman membership di website toko.">
            <div className="flex flex-col gap-4">
              <CheckRowGroup>
                <CheckRow
                  label="Tampil di website"
                  description="Paket ini muncul di website dan bisa dibeli dari sana."
                  checked={draft.publicVisible}
                  onCheckedChange={(checked) => set("publicVisible", checked)}
                />
                <CheckRow
                  label="Tonjolkan paket ini"
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
                  label="Label sorotan"
                  value={draft.publicBadge}
                  placeholder="mis. Paling laris"
                  onChange={(event) => set("publicBadge", event.target.value)}
                  error={fieldErrors["publicDisplay.badge"]}
                />
              </div>

              <div className="rounded-lg bg-tint-info p-3 text-sm">
                <p className="font-semibold">Harga coret tidak diisi di sini</p>
                <p className="mt-1 text-muted">
                  Untuk menampilkan harga coret di website, buat promo Harga coret untuk paket ini.
                  Harga coret selalu punya periode, jadi angkanya jujur dan potongannya tercatat
                  sebagai biaya promo.
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
 * "SALIN HARGA DARI LAYANAN" — a typing shortcut for the per-variant price
 * table, and NOTHING ELSE: the grid of one service, times N (a "bayar 5×"
 * prepaid package), copied into the rows once.
 *
 * IT USED TO SIT OPEN AS "Isi otomatis dari [layanan]", and read as if the
 * package belonged to that service (26 October 2026, on request: "jangan
 * sampai ambigu"). It is now folded behind a button marked optional, and the
 * open box says in words that it copies prices only — what a member may use
 * is the Benefit card's business — and that later price changes do not follow.
 *
 * MERGES into the table: a variant the service does not price stays as typed.
 */
function AutoFill({
  services,
  onFill,
}: {
  services: { _id: string; name: string }[];
  onFill: (serviceId: string, times: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [times, setTimes] = useState("1");
  const count = Number.parseInt(times, 10);

  if (services.length === 0) return null;

  if (!open) {
    return (
      <div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Salin harga dari layanan (opsional)
        </Button>
      </div>
    );
  }

  const name = services.find((service) => service._id === serviceId)?.name;

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-hover p-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">Salin harga dari layanan</p>
        <p className="max-w-prose text-sm text-muted">
          Hanya untuk mengisi tabel harga di bawah dengan cepat: harga tiap varian layanan
          dikali jumlah yang Anda isi. Ini <strong>tidak</strong> membatasi paket ke layanan
          tersebut. Apa yang bisa dipakai anggota diatur di bagian Benefit. Kalau harga
          layanan berubah nanti, harga paket tidak ikut berubah.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect
          layout="field"
          label="Layanan"
          active={false}
          placeholder="Pilih layanan"
          value={serviceId}
          options={services.map((service) => ({
            value: service._id,
            label: service.name,
          }))}
          onChange={setServiceId}
          className="min-w-56"
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold">Dikali (jumlah sesi)</span>
          <Input
            type="number"
            min={1}
            value={times}
            onChange={(event) => setTimes(event.target.value)}
            className="h-10 w-24 tabular-nums"
            aria-label="Dikali berapa"
          />
        </label>
        <Button
          type="button"
          disabled={!serviceId || !(count > 0)}
          onClick={() => {
            onFill(serviceId, count);
            swalToast(
              `Harga ${name ?? "layanan"} × ${count} disalin ke tabel. Ubah per baris kalau perlu.`,
            );
            setOpen(false);
          }}
        >
          Salin ke tabel
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Tutup
        </Button>
      </div>
    </div>
  );
}

/**
 * A number box with its unit drawn inside the same border, on the right
 * ("6 | bulan") — so nobody has to guess whether Durasi is in days or months.
 * The unit is part of the control, not a second label.
 */
function SuffixInput({
  ariaLabel,
  suffix,
  value,
  invalid = false,
  onChange,
}: {
  ariaLabel: string;
  suffix: string;
  value: string;
  invalid?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div
      className={cn(
        FIELD_HEIGHT,
        "flex items-stretch overflow-hidden rounded-md border border-input bg-surface shadow-xs transition-[color,box-shadow]",
        "focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/50",
        invalid && "border-danger focus-within:ring-danger/40",
      )}
    >
      <input
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent px-3 text-base tabular-nums outline-none md:text-sm"
      />
      <span className="flex items-center border-l border-input bg-background px-4 text-sm font-semibold text-muted">
        {suffix}
      </span>
    </div>
  );
}
