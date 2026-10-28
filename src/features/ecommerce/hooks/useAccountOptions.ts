"use client";

import { useEffect, useState } from "react";

import type { FilterOption } from "@/components";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";

/**
 * Every active account as a picker option, code first — Pengaturan › Akun.
 * A role without Daftar Akun gets an empty list and the rows keep showing the
 * account each role is on now.
 */
export function useAccountOptions({ cashBankOnly = false }: { cashBankOnly?: boolean } = {}) {
  const [options, setOptions] = useState<FilterOption<string>[]>([]);

  useEffect(() => {
    let active = true;
    chartOfAccountsService
      .list({
        isActive: true,
        limit: 500,
        ...(cashBankOnly ? { accountCategory: "cash_bank" } : {}),
      })
      .then((page) => {
        if (!active) return;
        setOptions(
          page.items
            .map((account) => ({
              value: account._id,
              label: `${account.code} ${account.name}`,
              meta: account.accountCategory === "cash_bank" ? "Kas & Bank" : undefined,
            }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        );
      })
      .catch(() => {
        if (active) setOptions([]);
      });
    return () => {
      active = false;
    };
  }, [cashBankOnly]);

  return options;
}
