"use client";

import { useState } from "react";

import { Alert, Button, Card } from "@/components";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { tenantService } from "@/services/tenant.service";
import type { NotificationSettings, Tenant } from "@/types/api";

import { TenantSettingsPage } from "./TenantSettingsScreens";

/**
 * Pengaturan › Notifikasi — which automatic messages this shop wants sent
 * (23 September 2026).
 *
 * NOTHING SENDS THEM YET, AND THE PAGE SAYS SO IN ITS FIRST LINE. The switches
 * are stored because the decisions are the shop's — which reminders its
 * customers should get — and they are the same decisions whichever provider
 * delivers them. What the page must never do is imply a message went out: a
 * shop that believed its customers were being reminded and found out at a
 * no-show would rather have had no switch at all.
 *
 * EVERY SWITCH STARTS OFF, on the server too. A shop that has never opened this
 * page must not discover it started messaging its customers the day a sender is
 * wired in.
 *
 * WHAT IS NOT HERE: the provider, the credentials, the message templates and the
 * send log. Those belong to the sender when it is built.
 */
interface SwitchSpec {
  key: keyof NotificationSettings;
  title: string;
  hint: string;
}

const SWITCHES: SwitchSpec[] = [
  {
    key: "bookingReminder",
    title: "Pengingat booking H-1",
    hint: "WhatsApp ke pelanggan sehari sebelum jadwalnya.",
  },
  {
    key: "membershipExpiry",
    title: "Membership akan habis",
    hint: "WhatsApp 30 hari sebelum masa berlakunya berakhir.",
  },
  {
    key: "receivableDue",
    title: "Tagihan pelanggan jatuh tempo",
    hint: "WhatsApp ke pelanggan yang fakturnya jatuh tempo.",
  },
  {
    key: "payableDue",
    title: "Faktur pembelian jatuh tempo",
    hint: "Email ke Owner dan Manager sebelum tagihan supplier jatuh tempo.",
  },
  {
    key: "fixedCostDue",
    title: "Biaya tetap jatuh tempo",
    hint: "Biaya tetap yang jatuh tempo dalam 30 hari.",
  },
  {
    key: "lowStock",
    title: "Stok di bawah minimum",
    hint: "Barang yang perlu dipesan ulang.",
  },
  {
    key: "promo",
    title: "Promo dan blast",
    hint: "Hanya ke pelanggan yang mengizinkan promo.",
  },
];

export function NotificationSettingsScreen() {
  return (
    <TenantSettingsPage
      tab="umum"
      title="Notifikasi"
      description="Pengingat otomatis yang ingin dikirim toko ini."
    >
      {(tenant, refetch) => (
        <NotificationSettingsForm tenant={tenant} onSaved={refetch} />
      )}
    </TenantSettingsPage>
  );
}

function NotificationSettingsForm({
  tenant,
  onSaved,
}: {
  tenant: Tenant;
  onSaved: () => void;
}) {
  const stored: NotificationSettings = tenant.settings.notifications ?? {};
  const [draft, setDraft] = useState<NotificationSettings>(() =>
    Object.fromEntries(
      SWITCHES.map(({ key }) => [key, stored[key] === true]),
    ),
  );
  const [saving, setSaving] = useState(false);

  const changed = SWITCHES.some(
    ({ key }) => (draft[key] === true) !== (stored[key] === true),
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!changed) return;

    setSaving(true);

    try {
      // Sent whole: the server flattens `settings` one level, so a partial map
      // would drop every switch this form did not name.
      await tenantService.updateSettings({ notifications: draft });
      setSaving(false);
      onSaved();
      swalToast("Pilihan notifikasi tersimpan.");
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
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/*
        SAID FIRST, not in a footnote. A switch that looks on and sends nothing
        is worse than no switch: the shop stops watching for the thing it thinks
        is handled.
      */}
      <Alert variant="info">
        Belum ada yang mengirim. Pilihan di sini tersimpan, tapi WhatsApp dan
        email otomatis belum dibangun — sampai itu jadi, tidak ada pesan yang
        keluar dari sini.
      </Alert>

      <Card
        title="Pengingat otomatis"
        description="Yang ingin dikirim toko ini begitu pengirimnya siap."
      >
        <div className="flex flex-col">
          {SWITCHES.map(({ key, title, hint }) => (
            <div
              key={key}
              className="flex items-start justify-between gap-4 border-t border-border py-3 first:border-t-0 first:pt-0"
            >
              <div className="min-w-0">
                <Label htmlFor={`notif-${key}`}>{title}</Label>
                <p className="mt-1 max-w-prose text-xs text-muted">{hint}</p>
              </div>
              <Can
                feature="tenants"
                action="update"
                fallback={
                  <span className="flex-none text-sm text-muted">
                    {draft[key] ? "Aktif" : "Mati"}
                  </span>
                }
              >
                <Switch
                  id={`notif-${key}`}
                  checked={draft[key] === true}
                  onCheckedChange={(on) =>
                    setDraft((prev) => ({ ...prev, [key]: on }))
                  }
                  disabled={saving}
                />
              </Can>
            </div>
          ))}
        </div>
      </Card>

      <Can feature="tenants" action="update">
        <div className="flex justify-end">
          <Button type="submit" disabled={saving || !changed}>
            {saving ? "Menyimpan…" : "Simpan pilihan notifikasi"}
          </Button>
        </div>
      </Can>
    </form>
  );
}
