"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";

import { Breadcrumb, HighlightText } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AccountType, ChartOfAccount } from "@/types/accounting";
import { normalBalanceOf } from "@/types/accounting";

import { ACCOUNTS_BY_ID, DUMMY_ACCOUNTS } from "../data/dummy";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  ACCOUNT_TYPE_TONE,
} from "../labels";
import { ACCOUNTING_CRUMBS } from "../crumbs";
import { DummyNotice } from "./DummyNotice";

/** Radix Select forbids an empty item value, so "all" is the sentinel. */
const ALL = "all";

/**
 * The tenant's chart of accounts, as a tree.
 *
 * A TREE AND NOT A FLAT TABLE, because the numbering IS the structure: 1201 is
 * only meaningful under 1200 Persediaan, which is only meaningful under 1000
 * Aset. Rendering the same rows sorted by code loses the one relationship a COA
 * exists to express, and it is the relationship the backend spends a depth check
 * and a cycle check protecting.
 *
 * THE NORMAL BALANCE COLUMN IS DERIVED, never stored — assets and expenses grow
 * on the debit side, everything else on the credit side. It is here because it
 * is the fact somebody needs when they are staring at a journal form wondering
 * which column an amount belongs in, and it is not obvious from the name.
 *
 * SEARCH KEEPS ANCESTORS. Matching "PPN" and rendering the two matches alone
 * would show them floating at the root, implying they are top-level accounts. So
 * a match drags its parents along, greyed out via `matched=false`, and the tree
 * stays readable as a tree.
 */
