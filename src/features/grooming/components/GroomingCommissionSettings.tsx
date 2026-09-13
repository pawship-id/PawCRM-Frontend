"use client";

import Link from "next/link";

import { Card } from "@/components";
import { Badge } from "@/components/ui/badge";

import { GROOMING_CATALOG_PATH } from "../paths";
import {
  COMMISSION_EXAMPLE,
  exampleCommission,
  formatRupiah,
  PET_SIZES,
  SIZE_WORDS,
  type DraftErrors,
  type ExampleLine,
  type FlatRuleDraft,
  type GroomingSettingsDraft,
} from "../settings";
import type { GroomingSettings } from "@/types/api";
import { ChoiceCards, SwitchRow, UnitField } from "./GroomingSettingsControls";

type Update = (
  change: (current: GroomingSettingsDraft) => GroomingSettingsDraft,
) => void;

/**
 * The Komisi sub-tab's main column — decided 13 September 2026: ONE rule for
 * the whole shop, replacing a rate on every staff member.
 *
 * Only the service's rule is computed today. The add-on rule is too; the
 * travel rule is stored and says plainly that nothing earns it yet.
 */
export function GroomingCommissionSettings({
  draft,
  errors,
  update,
  disabled,
  mayOpenCatalog,
}: {
  draft: GroomingSettingsDraft;
  errors: DraftErrors;
  update: Update;
  disabled: boolean;
  mayOpenCatalog: boolean;
}) {
  const service = draft.service;

  function setFlat(key: "addon" | "travel", patch: Partial<FlatRuleDraft>) {
    update((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Komisi layanan"
        description="Dihitung dari tiap hewan yang dikerjakan, lalu dibagi ke tahapan layanannya."
      >
        <div className="flex flex-col gap-5">
          <ChoiceCards
            legend="Cara menghitung"
            value={service.mode}
            onChange={(mode) =>
              update((current) => ({
                ...current,
                service: { ...current.service, mode },
              }))
            }
            options={[
              {
                value: "percentage",
                label: "Persentase dari harga",
                description: "Ikut naik kalau harga jasanya naik.",
              },
              {
                value: "size_nominal",
                label: "Nominal per ukuran",
                description: "Rupiah tetap untuk hewan kecil, sedang, dan besar.",
              },
            ]}
            disabled={disabled}
          />

          {service.mode === "percentage" ? (
            <UnitField
              label="Persentase komisi"
              value={service.percent}
              onChange={(percent) =>
                update((current) => ({
                  ...current,
                  service: { ...current.service, percent },
                }))
              }
              inputMode="decimal"
              suffix="% dari harga jasa"
              error={errors["service.percent"]}
              disabled={disabled}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {PET_SIZES.map((size) => (
                <UnitField
                  key={size}
                  label={SIZE_WORDS[size]}
                  value={service.sizeNominal[size]}
                  onChange={(value) =>
                    update((current) => ({
                      ...current,
                      service: {
                        ...current.service,
                        sizeNominal: {
                          ...current.service.sizeNominal,
                          [size]: value,
                        },
                      },
                    }))
                  }
                  prefix="Rp"
                  error={errors[`service.${size}`]}
                  disabled={disabled}
                />
              ))}
            </div>
          )}

          {/*
            THE WEIGHTS ARE NOT HERE, and the bar says where they are. A Basic
            is mostly bath and a Styling mostly scissors, so the split belongs to
            each service rather than to one shop-wide ratio.
          */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-tint-neutral px-4 py-3 text-sm text-muted">
            <span>Bobot tiap tahapan diisi di masing-masing layanan, bukan di sini.</span>
            {mayOpenCatalog && (
              <Link
                href={GROOMING_CATALOG_PATH}
                className="rounded font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Buka Layanan &amp; Harga →
              </Link>
            )}
          </div>
        </div>
      </Card>

      <Card
        title="Komisi add-on"
        description="Add-on yang ditempel ke layanan, mis. Spa Aromaterapi."
      >
        <FlatRuleFields
          rule={draft.addon}
          errorKey="addon"
          errors={errors}
          disabled={disabled}
          switchLabel="Add-on ikut menghasilkan komisi"
          switchHint="Kalau mati, add-on tidak menambah komisi siapa pun."
          percentSuffix="% dari harga add-on"
          fixedSuffix="per add-on terjual"
          onChange={(patch) => setFlat("addon", patch)}
        />
      </Card>

      <Card
        title="Komisi perjalanan"
        description="Untuk yang berangkat ke rumah pelanggan."
        action={
          <Badge variant="outline" className="border-transparent bg-tint-neutral text-muted">
            Belum dihitung
          </Badge>
        }
      >
        <FlatRuleFields
          rule={draft.travel}
          errorKey="travel"
          errors={errors}
          disabled={disabled}
          switchLabel="Yang berangkat dapat komisi perjalanan"
          /*
            SAID WHETHER THE SWITCH IS ON OR OFF. A rule that saves and then
            pays nobody is the kind of thing a shop finds out on payday.
          */
          switchHint="Belum dihitung — zona dan trip belum ada di sistem. Aturannya disimpan dulu supaya siap dipakai."
          percentSuffix="% dari tarif zona"
          fixedSuffix="per trip"
          onChange={(patch) => setFlat("travel", patch)}
        />
      </Card>
    </div>
  );
}

function FlatRuleFields({
  rule,
  errorKey,
  errors,
  disabled,
  switchLabel,
  switchHint,
  percentSuffix,
  fixedSuffix,
  onChange,
}: {
  rule: FlatRuleDraft;
  errorKey: "addon" | "travel";
  errors: DraftErrors;
  disabled: boolean;
  switchLabel: string;
  switchHint: string;
  percentSuffix: string;
  fixedSuffix: string;
  onChange: (patch: Partial<FlatRuleDraft>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <SwitchRow
        label={switchLabel}
        hint={switchHint}
        checked={rule.enabled}
        onCheckedChange={(enabled) => onChange({ enabled })}
        disabled={disabled}
      />

      {rule.enabled && (
        <>
          <ChoiceCards
            legend="Cara menghitung"
            value={rule.mode}
            onChange={(mode) => onChange({ mode })}
            options={[
              { value: "percentage", label: "Persentase" },
              { value: "fixed", label: "Nominal tetap" },
            ]}
            disabled={disabled}
          />

          {rule.mode === "percentage" ? (
            <UnitField
              label="Persentase komisi"
              value={rule.percent}
              onChange={(percent) => onChange({ percent })}
              inputMode="decimal"
              suffix={percentSuffix}
              error={errors[`${errorKey}.percent`]}
              disabled={disabled}
            />
          ) : (
            <UnitField
              label="Nominal komisi"
              value={rule.fixed}
              onChange={(fixed) => onChange({ fixed })}
              prefix="Rp"
              suffix={fixedSuffix}
              error={errors[`${errorKey}.fixed`]}
              disabled={disabled}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * The right-hand panel: one fixed visit, worked through with the draft's rule.
 *
 * TRAVEL IS SHOWN AND LEFT OUT OF THE TOTAL. Hiding it would hide what the rule
 * will do; adding it would promise money nothing pays yet.
 */
export function GroomingCommissionExample({
  settings,
}: {
  settings: GroomingSettings;
}) {
  const example = COMMISSION_EXAMPLE;
  const result = exampleCommission(settings);

  return (
    <section
      aria-labelledby="grooming-commission-example"
      className="rounded-xl bg-primary p-6 text-primary-foreground shadow-md"
    >
      <h2 id="grooming-commission-example" className="text-base font-bold">
        Contoh perhitungan
      </h2>
      <p className="mt-1 text-sm text-primary-foreground/80">
        {example.serviceName} · {SIZE_WORDS[example.size]} ·{" "}
        <span className="tabular-nums">{formatRupiah(example.servicePrice)}</span>,
        ditambah {example.addonName}{" "}
        <span className="tabular-nums">{formatRupiah(example.addonPrice)}</span>,
        kunjungan rumah {example.zoneName}{" "}
        <span className="tabular-nums">{formatRupiah(example.zoneFee)}</span>.
      </p>

      <dl className="mt-4">
        <ExampleRow label="Komisi layanan" line={result.service} />
        <ExampleRow label="Komisi add-on" line={result.addon} />
        <ExampleRow
          label="Komisi perjalanan"
          line={result.travel}
          note="Belum dihitung · tidak ikut total"
          muted
        />

        <div className="flex items-end justify-between gap-4 border-t border-primary-foreground/30 pt-4">
          <dt className="text-sm font-semibold">Total dibagi ke tim</dt>
          <dd className="text-2xl font-extrabold tabular-nums">
            {formatRupiah(result.total)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-primary-foreground/80">
        Dibagi ke tahapan menurut bobot di layanannya. Yang mengerjakan tahapan
        yang sama dapat bagian rata.
      </p>
    </section>
  );
}

function ExampleRow({
  label,
  line,
  note,
  muted = false,
}: {
  label: string;
  line: ExampleLine;
  note?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-primary-foreground/20 py-3">
      <dt className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {line.basis && (
          <span className="block text-xs tabular-nums text-primary-foreground/80">
            {line.basis}
          </span>
        )}
        {note && (
          <span className="mt-1 inline-block rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-foreground">
            {note}
          </span>
        )}
      </dt>
      <dd
        className={
          muted
            ? "text-sm tabular-nums text-primary-foreground/80"
            : "text-sm font-semibold tabular-nums"
        }
      >
        {line.amount === null ? "—" : formatRupiah(line.amount)}
      </dd>
    </div>
  );
}
