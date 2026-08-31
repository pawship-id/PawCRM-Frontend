"use client";

import { useState } from "react";

import { Card } from "@/components";
import { Button as UIButton } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { tenantService } from "@/services/tenant.service";
import type { Tenant, TenantSettings } from "@/types/api";

/**
 * MAY THIS SHOP SELL WHAT IT DOES NOT HAVE? — one switch, and it decides what a
 * cashier can do at the counter.
 *
 * ON (the default) the till sells an empty shelf and the balance goes negative.
 * That is the honest setting for a petshop: the goods left the room, the
 * customer is holding them, and the usual cause of an empty balance is a
 * delivery nobody has keyed in yet. A till that refused would produce books that
 * disagree with the room AND a queue nobody can serve — and the cashier's
 * workaround (ring it up as something else) hides the gap for good.
 *
 * OFF makes the till the control. The server refuses any sale that would take a
 * shelf below zero, wherever it comes from — the counter, an invoice, a bundle's
 * components — because the rule lives at the one gateway every sale passes
 * through rather than on this screen.
 *
 * THE COPY STATES THE CONSEQUENCE, not the setting, for the reason the tax form
 * gives: "izinkan stok minus" is a phrase somebody has to translate into what
 * happens at the counter. What happens at the counter is the thing they are
 * deciding.
 *
 * IT DOES NOT RESTATE HISTORY, and the hint says so. Turning it off leaves every
 * balance that is already negative where it is — only a receipt or an opname
 * moves those — so somebody who flips it to "fix" last week will find nothing
 * has moved. The Inventory hub is where those rows are listed.
 */
export function StockSettingsForm({
  tenant,
  onSaved,
}: {
  tenant: Tenant;
  /**
   * Called after a successful save. Takes nothing: the parent re-reads the
   * tenant rather than trusting a response body.
   */
  onSaved: () => void;
}) {
  const current = tenant.settings;

  // `!== false`, matching the server: a tenant that has never set it allows it.
  const stored = current.allowNegativeStock !== false;
  const [allowed, setAllowed] = useState(stored);
  const [saving, setSaving] = useState(false);

  const changed = allowed !== stored;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!changed) return;

    setSaving(true);

    try {
      const patch: Partial<TenantSettings> = { allowNegativeStock: allowed };

      await tenantService.updateSettings(patch);
      // Released before the parent re-renders: this form stays mounted, and a
      // button locked forever is worse than the error that locked it.
      setSaving(false);
      onSaved();
      swalToast("Setelan stok tersimpan.");
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
      title="Stok"
      description="Menentukan apa yang bisa dijual kasir saat stok sudah habis."
    >
      <Can
        feature="tenants"
        action="update"
        fallback={
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Barang stok habis</dt>
              <dd>{stored ? "Tetap bisa dijual" : "Tidak bisa dijual"}</dd>
            </div>
            <p className="mt-2 text-xs text-muted">
              Role Anda tidak bisa mengubah setelan ini.
            </p>
          </dl>
        }
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="allowNegativeStock">
                Barang stok habis tetap bisa dijual di kasir
              </Label>
              <p className="mt-1 max-w-prose text-xs text-muted">
                {allowed
                  ? "Kasir tetap bisa menambahkan barang yang stoknya nol, dan saldonya jadi minus setelah dibayar. Barisnya muncul di Inventory, bagian Stok minus, supaya bisa dibereskan."
                  : "Kasir tidak bisa menambahkan barang yang stoknya nol, dan pembayaran ditolak kalau stoknya kurang. Terima dulu barangnya, atau perbaiki lewat Stok Opname."}{" "}
                Mengubahnya <strong>tidak</strong> mengubah stok yang sudah
                minus — itu hanya beres lewat penerimaan barang atau opname.
              </p>
            </div>
            <Switch
              id="allowNegativeStock"
              checked={allowed}
              onCheckedChange={setAllowed}
              disabled={saving}
            />
          </div>

          <div className="flex justify-end">
            <UIButton type="submit" size="lg" disabled={saving || !changed}>
              {saving ? "Menyimpan…" : "Simpan setelan stok"}
            </UIButton>
          </div>
        </form>
      </Can>
    </Card>
  );
}