export function ChartOfAccountsScreen() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<AccountType | typeof ALL>(ALL);
  const [showInactive, setShowInactive] = useState(false);
  /** Ids whose children are hidden. Empty means "everything expanded". */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const term = search.trim().toLowerCase();

  const { rows, matchCount } = useMemo(
    () => buildRows({ term, type, showInactive, collapsed }),
    [term, type, showInactive, collapsed],
  );

  const countsByType = useMemo(() => {
    const counts = new Map<AccountType, number>();
    for (const account of DUMMY_ACCOUNTS) {
      counts.set(account.accountType, (counts.get(account.accountType) ?? 0) + 1);
    }
    return counts;
  }, []);

  const inactiveCount = DUMMY_ACCOUNTS.filter(
    (account) => !account.isActive,
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb items={[ACCOUNTING_CRUMBS.hub, { label: "Daftar Akun" }]} />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">
          Daftar Akun (COA)
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Fondasi pembukuan: setiap baris jurnal — penjualan, HPP, pembelian,
          selisih opname — menunjuk salah satu akun di sini. Kode akun adalah
          identitas yang dipakai modul lain, jadi kode akun bawaan tidak bisa
          diubah.
        </p>
      </div>

      <DummyNotice endpoint="GET /api/chart-of-accounts/tree" />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ACCOUNT_TYPES.map((accountType) => (
          <button
            key={accountType}
            type="button"
            onClick={() => setType(type === accountType ? ALL : accountType)}
            className={cn(
              "rounded-xl border bg-surface px-4 py-3 text-left transition hover:border-primary",
              type === accountType ? "border-primary" : "border-border",
            )}
          >
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted">
              {ACCOUNT_TYPE_LABEL[accountType]}
            </p>
            <p className="mt-1 tabular-nums text-lg font-semibold text-foreground">
              {countsByType.get(accountType) ?? 0}
            </p>
            <p className="text-[11px] text-muted">
              saldo normal {normalBalanceOf(accountType) === "debit" ? "debit" : "kredit"}
            </p>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              // Names exactly the two fields the API's ?search= matches — an
              // accountant looks up "1201" as readily as "Persediaan".
              placeholder="Cari kode atau nama akun"
              aria-label="Cari akun"
              className="pl-9"
            />
          </div>

          <Select
            value={type}
            onValueChange={(value) => setType(value as AccountType | typeof ALL)}
          >
            <SelectTrigger aria-label="Filter tipe akun" className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua tipe</SelectItem>
              {ACCOUNT_TYPES.map((accountType) => (
                <SelectItem key={accountType} value={accountType}>
                  {ACCOUNT_TYPE_LABEL[accountType]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Switch
              id="coa-show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="coa-show-inactive" className="text-xs font-normal text-muted">
              Tampilkan nonaktif ({inactiveCount})
            </Label>
          </div>
        </div>

        {/*
          Disabled rather than hidden: the create path exists on the API
          (POST /api/chart-of-accounts) and belongs in this toolbar, so leaving
          it out would misdescribe the module. The title says why it does not
          respond yet.
        */}
        <Button disabled title="Belum tersambung ke API">
          <Plus className="size-4" />
          Tambah akun
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Kode</th>
              <th className="px-4 py-2.5 text-left font-medium">Nama akun</th>
              <th className="px-4 py-2.5 text-left font-medium">Tipe</th>
              <th className="px-4 py-2.5 text-left font-medium">Saldo normal</th>
              <th className="px-4 py-2.5 text-left font-medium">Sumber</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <p className="font-medium text-foreground">
                    Tidak ada akun yang cocok
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Coba kata kunci lain, atau ubah filter tipe akun.
                  </p>
                </td>
              </tr>
            )}

            {rows.map((row) => {
              const { account, depth, hasChildren, matched } = row;
              const isCollapsed = collapsed.has(account._id);

              return (
                <tr
                  key={account._id}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    // A parent dragged in only to keep a match in place is
                    // context, not a result — it reads quieter than its child.
                    !matched && "text-muted",
                    !account.isActive && "bg-accent/40",
                  )}
                >
                  <td className="px-4 py-2.5 align-middle">
                    <div
                      className="flex items-center gap-1.5"
                      style={{ paddingLeft: `${depth * 18}px` }}
                    >
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggle(setCollapsed, account._id)}
                          aria-expanded={!isCollapsed}
                          aria-label={
                            isCollapsed
                              ? `Buka sub-akun ${account.code}`
                              : `Tutup sub-akun ${account.code}`
                          }
                          className="text-muted transition-colors hover:text-foreground"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="size-4" />
                          ) : (
                            <ChevronDown className="size-4" />
                          )}
                        </button>
                      ) : (
                        <span className="size-4" aria-hidden="true" />
                      )}
                      <span
                        className={cn(
                          "tabular-nums text-xs",
                          hasChildren && "font-semibold text-foreground",
                        )}
                      >
                        <HighlightText text={account.code} query={term} />
                      </span>
                    </div>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-sm",
                      hasChildren ? "font-semibold" : "font-medium",
                    )}
                  >
                    <HighlightText text={account.name} query={term} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "border-transparent",
                        ACCOUNT_TYPE_TONE[account.accountType],
                      )}
                    >
                      {ACCOUNT_TYPE_LABEL[account.accountType]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs uppercase tracking-wide text-muted">
                    {normalBalanceOf(account.accountType) === "debit"
                      ? "Debit"
                      : "Kredit"}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {account.isDefault ? (
                      <span
                        className="text-muted"
                        title="Akun bawaan tenant — kode dan tipenya tidak bisa diubah, dan tidak bisa dihapus."
                      >
                        Bawaan sistem
                      </span>
                    ) : (
                      <span className="text-muted">Dibuat manual</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {account.isActive ? (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-success/12 text-success"
                      >
                        aktif
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-accent text-muted"
                        title="Masih menjelaskan jurnal lama, tapi tidak ditawarkan untuk posting baru."
                      >
                        nonaktif
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        {term
          ? `${matchCount} akun cocok dengan "${search.trim()}"`
          : `${rows.length} akun ditampilkan dari ${DUMMY_ACCOUNTS.length} akun`}
      </p>
    </div>
  );
}

/** One rendered line of the tree. */
interface AccountRow {
  account: ChartOfAccount;
  /** Nesting level, root = 0 — drives the indent only. */
  depth: number;
  hasChildren: boolean;
  /** False for an ancestor kept only so a matching child stays in place. */
  matched: boolean;
}

/**
 * Flattens the tree into the rows the table renders, applying the filters.
 *
 * COLLAPSE IS IGNORED WHILE SEARCHING. A hit hidden inside a folded branch is a
 * search that answers "nothing found" while the thing is right there — so a
 * search expands whatever it needs to.
 */
function buildRows({
  term,
  type,
  showInactive,
  collapsed,
}: {
  term: string;
  type: AccountType | typeof ALL;
  showInactive: boolean;
  collapsed: Set<string>;
}): { rows: AccountRow[]; matchCount: number } {
  const matches = DUMMY_ACCOUNTS.filter((account) => {
    if (type !== ALL && account.accountType !== type) return false;
    if (!showInactive && !account.isActive) return false;
    if (!term) return true;
    return (
      account.code.toLowerCase().includes(term) ||
      account.name.toLowerCase().includes(term)
    );
  });

  const matchedIds = new Set(matches.map((account) => account._id));

  // Ancestors of every match come along, so a hit is never rendered as though it
  // were a root account. They are marked `matched: false` and styled quieter.
  const visible = new Set(matchedIds);
  for (const account of matches) {
    let parentId = account.parentAccountId;
    while (parentId && !visible.has(parentId)) {
      visible.add(parentId);
      parentId = ACCOUNTS_BY_ID.get(parentId)?.parentAccountId ?? null;
    }
  }

  const childrenOf = new Map<string | null, ChartOfAccount[]>();
  for (const account of DUMMY_ACCOUNTS) {
    if (!visible.has(account._id)) continue;
    const siblings = childrenOf.get(account.parentAccountId) ?? [];
    siblings.push(account);
    childrenOf.set(account.parentAccountId, siblings);
  }

  const rows: AccountRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const account of childrenOf.get(parentId) ?? []) {
      const children = childrenOf.get(account._id) ?? [];
      rows.push({
        account,
        depth,
        hasChildren: children.length > 0,
        matched: matchedIds.has(account._id),
      });
      // While searching, a folded branch still opens — see the header.
      if (children.length > 0 && (term !== "" || !collapsed.has(account._id))) {
        walk(account._id, depth + 1);
      }
    }
  };
  walk(null, 0);

  return { rows, matchCount: matches.length };
}

/** Adds or removes one id from the collapsed set, without mutating it. */
function toggle(
  setCollapsed: (updater: (previous: Set<string>) => Set<string>) => void,
  id: string,
) {
  setCollapsed((previous) => {
    const next = new Set(previous);
    if (!next.delete(id)) next.add(id);
    return next;
  });
}
