"use client";

import { useEffect, useState } from "react";

import { TextField } from "@/components";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { CASH_ACCOUNT_CATEGORY } from "@/features/accounting";
import { cashBankAccounts } from "@/features/cash-transactions/hooks/useCashBankAccountOptions";
import type { ChartOfAccount } from "@/types/accounting";

function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * WHICH KAS & BANK ACCOUNT THE MONEY MOVES THROUGH, AND WHEN — for a refund or
 * a top-up on a corrected till-born faktur (17 November 2026).
 *
 * THE SAME LIST Catat pembayaran offers (BO, 22 Sep 2026: outside the till the
 * back office names an account, not a method). The date defaults to today and
 * may be earlier — the day the money actually moved — never later.
 */
export function SettlementAccountFields({
  label,
  accountId,
  onAccountChange,
  date,
  onDateChange,
  disabled,
}: {
  label: string;
  accountId: string;
  onAccountChange: (id: string) => void;
  date: string;
  onDateChange: (date: string) => void;
  disabled?: boolean;
}) {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);

  useEffect(() => {
    let active = true;

    chartOfAccountsService
      .list({ accountCategory: CASH_ACCOUNT_CATEGORY, isActive: true, limit: 100 })
      .then((result) => {
        if (!active) return;
        const usable = cashBankAccounts(result.items);
        setAccounts(usable);
        // A single account is not a choice.
        if (usable.length === 1 && !accountId) onAccountChange(usable[0]._id);
      })
      .catch(() => {
        if (active) setAccounts([]);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label>{label}</Label>
        <Select value={accountId} disabled={disabled} onValueChange={onAccountChange}>
          <SelectTrigger>
            <SelectValue placeholder="Pilih akun Kas & Bank" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account._id} value={account._id}>
                {account.code} · {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TextField
        label="Tanggal uang berpindah"
        name="settleAt"
        type="date"
        value={date}
        max={today()}
        onChange={(event) => onDateChange(event.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

export { today as todayIso };
