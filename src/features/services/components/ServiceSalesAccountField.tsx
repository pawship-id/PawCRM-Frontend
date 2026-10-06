"use client";

import { useEffect, useState } from "react";

import { FilterSelect } from "@/components";
// Deep, not the barrel: the accounting index reaches back into settings, which
// imports the service form.
import { SubAccountSelect } from "@/features/accounting/components/SubAccountSelect";
import type { UseSubAccountsResult } from "@/features/accounting/hooks/useSubAccounts";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import type { ChartOfAccount } from "@/types/accounting";

/** The "follow the default" choice, spelled as a real option. */
const DEFAULT_ACCOUNT = "";

/**
 * WHERE THIS SERVICE'S REVENUE POSTS — the Akun penjualan, and under it the Sub
 * akun that account asks for.
 *
 * ADDED WITH SUB AKUN (Sub-Akun-Implementation-Plan §3.4). The service record has
 * carried `salesAccountId` for a while, but this form never offered it, so no
 * service could be pointed at an account — and a sub akun with no account above
 * it to hang from would be a control with nothing to attach to. Both are asked
 * here, together, in the one place a service's identity is set.
 *
 * EMPTY IS THE ORDINARY CASE: no account falls through to the seeded revenue
 * account, and the sub akun is then not asked at all. The Sub akun appears only
 * when the chosen account has active ones, is required then, and is emptied by
 * the form when the account changes.
 *
 * FAILS SOFTLY, the same way the product form's accounting section does:
 * `chartOfAccounts:read` is its own grant, and a service can be priced by
 * somebody who may not read the books. A refused list collapses this to one
 * sentence rather than taking the form with it.
 */
export function ServiceSalesAccountField({
  accountId,
  onAccountChange,
  subAccounts,
  subAccountId,
  onSubAccountChange,
  subError,
  disabled = false,
}: {
  accountId: string;
  onAccountChange: (next: string) => void;
  subAccounts: UseSubAccountsResult;
  subAccountId: string;
  onSubAccountChange: (next: string) => void;
  subError?: string;
  disabled?: boolean;
}) {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    chartOfAccountsService
      .list({ accountType: "income", isActive: true })
      .then((result) => {
        if (active) setAccounts(result.items);
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

  if (failed) {
    return (
      <p className="rounded-lg border border-secondary/40 bg-secondary/15 px-3 py-2 text-xs">
        Daftar akun tidak bisa dimuat, jadi akun penjualan belum bisa dipilih.
        Layanan tetap bisa disimpan tanpa itu.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <FilterSelect
          layout="form"
          label="Akun penjualan"
          ariaLabel="Pilih akun penjualan"
          value={accountId}
          options={[
            { value: DEFAULT_ACCOUNT, label: "Akun bawaan" },
            ...accounts.map((account) => ({
              value: account._id,
              label: `${account.code} — ${account.name}`,
            })),
          ]}
          active={false}
          placeholder={loading ? "Memuat…" : "Akun bawaan"}
          searchable
          disabled={disabled || loading}
          onChange={onAccountChange}
        />
        <p className="text-xs text-muted">
          Hanya akun bertipe pendapatan. Kosongkan untuk memakai akun penjualan
          bawaan. Lini bisnis di laporan mengikuti sub akun yang dipilih.
        </p>
      </div>

      <SubAccountSelect
        id="service-sales-sub-account"
        label="Sub akun penjualan"
        subAccounts={subAccounts.subAccounts}
        loading={subAccounts.loading}
        value={subAccountId}
        onChange={onSubAccountChange}
        error={subError}
        disabled={disabled}
      />
    </div>
  );
}
