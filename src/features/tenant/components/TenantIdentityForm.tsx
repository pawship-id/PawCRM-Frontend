"use client";

import { useState } from "react";

import { Alert, Card, SelectField, TextField } from "@/components";
import { Button as UIButton } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { tenantService } from "@/services/tenant.service";
import type {
  DateFormat,
  FiscalYearStartMonth,
  Tenant,
  TenantIdentityInput,
  Timezone,
} from "@/types/api";
import { DATE_FORMATS } from "@/types/api";

import {
  CURRENCY_OPTIONS,
  FISCAL_YEAR_OPTIONS,
  TIMEZONE_OPTIONS,
  currencyLabel,
  fiscalYearLabel,
  timezoneLabel,
} from "../locale";

/**
 * WHO THIS BUSINESS IS, AND HOW IT READS ITS OWN NUMBERS — the name on the
 * sign, the name on the paper, the NPWP (22 September 2026), and its timezone,
 * currency, date format and fiscal year (23 September 2026).
 *
 * IT USED TO BE UNEDITABLE, and not on principle: `PATCH /tenants/me` accepted
 * `settings` only, and the route that could rename a business is platform
 * administration this dashboard must not touch. The route learned identity,
 * then it learned locale — timezone, currency, date format and fiscal year are
 * the shop's own choice, not something Buloo sets on its behalf.
 *
 * WHAT IS STILL NOT HERE: the slug, a public URL other links depend on, and the
 * plan, which is what the business is billed on. Those stay platform
 * administration.
 *
 * THE LEGAL NAME IS OPTIONAL AND THE INVOICE FALLS BACK TO THE TRADING NAME. A
 * sole trader has no second name to give, and a required field would put an
 * invented legal entity on a tax document.
 *
 * THE NPWP IS TAKEN AS TYPED. The format has changed twice — fifteen digits,
 * then a sixteen-digit NIK-based one — and shops write it with dots and dashes
 * or without. A validator that refused a number somebody is holding in their
 * hand would be wrong more often than the typo it caught.
 *
 * DATE FORMAT AND FISCAL YEAR ARE STORED WITH NOTHING READING THEM YET — the
 * same shape `NotificationSettingsForm` uses, and the form says so under both
 * fields rather than implying they already change something.
 */
