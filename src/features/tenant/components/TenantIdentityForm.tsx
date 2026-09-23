"use client";

import { useState } from "react";

import { Card, TextField } from "@/components";
import { Button as UIButton } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { tenantService } from "@/services/tenant.service";
import type { Tenant, TenantIdentityInput } from "@/types/api";

/**
 * WHO THIS BUSINESS IS — the name on the sign, the name on the paper, and the
 * NPWP (22 September 2026).
 *
 * IT USED TO BE UNEDITABLE, and not on principle: `PATCH /tenants/me` accepted
 * `settings` only, and the route that could rename a business is platform
 * administration this dashboard must not touch. The route learned identity, so
 * the screen stopped being read-only.
 *
 * WHAT IS STILL NOT HERE: the slug, which is a public URL other links depend on,
 * and the plan and currency, which are what the business is billed on.
 *
 * THE LEGAL NAME IS OPTIONAL AND THE INVOICE FALLS BACK TO THE TRADING NAME. A
 * sole trader has no second name to give, and a required field would put an
 * invented legal entity on a tax document.
 *
 * THE NPWP IS TAKEN AS TYPED. The format has changed twice — fifteen digits,
 * then a sixteen-digit NIK-based one — and shops write it with dots and dashes
 * or without. A validator that refused a number somebody is holding in their
 * hand would be wrong more often than the typo it caught.
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
    timezone: tenant.timezone,
  };

  const [name, setName] = useState(stored.name);
  const [legalName, setLegalName] = useState(stored.legalName);
  const [taxId, setTaxId] = useState(stored.taxId);
  const [saving, setSaving] = useState(false);

  const nameError = name.trim() === "" ? "Nama usaha tidak boleh kosong" : undefined;

  const changed =
    name !== stored.name ||
    legalName !== stored.legalName ||
    taxId !== stored.taxId;

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
    <Card
      title="Identitas usaha"
      description="Yang tercetak di faktur dan dipakai di seluruh cabang."
    >
      <Can
        feature="tenants"
        action="update"
        fallback={
          <dl className="flex flex-col gap-2 text-sm">
            <IdentityRow label="Nama usaha" value={stored.name} />
            <IdentityRow label="Nama badan hukum" value={stored.legalName} />
            <IdentityRow label="NPWP" value={stored.taxId} />
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

          {/*
            THE ZONE IS NOT A FIELD HERE, although the route accepts it: changing
            it moves the day boundary every shift close and daily report is cut
            on, so it is a conversation with the Buloo team rather than a box on
            a form. It is shown, read-only, on the profile above.
          */}

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
