"use client";

import { useState } from "react";

import { Card, TextField } from "@/components";
import { Button as UIButton } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { tenantService } from "@/services/tenant.service";
import type { Tenant, TenantSettings } from "@/types/api";

/**
 * HOW THIS BUSINESS CHARGES TAX — the two settings that decide what a customer
 * pays.
 *
 * WHY IT NEEDED A SCREEN AT ALL. Both have lived on the tenant document since
 * the till was built, read on every sale, and neither could be seen or changed
 * from anywhere in the app. That was survivable while `priceIncludesTax: true`
 * (the default, and the Indonesian shelf-price norm) was the only value anybody
 * used. It stopped being survivable when invoices could be raised by hand: a
 * business set the wrong way bills 11% off on every invoice, and nothing on any
 * screen would say why.
 *
 * `priceIncludesTax` IS THE ONE THAT SURPRISES PEOPLE, so the copy states the
 * consequence rather than the setting. "Termasuk" means the shelf price IS what
 * the customer pays and the tax is unwound out of it; "belum termasuk" means the
 * tax is added on top and every total goes up. Those are different bills, not
 * different displays.
 *
 * GATED ON `tenants:update`, a different grant from the `read` that opens this
 * page. Reading the business profile and changing how it bills are two rights —
 * and the route behind this carries the same gate, so a hidden form is a
 * courtesy rather than the control.
 *
 * IT DOES NOT RESTATE HISTORY, and the hint says so. Every posted sale stored
 * the base and the tax it was charged with; changing this moves the NEXT one.
 * Somebody who thought otherwise would flip it to "fix" last month and find
 * nothing had moved.
 */
export function TaxSettingsForm({
  tenant,
  onSaved,
}: {
  tenant: Tenant;
  /**
   * Called after a successful save. Takes nothing: the parent re-reads the
   * tenant rather than trusting a response body, so a value handed over here
   * would be a promise the caller does not keep.
   */
  onSaved: () => void;
}) {
  const current = tenant.settings;

  const [taxRate, setTaxRate] = useState(String(current.taxRate ?? 0));
  const [inclusive, setInclusive] = useState(
    // `!== false`, matching the server: a tenant that has never set it prices
    // inclusive of tax.
    current.priceIncludesTax !== false,
  );
  const [saving, setSaving] = useState(false);

  const changed =
    taxRate !== String(current.taxRate ?? 0) ||
    inclusive !== (current.priceIncludesTax !== false);

  const rateError =
    taxRate.trim() === "" || Number.isNaN(Number(taxRate))
      ? "Isi angka persennya"
      : Number(taxRate) < 0 || Number(taxRate) > 100
        ? "Antara 0 dan 100"
        : undefined;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!changed || rateError) return;

    setSaving(true);

    try {
      const patch: Partial<TenantSettings> = {
        taxRate: Number(taxRate),
        priceIncludesTax: inclusive,
      };

      await tenantService.updateSettings(patch);
      // Released before the parent re-renders: this form stays mounted, and a
      // button locked forever is worse than the error that locked it.
      setSaving(false);
      onSaved();
      swalToast("Setelan pajak tersimpan.");
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
      title="Pajak"
      description="Menentukan berapa yang dibayar pelanggan di kasir dan di faktur."
    >
      <Can
        feature="tenants"
        action="update"
        fallback={
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Tarif PPN</dt>
              <dd className="tabular-nums">{current.taxRate ?? 0}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Harga katalog</dt>
              <dd>
                {current.priceIncludesTax !== false
                  ? "Sudah termasuk PPN"
                  : "Belum termasuk PPN"}
              </dd>
            </div>
            <p className="mt-2 text-xs text-muted">
              Role Anda tidak bisa mengubah setelan ini.
            </p>
          </dl>
        }
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <TextField
            label="Tarif PPN"
            name="taxRate"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={taxRate}
            onChange={(event) => setTaxRate(event.target.value)}
            error={rateError}
            hint="Dalam persen. Isi 0 kalau toko ini tidak memungut PPN."
            disabled={saving}
          />

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="priceIncludesTax">
                Harga katalog sudah termasuk PPN
              </Label>
              <p className="mt-1 max-w-prose text-xs text-muted">
                {inclusive
                  ? "Harga di label rak adalah yang dibayar pelanggan — PPN diurai dari dalamnya."
                  : "PPN ditambahkan di atas harga katalog, jadi yang dibayar pelanggan lebih besar dari angka di label."}{" "}
                Mengubahnya <strong>tidak</strong> mengubah transaksi yang sudah
                terjadi — masing-masing menyimpan DPP dan PPN saat diposting.
              </p>
            </div>
            <Switch
              id="priceIncludesTax"
              checked={inclusive}
              onCheckedChange={setInclusive}
              disabled={saving}
            />
          </div>

          <div className="flex justify-end">
            <UIButton
              type="submit"
              size="lg"
              disabled={saving || !changed || Boolean(rateError)}
            >
              {saving ? "Menyimpan…" : "Simpan setelan pajak"}
            </UIButton>
          </div>
        </form>
      </Can>
    </Card>
  );
}