export function TenantIdentityForm({
  tenant,
  onSaved,
}: {
  tenant: Tenant;
  /** Called after a successful save; the parent re-reads the tenant. */
  onSaved: () => void;
}) {
  const stored = {
    name: tenant.name,
    legalName: tenant.legalName ?? "",
    taxId: tenant.taxId ?? "",
    timezone: tenant.timezone as Timezone,
    currency: tenant.currency,
    // Defaults mirror the schema's own — a tenant written before either field
    // existed reads back without the key at all (`.lean()` skips defaults).
    dateFormat: (tenant.dateFormat ?? "DD MMM YYYY") as DateFormat,
    fiscalYearStartMonth: String(tenant.fiscalYearStartMonth ?? 1),
  };

  const [name, setName] = useState(stored.name);
  const [legalName, setLegalName] = useState(stored.legalName);
  const [taxId, setTaxId] = useState(stored.taxId);
  const [timezone, setTimezone] = useState(stored.timezone);
  const [currency, setCurrency] = useState(stored.currency);
  const [dateFormat, setDateFormat] = useState(stored.dateFormat);
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState(
    stored.fiscalYearStartMonth,
  );
  const [saving, setSaving] = useState(false);

  const nameError = name.trim() === "" ? "Nama usaha tidak boleh kosong" : undefined;

  const changed =
    name !== stored.name ||
    legalName !== stored.legalName ||
    taxId !== stored.taxId ||
    timezone !== stored.timezone ||
    currency !== stored.currency ||
    dateFormat !== stored.dateFormat ||
    fiscalYearStartMonth !== stored.fiscalYearStartMonth;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!changed || nameError) return;

    setSaving(true);

    try {
      /*
        ONLY WHAT CHANGED. The server audits an identity change with the fields
        it was sent, before and after, so sending the untouched ones would fill
        the trail with rows saying a name went from itself to itself.
      */
      const patch: TenantIdentityInput = {};
      if (name !== stored.name) patch.name = name.trim();
      if (legalName !== stored.legalName) patch.legalName = legalName.trim();
      if (taxId !== stored.taxId) patch.taxId = taxId.trim();
      if (timezone !== stored.timezone) patch.timezone = timezone;
      if (currency !== stored.currency) patch.currency = currency;
      if (dateFormat !== stored.dateFormat) patch.dateFormat = dateFormat;
      if (fiscalYearStartMonth !== stored.fiscalYearStartMonth) {
        patch.fiscalYearStartMonth = Number(
          fiscalYearStartMonth,
        ) as FiscalYearStartMonth;
      }

      await tenantService.updateIdentity(patch);
      // Released before the parent re-renders — see TaxSettingsForm.
      setSaving(false);
      onSaved();
      swalToast("Identitas usaha tersimpan.");
    } catch (error) {
      swalToast(
        error instanceof ApiError
          ? error.message
          : "Terjadi kesalahan. Coba lagi.",
        "error",
        8000,
      );
      setSaving(false);
    }
  }

  return (
    // NO title/description HERE: the page header above already says
    // "Identitas usaha" — this Card would only repeat it.
    <Card>
      <Can
        feature="tenants"
        action="update"
        fallback={
          <dl className="flex flex-col gap-2 text-sm">
            <IdentityRow label="Nama usaha" value={stored.name} />
            <IdentityRow label="Nama badan hukum" value={stored.legalName} />
            <IdentityRow label="NPWP" value={stored.taxId} />
            <IdentityRow
              label="Zona waktu"
              value={timezoneLabel(stored.timezone)}
            />
            <IdentityRow
              label="Mata uang"
              value={currencyLabel(stored.currency)}
            />
            <IdentityRow label="Format tanggal" value={stored.dateFormat} />
            <IdentityRow
              label="Tahun buku"
              value={fiscalYearLabel(Number(stored.fiscalYearStartMonth))}
            />
            <p className="mt-2 text-xs text-muted">
              Role Anda tidak bisa mengubah identitas usaha.
            </p>
          </dl>
        }
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <TextField
            label="Nama usaha"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={nameError}
            hint="Nama yang muncul di kiri atas dan di semua ekspor."
            disabled={saving}
          />

          <TextField
            label="Nama badan hukum"
            name="legalName"
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
            hint="Yang tercetak di faktur. Kosongkan kalau usahanya atas nama perorangan — faktur akan memakai nama usaha."
            disabled={saving}
          />

          <TextField
            label="NPWP"
            name="taxId"
            value={taxId}
            onChange={(event) => setTaxId(event.target.value)}
            hint="Ditulis apa adanya, pakai titik dan strip atau tidak. Tercetak di faktur kalau diisi."
            disabled={saving}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Zona waktu"
              value={timezone}
              onChange={(value) => setTimezone(value as Timezone)}
              options={TIMEZONE_OPTIONS}
              disabled={saving}
            />
            <SelectField
              label="Mata uang"
              value={currency}
              onChange={setCurrency}
              options={CURRENCY_OPTIONS}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Format tanggal"
              value={dateFormat}
              onChange={(value) => setDateFormat(value as DateFormat)}
              options={DATE_FORMATS.map((value) => ({ value, label: value }))}
              disabled={saving}
            />
            <SelectField
              label="Tahun buku"
              value={fiscalYearStartMonth}
              onChange={setFiscalYearStartMonth}
              options={FISCAL_YEAR_OPTIONS}
              disabled={saving}
            />
          </div>

          <Alert variant="info">
            <strong>Zona waktu menentukan batas hari.</strong> Mengubahnya
            menggeser jam tutup shift dan batas laporan harian. Transaksi lama
            tidak ikut bergeser.
          </Alert>

          <div className="flex justify-end">
            <UIButton
              type="submit"
              size="lg"
              disabled={saving || !changed || Boolean(nameError)}
            >
              {saving ? "Menyimpan…" : "Simpan identitas"}
            </UIButton>
          </div>
        </form>
      </Can>
    </Card>
  );
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value || "—"}</dd>
    </div>
  );
}
