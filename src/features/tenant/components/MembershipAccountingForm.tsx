"use client";

import { useEffect, useState } from "react";

import { Card, FilterSelect } from "@/components";
import { Button as UIButton } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Can } from "@/features/permissions";
import {
  RECOGNITION_MODE_COPY,
  RecognitionModeChoice,
} from "@/features/memberships/components/RecognitionModeChoice";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { tenantService } from "@/services/tenant.service";
import type { ChartOfAccount } from "@/types/accounting";
import type { MembershipAccountingSettings, Tenant } from "@/types/api";

/** The "use the seeded account" choice, spelled as a real option. */
const SEEDED = "";

/**
 * Pengaturan › Keuangan › Membership — the TENANT'S DEFAULT for how a package's
 * money becomes revenue, and the two accounts it posts to
 * (PLAN-Membership-Pengakuan-Pendapatan.md, BO 24–26 October 2026).
 *
 * A DEFAULT, NOT A RULE: every package form opens with this choice and may
 * change it (BO no. 1). And it never reaches back — a card keeps the terms it
 * was sold on, so changing this moves the NEXT sale only, which the copy says.
 *
 * THE ACCOUNTS ARE PICKED BY ID because Buloo's tenants number their charts
 * their own way. Empty is the seeded 4104 / 2104, so a shop that never opens
 * this page posts exactly where it always did.
 */
export function MembershipAccountingForm({
  tenant,
  onSaved,
}: {
  tenant: Tenant;
  onSaved: () => void;
}) {
  const current: MembershipAccountingSettings = {
    recognition: tenant.settings.membershipAccounting?.recognition ?? "immediate",
    revenueAccountId: tenant.settings.membershipAccounting?.revenueAccountId ?? null,
    unearnedAccountId: tenant.settings.membershipAccounting?.unearnedAccountId ?? null,
  };

  const [recognition, setRecognition] = useState(current.recognition);
  const [revenueAccountId, setRevenueAccountId] = useState(current.revenueAccountId ?? SEEDED);
  const [unearnedAccountId, setUnearnedAccountId] = useState(current.unearnedAccountId ?? SEEDED);
  const [revenueAccounts, setRevenueAccounts] = useState<ChartOfAccount[]>([]);
  const [liabilityAccounts, setLiabilityAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([
      chartOfAccountsService.list({ accountCategory: "pendapatan", isActive: true }),
      chartOfAccountsService.list({ accountCategory: "hutang_lainnya", isActive: true }),
    ])
      .then(([revenue, liability]) => {
        if (!active) return;
        setRevenueAccounts(revenue.items);
        setLiabilityAccounts(liability.items);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const changed =
    recognition !== current.recognition ||
    revenueAccountId !== (current.revenueAccountId ?? SEEDED) ||
    unearnedAccountId !== (current.unearnedAccountId ?? SEEDED);

  const options = (accounts: ChartOfAccount[], seededLabel: string) => [
    { value: SEEDED, label: seededLabel },
    ...accounts.map((account) => ({
      value: account._id,
      label: `${account.code} — ${account.name}`,
    })),
  ];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!changed) return;

    setSaving(true);
    try {
      await tenantService.updateSettings({
        membershipAccounting: {
          recognition,
          revenueAccountId: revenueAccountId || null,
          unearnedAccountId: unearnedAccountId || null,
        },
      });
      setSaving(false);
      onSaved();
      swalToast("Pengaturan membership tersimpan.");
    } catch (error) {
      swalToast(
        error instanceof ApiError ? error.message : "Terjadi kesalahan. Coba lagi.",
        "error",
        8000,
      );
      setSaving(false);
    }
  }

  const accountName = (id: string | null, accounts: ChartOfAccount[], seeded: string) => {
    if (!id) return seeded;
    const account = accounts.find((row) => row._id === id);
    return account ? `${account.code} — ${account.name}` : "Akun terpilih";
  };

  return (
    <Card
      title="Membership"
      description="Kapan uang paket membership jadi pendapatan, dan ke akun mana dicatat."
    >
      <Can
        feature="tenants"
        action="update"
        fallback={
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Cara pengakuan</dt>
              <dd>{RECOGNITION_MODE_COPY[current.recognition].label}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Pendapatan Membership</dt>
              <dd>{accountName(current.revenueAccountId, revenueAccounts, "Akun bawaan (4104)")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Pendapatan Diterima di Muka</dt>
              <dd>{accountName(current.unearnedAccountId, liabilityAccounts, "Akun bawaan (2104)")}</dd>
            </div>
            <p className="mt-2 text-xs text-muted">Role Anda tidak bisa mengubah setelan ini.</p>
          </dl>
        }
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Label>Cara pengakuan bawaan</Label>
            <RecognitionModeChoice
              idPrefix="tenant-recognition"
              value={recognition}
              onChange={setRecognition}
              disabled={saving}
            />
          </div>

          {failed ? (
            <p className="rounded-lg border border-secondary/40 bg-secondary/15 px-3 py-2 text-xs">
              Daftar akun tidak bisa dimuat, jadi akunnya belum bisa dipilih. Cara pengakuan tetap bisa
              disimpan.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <FilterSelect
                  layout="form"
                  label="Akun Pendapatan Membership"
                  ariaLabel="Pilih akun pendapatan membership"
                  value={revenueAccountId}
                  options={options(revenueAccounts, "Akun bawaan (4104)")}
                  active={false}
                  placeholder={loading ? "Memuat…" : "Akun bawaan (4104)"}
                  searchable
                  disabled={saving || loading}
                  onChange={setRevenueAccountId}
                />
                <p className="text-xs text-muted">
                  Hanya akun berkategori Pendapatan. Lini bisnis ikut sub akun yang dipilih di tiap paket.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <FilterSelect
                  layout="form"
                  label="Akun Pendapatan Diterima di Muka"
                  ariaLabel="Pilih akun pendapatan diterima di muka"
                  value={unearnedAccountId}
                  options={options(liabilityAccounts, "Akun bawaan (2104)")}
                  active={false}
                  placeholder={loading ? "Memuat…" : "Akun bawaan (2104)"}
                  searchable
                  disabled={saving || loading}
                  onChange={setUnearnedAccountId}
                />
                <p className="text-xs text-muted">
                  Hanya akun berkategori Utang Lainnya. Dipakai untuk paket diterima di muka, dan untuk
                  faktur paket yang belum lunas.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <UIButton type="submit" size="lg" disabled={saving || !changed}>
              {saving ? "Menyimpan…" : "Simpan pengaturan membership"}
            </UIButton>
          </div>
        </form>
      </Can>
    </Card>
  );
}
