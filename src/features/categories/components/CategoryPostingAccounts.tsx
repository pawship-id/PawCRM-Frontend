"use client";

import { useEffect, useState } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { ApiError } from "@/services/api-error";
import type { ChartOfAccount } from "@/types/accounting";

/** The three sides of the ledger a category may point at. */
export interface PostingAccounts {
  salesAccountId: string;
  cogsAccountId: string;
  inventoryAccountId: string;
}

/** An empty triple — what a category that has never been filled in carries. */
export const NO_POSTING_ACCOUNTS: PostingAccounts = {
  salesAccountId: "",
  cogsAccountId: "",
  inventoryAccountId: "",
};

/**
 * The "follow the tier above me" option, and the reason it has to be a sentinel.
 *
 * Radix Select forbids `value=""` — the empty string is how it recognises a
 * cleared field, so an item carrying it throws. Without an item there is no way
 * BACK to empty once somebody has picked an account, and every hint on this
 * screen tells them to leave it empty for the ordinary case. The filters layer
 * solved the identical problem with `withAll`; this is the same trick, kept
 * local because the vocabulary is different.
 */
const INHERIT = "__inherit__";

const FIELDS = [
  {
    key: "salesAccountId" as const,
    accountType: "income" as const,
    label: "Akun penjualan",
    empty: "Belum ada akun pendapatan",
    /** What the field means when nothing is chosen and the category is a root. */
    fallback: "4101 Penjualan Barang",
    type: "pendapatan",
  },
  {
    key: "inventoryAccountId" as const,
    accountType: "asset" as const,
    label: "Akun persediaan",
    empty: "Belum ada akun aset",
    fallback: "1201 Persediaan",
    type: "aset",
  },
  {
    key: "cogsAccountId" as const,
    accountType: "expense" as const,
    label: "Akun HPP",
    empty: "Belum ada akun beban",
    fallback: "5101 HPP",
    type: "beban",
  },
];

/**
 * WHERE EVERYTHING IN THIS CATEGORY POSTS BY DEFAULT — the middle tier of
 * PCR-009's three-level resolution (item → category → seeded code).
 *
 * WHY THE CATEGORY AND NOT JUST THE PRODUCT. Setting an account per product is
 * correct and unusable: a shop with four hundred SKUs across Makanan, Treats and
 * Perlengkapan wants three answers, not four hundred. A product may still
 * override any of these one at a time; most never will.
 *
 * EMPTY IS THE ORDINARY CASE, and the hints say what empty MEANS rather than
 * leaving a blank money field reading as something forgotten. A tenant that
 * touches none of this posts exactly where the system did before this tier
 * existed — which is what makes the amendment safe to ship against live books.
 *
 * THE ACCOUNTS LIST CATCHES ITS OWN FAILURE, the same way the product form's
 * does. `chartOfAccounts:read` is a separate grant from `categories:update`, and
 * somebody who organises the catalogue without seeing the books is an ordinary
 * arrangement — so a rejection collapses this one card into a sentence rather
 * than taking down the form around it. It REPORTS the status rather than
 * diagnosing it: 403 is the one answer that really is about permissions.
 *
 * A CHILD CATEGORY INHERITS ITS PARENT'S, one level, for whatever it leaves
 * empty — the tree is capped at two levels, so that is the whole of it. Which is
 * why the copy changes when `inherited` is set: on a child, "empty" means the
 * parent's answer, not the seeded one.
 */
export function CategoryPostingAccounts({
  value,
  onChange,
  disabled = false,
  inherited = false,
}: {
  value: PostingAccounts;
  onChange: (next: PostingAccounts) => void;
  disabled?: boolean;
  /** True when this category has a parent — changes what "empty" means. */
  inherited?: boolean;
}) {
  const [accounts, setAccounts] = useState<
    Partial<Record<keyof PostingAccounts, ChartOfAccount[]>>
  >({});
  const [failure, setFailure] = useState<{
    status: number;
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all(
      FIELDS.map((field) =>
        chartOfAccountsService.list({
          accountType: field.accountType,
          isActive: true,
        }),
      ),
    )
      .then((results) => {
        if (!active) return;
        setAccounts(
          Object.fromEntries(
            FIELDS.map((field, index) => [field.key, results[index].items]),
          ),
        );
      })
      .catch((err: unknown) => {
        if (!active) return;
        setAccounts({});
        setFailure({
          status: err instanceof ApiError ? err.status : 0,
          message:
            err instanceof Error ? err.message : "Daftar akun gagal dimuat.",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (failure) {
    return (
      <p className="rounded-lg border border-secondary/40 bg-secondary/15 px-3 py-2 text-xs">
        {failure.status === 403 ? (
          <>
            Role Anda tidak punya akses ke Akuntansi, jadi daftar akun tidak bisa
            dimuat.
          </>
        ) : (
          <>
            Daftar akun gagal dimuat
            {failure.status > 0 && ` (${failure.status})`}: {failure.message}
          </>
        )}{" "}
        Kategori tetap bisa disimpan tanpa itu.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {FIELDS.map((field) => {
        const options = accounts[field.key] ?? [];
        const id = `category-${field.key}`;

        return (
          <div key={field.key} className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{field.label}</Label>
            <Select
              value={value[field.key] === "" ? INHERIT : value[field.key]}
              onValueChange={(next) =>
                onChange({
                  ...value,
                  [field.key]: next === INHERIT ? "" : next,
                })
              }
              disabled={disabled || loading || options.length === 0}
            >
              {/* w-fit by default — the product form's accounting selects carry
                  the same override, so the three line up in their grid. */}
              <SelectTrigger id={id} size="lg" className="w-full">
                <SelectValue
                  placeholder={
                    loading
                      ? "Memuat…"
                      : options.length === 0
                        ? field.empty
                        : inherited
                          ? "Ikut kategori induk"
                          : "Akun bawaan"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {/* Only when there is something to fall back FROM — with an
                    empty chart the trigger is disabled and shows its "belum
                    ada akun" placeholder instead. */}
                {options.length > 0 && (
                  <SelectItem value={INHERIT}>
                    {inherited ? "Ikut kategori induk" : "Akun bawaan"}
                  </SelectItem>
                )}
                {options.map((account) => (
                  <SelectItem key={account._id} value={account._id}>
                    {account.code} — {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted">
              Hanya akun bertipe {field.type}. Dikosongkan berarti{" "}
              {inherited
                ? "ikut kategori induknya."
                : `pakai ${field.fallback}.`}
            </p>
          </div>
        );
      })}
    </div>
  );
}
