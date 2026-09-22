"use client";

import type { ReactNode } from "react";

import { Alert, Button, Spinner } from "@/components";
import {
  InvoiceFooterForm,
  StockSettingsForm,
  TaxSettingsForm,
  useTenant,
} from "@/features/tenant";
import type { Tenant } from "@/types/api";

import type { SettingsTab } from "../paths";
import { SettingsPageHeader } from "./SettingsHeader";
import { HubPendingCard } from "./SettingsHubCards";

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
function TenantSettingsPage({
  tab,
  title,
  description,
  children,
}: {
  tab: SettingsTab;
  title: string;
  description: string;
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
        <div className="flex max-w-3xl flex-col gap-6">
          {children(tenant, refetch)}
        </div>
      )}
    </div>
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
        <>
          <InvoiceFooterForm tenant={tenant} onSaved={refetch} />
          <HubPendingCard
            title="Nomor dokumen"
            description="Format penomoran faktur, transfer, dan koreksi — awalan, panjang, dan kapan nomornya mengulang."
            blockedBy="Penomoran masih ditentukan server"
          />
        </>
      )}
    </TenantSettingsPage>
  );
}
