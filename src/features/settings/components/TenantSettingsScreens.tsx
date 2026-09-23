"use client";

import type { ReactNode } from "react";

import { Alert, Button, Spinner } from "@/components";
import {
  InvoiceFooterForm,
  StockSettingsForm,
  TaxSettingsForm,
  TenantIdentityForm,
  useTenant,
} from "@/features/tenant";
import { cn } from "@/lib/utils";
import type { Tenant } from "@/types/api";

import type { SettingsTab } from "../paths";
import { SettingsPageHeader } from "./SettingsHeader";

/**
 * The three Pengaturan pages that are one tenant switch each — Pajak, Stok &
 * kasir, Faktur & dokumen.
 *
 * THE FORMS DID NOT CHANGE, ONLY THEIR ADDRESS. All three sat stacked on the
 * read-only "Business information" page until 22 September 2026; the mockup
 * files Pajak under Keuangan, and the other two went behind cards on Umum (the
 * mockup has no place for them, and that is where the user asked them to go).
 * Each form still gates its own Simpan on `tenants:update`.
 */
export function TenantSettingsPage({
  tab,
  title,
  description,
  /**
   * Pajak, Stok & kasir and Faktur & dokumen are one switch or one short field
   * each, and `max-w-3xl` is what keeps a lone control from stretching across
   * a laptop screen. Identitas usaha outgrew that the day it gained a
   * two-column row of pickers (23 September 2026, on request) — a grid that
   * wants the width the page actually has.
   */
  fullWidth = false,
  children,
}: {
  tab: SettingsTab;
  title: string;
  description: string;
  fullWidth?: boolean;
  children: (tenant: Tenant, refetch: () => void) => ReactNode;
}) {
  const { tenant, loading, error, refetch } = useTenant();

  return (
    <div className="flex flex-col gap-6">
      <SettingsPageHeader tab={tab} title={title} description={description} />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat pengaturan…
        </div>
      ) : error || !tenant ? (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="error">
            {error ?? "Pengaturan tidak bisa dimuat."}
          </Alert>
          <Button variant="secondary" onClick={refetch}>
            Coba lagi
          </Button>
        </div>
      ) : (
        <div
          className={cn("flex flex-col gap-6", !fullWidth && "max-w-3xl")}
        >
          {children(tenant, refetch)}
        </div>
      )}
    </div>
  );
}

export function IdentitySettingsScreen() {
  return (
    <TenantSettingsPage
      tab="umum"
      title="Identitas usaha"
      description="Berlaku untuk seluruh cabang. Alamat yang tercetak di struk diatur per cabang, bukan di sini."
      fullWidth
    >
      {(tenant, refetch) => (
        <TenantIdentityForm tenant={tenant} onSaved={refetch} />
      )}
    </TenantSettingsPage>
  );
}

export function TaxSettingsScreen() {
  return (
    <TenantSettingsPage
      tab="keuangan"
      title="Pajak"
      description="Tarif bawaan untuk transaksi baru. Transaksi lama tetap memakai tarif saat dicatat."
    >
      {(tenant, refetch) => (
        <TaxSettingsForm tenant={tenant} onSaved={refetch} />
      )}
    </TenantSettingsPage>
  );
}

export function StockCashierSettingsScreen() {
  return (
    <TenantSettingsPage
      tab="umum"
      title="Stok & kasir"
      description="Aturan stok yang berlaku di semua cabang dan semua cara menjual."
    >
      {(tenant, refetch) => (
        <StockSettingsForm tenant={tenant} onSaved={refetch} />
      )}
    </TenantSettingsPage>
  );
}

export function DocumentSettingsScreen() {
  return (
    <TenantSettingsPage
      tab="umum"
      title="Faktur & dokumen"
      description="Yang tercetak di faktur. Catatan kaki struk kasir diatur per cabang."
    >
      {(tenant, refetch) => (
        <InvoiceFooterForm tenant={tenant} onSaved={refetch} />
      )}
    </TenantSettingsPage>
  );
}
