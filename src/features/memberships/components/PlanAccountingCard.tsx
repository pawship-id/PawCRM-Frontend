"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components";
import { Label } from "@/components/ui/label";
// Deep, not the barrel: the accounting index reaches back into settings.
import { SubAccountSelect } from "@/features/accounting/components/SubAccountSelect";
import { useSubAccounts } from "@/features/accounting/hooks/useSubAccounts";
import { useTenant } from "@/features/tenant";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import type { RecognitionMethod, RecognitionMode } from "@/types/membership";

import type { PlanDraft } from "../planDraft";
import {
  RecognitionMethodChoice,
  RecognitionModeChoice,
  suggestedMethod,
} from "./RecognitionModeChoice";

/** The seeded Pendapatan Membership, used when the tenant has chosen none. */
const SEEDED_REVENUE_CODE = "4104";

/**
 * PENGAKUAN PENDAPATAN on the package form (BO no. 1: "ketika di paket aja, tp
 * prefilled dengan default per tenant").
 *
 * OPENS ON THE TENANT'S CHOICE, which the owner may leave or change; saving
 * stores what is shown. The METHOD is the one the benefits suggest until the
 * owner picks one — so editing the benefits moves the suggestion with them —
 * and the sub akun is what files the revenue under a lini bisnis, exactly as a
 * service's does (BO no. 9).
 */
export function PlanAccountingCard({
  draft,
  onChange,
  disabled = false,
}: {
  draft: PlanDraft;
  onChange: (patch: Partial<PlanDraft>) => void;
  disabled?: boolean;
}) {
  const { tenant } = useTenant();
  const settings = tenant?.settings.membershipAccounting;
  const tenantRecognition: RecognitionMode = settings?.recognition ?? "immediate";
  const recognition = draft.recognition ?? tenantRecognition;

  const suggested = suggestedMethod(
    draft.benefits.map((benefit) => ({
      kind: benefit.type === "perk" ? "perk" : "allowance",
      quota: {
        total: benefit.quotaChoice === "term" ? 1 : null,
        perPeriod: benefit.quotaChoice === "week" || benefit.quotaChoice === "month" ? 1 : null,
      },
    })),
  );
  const method: RecognitionMethod = draft.method ?? suggested;

  /* The revenue account the sub akun hangs from — the tenant's, or the seeded 4104. */
  const [seededRevenueId, setSeededRevenueId] = useState("");
  const revenueAccountId = settings?.revenueAccountId ?? seededRevenueId;

  useEffect(() => {
    if (settings?.revenueAccountId) return;
    let active = true;
    chartOfAccountsService
      .list({ accountCategory: "pendapatan", isActive: true, search: SEEDED_REVENUE_CODE })
      .then((result) => {
        const seeded = result.items.find((account) => account.code === SEEDED_REVENUE_CODE);
        if (active && seeded) setSeededRevenueId(seeded._id);
      })
      .catch(() => {
        /* No sub akun to offer — the package saves without one. */
      });
    return () => {
      active = false;
    };
  }, [settings?.revenueAccountId]);

  const subAccounts = useSubAccounts(revenueAccountId);

  return (
    <Card
      title="Pengakuan pendapatan"
      description="Kapan uang paket ini jadi pendapatan. Terisi dari Pengaturan › Keuangan › Membership, dan bisa diubah khusus paket ini."
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Label>Cara pengakuan</Label>
          <RecognitionModeChoice
            idPrefix="plan-recognition"
            value={recognition}
            onChange={(next) => onChange({ recognition: next })}
            disabled={disabled}
          />
        </div>

        {recognition === "deferred" ? (
          <div className="flex flex-col gap-3">
            <Label>Metode</Label>
            <RecognitionMethodChoice
              idPrefix="plan-method"
              value={method}
              suggested={suggested}
              onChange={(next) => onChange({ method: next })}
              disabled={disabled}
            />
            <p className="max-w-prose text-xs text-muted">
              Saran mengikuti jenis jatah. Per pemakaian hanya kalau semua jatahnya berlaku selama masa
              aktif, misalnya 5 gratis 1. Paket dengan jatah bulanan, campuran, atau hanya diskon
              diakui per hari.
            </p>
          </div>
        ) : null}

        {revenueAccountId ? (
          <SubAccountSelect
            id="plan-revenue-sub-account"
            label="Sub akun pendapatan"
            subAccounts={subAccounts.subAccounts}
            loading={subAccounts.loading}
            value={draft.revenueSubAccountId}
            onChange={(next) => onChange({ revenueSubAccountId: next })}
            disabled={disabled}
          />
        ) : null}
      </div>
    </Card>
  );
}

/** The tenant default the payload falls back to when the owner left it untouched. */
export function useTenantRecognition(): RecognitionMode {
  const { tenant } = useTenant();
  return tenant?.settings.membershipAccounting?.recognition ?? "immediate";
}
