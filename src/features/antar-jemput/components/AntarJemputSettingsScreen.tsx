"use client";

import Link from "next/link";

import { Alert, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/permissions";
import { GroomingModuleHeader } from "@/features/grooming/components/GroomingModuleHeader";
import { GroomingSharedSettingsCard } from "@/features/grooming/components/GroomingSharedSettingsCard";
import {
  ChoiceCards,
  UnitField,
} from "@/features/grooming/components/GroomingSettingsControls";
import { formatMoney } from "@/utils/decimal";

import { useAntarJemputSettings } from "../hooks/useAntarJemputSettings";
import { ANTAR_JEMPUT_LINE } from "../line";
import { ANTAR_JEMPUT_CATALOG_PATH } from "../paths";
import {
  commissionOn,
  draftToSettings,
  type AntarJemputSettingsDraft,
  type RuleDraft,
  type SettingsErrors,
} from "../settings";

/** The mockup's worked example: one Zona A pickup with one add-on. */
const EXAMPLE_PRICE = 45_000;
const EXAMPLE_ADDON = 15_000;

/**
 * Layanan › Antar-Jemput › Pengaturan — from `buloo-antar-jemput-v5.html`.
 *
 * TWO CARDS, THE MOCKUP'S: Komisi Layanan (a percentage of the ride's price, or
 * a flat nominal) and Komisi Add-on (the same two ways). NO ON/OFF SWITCH — the
 * mockup's own note: a rate of 0 is no commission, and a second control for one
 * fact is a place for the two to disagree.
 *
 * Saved on the tenant (`settings.antarJemput`) and read by the commission run
 * for every booking that is a ride; split across the ride's tahapan by the
 * weights its service carries — which is why the tahapan themselves are set on
 * each service, not here.
 *
 * The page is `tenants:read`; saving is `tenants:update`, as on Grooming's.
 */
export function AntarJemputSettingsScreen() {
  const { can } = usePermissions();
  const mayUpdate = can("tenants", "update");
  const mayOpenCatalog = can("services", "read");
  const state = useAntarJemputSettings();
  const { draft, settings } = state;
  const invalid = Object.keys(state.errors).length > 0;

  const header = (
    <GroomingModuleHeader
      line={ANTAR_JEMPUT_LINE}
      action={
        draft && mayUpdate ? (
          <>
            {state.dirty && invalid && (
              <p className="max-w-xs self-center text-xs text-muted">
                Belum bisa disimpan: <b className="font-semibold">isiannya belum benar</b>
              </p>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={!state.dirty || state.saving}
              onClick={state.discard}
            >
              Batalkan perubahan
            </Button>
            <Button
              type="button"
              disabled={!state.dirty || invalid || state.saving}
              onClick={() => void state.save()}
            >
              {state.saving && <Spinner size={16} />}
              {state.saving ? "Menyimpan…" : "Simpan pengaturan"}
            </Button>
          </>
        ) : undefined
      }
    />
  );

  if (state.loadError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Alert variant="error">{state.loadError}</Alert>
        <div>
          <Button type="button" variant="secondary" onClick={state.retry}>
            Muat ulang
          </Button>
        </div>
      </div>
    );
  }

  if (!draft || !settings) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat pengaturan antar-jemput…
        </div>
      </div>
    );
  }

  const disabled = !mayUpdate || state.saving;
  const preview = draftToSettings(draft, settings).commission;
  const serviceEarns = commissionOn(preview.service, EXAMPLE_PRICE);
  const addonEarns = commissionOn(preview.addon, EXAMPLE_ADDON);

  return (
    <div className="flex flex-col gap-6">
      {header}

      {!mayUpdate && (
        <Alert variant="info">
          Role Anda hanya bisa melihat pengaturan ini. Mengubahnya perlu izin
          ubah data usaha.
        </Alert>
      )}
      {state.saveError && <Alert variant="error">{state.saveError}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Card
            title="Komisi layanan"
            description="Untuk driver yang menjalankan tahapan perjalanan."
          >
            <RuleFields
              rule={draft.service}
              which="service"
              errors={state.errors}
              disabled={disabled}
              percentLabel="Persentase dari harga layanan"
              fixedLabel="Nominal per perjalanan"
              update={state.update}
            />
            <p className="mt-4 text-sm text-muted">
              Tahapan dan bobotnya diisi di tiap layanan antar-jemput, bukan di
              sini.{" "}
              {mayOpenCatalog && (
                <Link
                  href={ANTAR_JEMPUT_CATALOG_PATH}
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Buka Layanan &amp; Harga →
                </Link>
              )}
            </p>
          </Card>

          <Card
            title="Komisi add-on"
            description="Isi 0 kalau add-on tidak perlu menghasilkan komisi — tidak ada saklar terpisah."
          >
            <RuleFields
              rule={draft.addon}
              which="addon"
              errors={state.errors}
              disabled={disabled}
              percentLabel="Persentase dari harga add-on"
              fixedLabel="Nominal per add-on"
              update={state.update}
            />
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20">
          <Card title="Contoh perhitungan">
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">
                  Perjalanan · <span className="tabular-nums">{formatMoney(String(EXAMPLE_PRICE))}</span>
                </dt>
                <dd className="font-semibold tabular-nums">{formatMoney(String(serviceEarns))}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">
                  + Add-on · <span className="tabular-nums">{formatMoney(String(EXAMPLE_ADDON))}</span>
                </dt>
                <dd className="font-semibold tabular-nums">{formatMoney(String(addonEarns))}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t-2 border-foreground pt-2 font-bold">
                <dt>Komisi driver</dt>
                <dd className="tabular-nums">{formatMoney(String(serviceEarns + addonEarns))}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">
              Dibayarkan setelah perjalanan selesai dan fakturnya terbit, lalu
              dibagi ke tahapan sesuai bobot di layanan.
            </p>
          </Card>
        </aside>
      </div>

      <GroomingSharedSettingsCard mayOpenCatalog={mayOpenCatalog} noun="antar-jemput" />
    </div>
  );
}

function RuleFields({
  rule,
  which,
  errors,
  disabled,
  percentLabel,
  fixedLabel,
  update,
}: {
  rule: RuleDraft;
  which: keyof AntarJemputSettingsDraft;
  errors: SettingsErrors;
  disabled: boolean;
  percentLabel: string;
  fixedLabel: string;
  update: (key: keyof AntarJemputSettingsDraft, patch: Partial<RuleDraft>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <ChoiceCards
        legend="Cara menghitung"
        value={rule.mode}
        onChange={(mode) => update(which, { mode })}
        options={[
          { value: "percentage", label: "Persentase dari harga" },
          { value: "fixed", label: "Nominal tetap" },
        ]}
        disabled={disabled}
      />
      {rule.mode === "percentage" ? (
        <UnitField
          label={percentLabel}
          value={rule.percent}
          onChange={(percent) => update(which, { percent })}
          inputMode="decimal"
          suffix="%"
          error={errors[`${which}.percent`]}
          disabled={disabled}
        />
      ) : (
        <UnitField
          label={fixedLabel}
          value={rule.fixed}
          onChange={(fixed) => update(which, { fixed })}
          prefix="Rp"
          error={errors[`${which}.fixed`]}
          disabled={disabled}
        />
      )}
    </div>
  );
}
