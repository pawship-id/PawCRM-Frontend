"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, RotateCcw } from "lucide-react";

import {
  Alert,
  Breadcrumb,
  FilterBar,
  FilterSearch,
  FilterToggle,
  HighlightText,
  Spinner,
} from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can } from "@/features/permissions";
import { cn } from "@/lib/utils";
import type { AccountType, ChartOfAccount } from "@/types/accounting";
import { normalBalanceOf } from "@/types/accounting";

import { useChartOfAccounts } from "../hooks/useChartOfAccounts";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  ACCOUNT_TYPE_TONE,
} from "../labels";
import { ACCOUNTING_CRUMBS } from "../crumbs";

/**
 * The tenant's chart of accounts, as a tree, read from
 * GET /chart-of-accounts/tree through `useChartOfAccounts`.
 *
 * A TREE AND NOT A FLAT TABLE, because the numbering IS the structure: 1201 is
 * only meaningful under 1200 Persediaan, which is only meaningful under 1000
 * Aset. Rendering the same rows sorted by code loses the one relationship a COA
 * exists to express, and it is the relationship the backend spends a depth check
 * and a cycle check protecting.
 *
 * THE TOP LEVEL IS THE ACCOUNT CLASS, and it is a GROUPING RATHER THAN AN
 * ACCOUNT. The seeded chart (backend seeds/defaultAccounts.js) is deliberately
 * flat — twelve root accounts, no 1000 Aset above them — so a tenant that has
 * not built its own hierarchy would otherwise read as twelve unrelated rows in
 * which 1101 Kas and 5101 HPP sit at the same level. Grouping by `accountType`
 * is the one division that is true of every chart, seeded or hand-built.
 *
 * The class row is deliberately NOT rendered as an account: no code, no status,
 * no source. Drawing "1000 Aset" there would invent a record that does not
 * exist, cannot be edited, and would collide the day a tenant creates a real
 * 1000. Whatever hierarchy the tenant HAS built — `parentAccountId`, which the
 * API already nests — is rendered underneath it, unchanged.
 *
 * EVERY FILTER IS LOCAL. The request is made once and asks for the whole live
 * chart — see the hook for why narrowing it server-side would break both the
 * per-class counts and the tree itself.
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
  const { accounts, byId, loading, error, refetch } = useChartOfAccounts();

  const [search, setSearch] = useState("");
  /** "" is "semua tipe" — the unset convention the filter layer uses. */
  const [type, setType] = useState<AccountType | "">("");
  const [showInactive, setShowInactive] = useState(false);
  /**
   * What is folded shut — account ids, plus a `groupKey()` per class. One set
   * rather than two because both answer the same question at render time, and a
   * class key ("tipe:asset") cannot collide with a 24-character ObjectId.
   */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const term = search.trim().toLowerCase();

  const { rows, matchCount, shownCount } = useMemo(
    () => buildRows({ accounts, byId, term, type, showInactive, collapsed }),
    [accounts, byId, term, type, showInactive, collapsed],
  );

  const countsByType = useMemo(() => {
    const counts = new Map<AccountType, number>();
    for (const account of accounts) {
      counts.set(account.accountType, (counts.get(account.accountType) ?? 0) + 1);
    }
    return counts;
  }, [accounts]);

  const inactiveCount = accounts.filter((account) => !account.isActive).length;

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

      {error && <Alert variant="error">{error}</Alert>}

      {/*
        The type lens, as a pill row (docs/ui-rules.md §8): one dimension, five
        values, applied on click, and carrying the counts that are the reason it
        is on the page rather than behind a trigger. Nothing in the bar below
        repeats it — two controls for one dimension is one control too many.
      */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ACCOUNT_TYPES.map((accountType) => {
          const selected = type === accountType;
          return (
            <button
              key={accountType}
              type="button"
              aria-pressed={selected}
              onClick={() => setType(selected ? "" : accountType)}
              className={cn(
                "rounded-xl border bg-surface px-4 py-3 text-left transition hover:border-primary",
                "outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected ? "border-primary" : "border-border",
              )}
            >
              <p className="text-xs font-medium text-muted">
                {ACCOUNT_TYPE_LABEL[accountType]}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {countsByType.get(accountType) ?? 0}
              </p>
              <p className="text-xs text-muted">
                saldo normal{" "}
                {normalBalanceOf(accountType) === "debit" ? "debit" : "kredit"}
              </p>
            </button>
          );
        })}
      </div>

      <FilterBar
        searchPlacement="leading"
        search={
          <FilterSearch
            value={search}
            onChange={setSearch}
            // Names exactly the two fields the search matches — an accountant
            // looks up "1201" as readily as "Persediaan".
            placeholder="Cari kode atau nama akun"
            ariaLabel="Cari akun"
          />
        }
        actions={
          <>
            <Button variant="secondary" onClick={refetch} disabled={loading}>
              <RotateCcw className="size-4" />
              Muat ulang
            </Button>
            {/*
              Disabled rather than hidden: the create path exists on the API
              (POST /api/chart-of-accounts) and belongs in this toolbar, so
              leaving it out would misdescribe the module. The hint below says
              why it does not respond yet.
            */}
            <Can feature="chartOfAccounts" action="create">
              <Button disabled>
                <Plus className="size-4" />
                Tambah akun
              </Button>
            </Can>
          </>
        }
        hint="Form tambah akun belum ada di halaman ini — daftar di bawah sudah dibaca langsung dari server."
      >
        <FilterToggle
          label={`Tampilkan nonaktif (${inactiveCount})`}
          checked={showInactive}
          onChange={setShowInactive}
        />
      </FilterBar>

      {loading && accounts.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat daftar akun…
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
          <p className="font-medium text-foreground">
            Belum ada akun di daftar ini.
          </p>
          <p className="mt-1 text-sm text-muted">
            {error
              ? "Coba muat ulang setelah koneksi ke server pulih."
              : "Akun bawaan biasanya dibuat otomatis untuk setiap tenant. Hubungi admin kalau daftar ini tetap kosong."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <Table className={loading ? "opacity-60" : undefined}>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Nama akun</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Saldo normal</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-16 text-center">
                    <p className="font-medium text-foreground">
                      Tidak ada akun yang cocok
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Coba kata kunci lain, atau ubah filter tipe akun.
                    </p>
                  </TableCell>
                </TableRow>
              )}

              {rows.map((row) => {
                if (row.kind === "group") {
                  const key = groupKey(row.accountType);
                  const isCollapsed = collapsed.has(key);

                  return (
                    // One cell across the table: a class is not an account, so
                    // it fills no account column. See the header.
                    //
                    // NO FILL, and both of ui/table's own fills switched off to
                    // get there. `has-aria-expanded:bg-muted/50` (table.tsx) is
                    // the one that matters: this row holds the chevron button,
                    // so that rule matched, and a `:has()` selector outranks a
                    // plain `bg-*` class — which is why every background set
                    // here before this was painted over and never seen.
                    //
                    // Hover goes too. Without a fill, the stock row hover would
                    // be the only tint the heading ever shows, which is exactly
                    // backwards: it would light up as though it were clickable
                    // when only its chevron is.
                    <TableRow
                      key={key}
                      className="hover:bg-transparent has-aria-expanded:bg-transparent"
                    >
                      <TableCell colSpan={6} className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggle(setCollapsed, key)}
                            aria-expanded={!isCollapsed}
                            aria-label={
                              isCollapsed
                                ? `Buka kelompok ${ACCOUNT_TYPE_LABEL[row.accountType]}`
                                : `Tutup kelompok ${ACCOUNT_TYPE_LABEL[row.accountType]}`
                            }
                            className="rounded-md text-muted transition-colors hover:text-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="size-4" />
                            ) : (
                              <ChevronDown className="size-4" />
                            )}
                          </button>
                          <span className="text-sm font-bold text-foreground">
                            {ACCOUNT_TYPE_LABEL[row.accountType]}
                          </span>
                          <span className="text-xs text-muted tabular-nums">
                            · {row.count} akun · saldo normal{" "}
                            {normalBalanceOf(row.accountType) === "debit"
                              ? "debit"
                              : "kredit"}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                const { account, depth, hasChildren, matched } = row;
                const isCollapsed = collapsed.has(account._id);

                return (
                  <TableRow
                    key={account._id}
                    className={cn(
                      // A parent dragged in only to keep a match in place is
                      // context, not a result — it reads quieter than its child.
                      !matched && "text-muted",
                      // An account with sub-accounts carries a chevron, so
                      // ui/table's `has-aria-expanded:bg-muted/50` would tint it
                      // grey for no reason a reader could name — and would
                      // outrank the deactivated tint next to it, since a
                      // `:has()` selector beats a plain class. Both cases
                      // therefore restate what the row's fill should be under
                      // the same variant. Not reachable with the seeded chart,
                      // which is flat, but it is one tenant-made parent account
                      // away.
                      account.isActive
                        ? "has-aria-expanded:bg-transparent"
                        : "bg-surface-hover has-aria-expanded:bg-surface-hover",
                    )}
                  >
                    <TableCell className="px-4 py-2.5">
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
                            className="rounded-md text-muted transition-colors hover:text-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
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
                            "text-sm tabular-nums",
                            hasChildren && "font-semibold text-foreground",
                          )}
                        >
                          <HighlightText text={account.code} query={term} />
                        </span>
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "px-4 py-2.5 text-sm",
                        hasChildren ? "font-semibold" : "font-medium",
                      )}
                    >
                      <HighlightText text={account.name} query={term} />
                    </TableCell>
                    <TableCell className="px-4 py-2.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          ACCOUNT_TYPE_TONE[account.accountType],
                        )}
                      >
                        {ACCOUNT_TYPE_LABEL[account.accountType]}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-xs text-muted">
                      {normalBalanceOf(account.accountType) === "debit"
                        ? "Debit"
                        : "Kredit"}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-xs text-muted">
                      {account.isDefault ? (
                        <span title="Akun bawaan tenant — kode dan tipenya tidak bisa diubah, dan tidak bisa dihapus.">
                          Bawaan sistem
                        </span>
                      ) : (
                        "Dibuat manual"
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-2.5">
                      {account.isActive ? (
                        <span className="rounded-full bg-tint-success px-2 py-0.5 text-xs font-medium text-success">
                          Aktif
                        </span>
                      ) : (
                        <span
                          className="rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-muted"
                          title="Masih menjelaskan jurnal lama, tapi tidak ditawarkan untuk posting baru."
                        >
                          Nonaktif
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {accounts.length > 0 && (
        <p className="text-xs text-muted">
          {term
            ? `${matchCount} akun cocok dengan "${search.trim()}"`
            : `${shownCount} akun ditampilkan dari ${accounts.length} akun`}
        </p>
      )}
    </div>
  );
}

/** One rendered line of the tree: an account, or the class heading above it. */
type Row =
  | {
      kind: "group";
      accountType: AccountType;
      /** Every account of this class in the current filter, folded or not. */
      count: number;
    }
  | {
      kind: "account";
      account: ChartOfAccount;
      /** Nesting level under the class heading — drives the indent only. */
      depth: number;
      hasChildren: boolean;
      /** False for an ancestor kept only so a matching child stays in place. */
      matched: boolean;
    };

/** The collapsed-set key for a class heading. Cannot collide with an ObjectId. */
function groupKey(accountType: AccountType): string {
  return `tipe:${accountType}`;
}

/**
 * Flattens the chart into the rows the table renders, applying the filters.
 *
 * TWO LEVELS OF GROUPING, from two different places: the class heading is
 * derived here from `accountType`, and everything below it is the tenant's own
 * `parentAccountId` hierarchy exactly as the API nested it. A class with nothing
 * in it after filtering renders no heading at all — a heading over an empty
 * group reads as data that failed to load.
 *
 * COLLAPSE IS IGNORED WHILE SEARCHING, for a class heading as much as for a
 * branch. A hit hidden inside a folded group is a search that answers "nothing
 * found" while the thing is right there — so a search expands whatever it needs
 * to.
 */
function buildRows({
  accounts,
  byId,
  term,
  type,
  showInactive,
  collapsed,
}: {
  accounts: ChartOfAccount[];
  byId: Map<string, ChartOfAccount>;
  term: string;
  type: AccountType | "";
  showInactive: boolean;
  collapsed: Set<string>;
}): { rows: Row[]; matchCount: number; shownCount: number } {
  const matches = accounts.filter((account) => {
    if (type !== "" && account.accountType !== type) return false;
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
      parentId = byId.get(parentId)?.parentAccountId ?? null;
    }
  }

  const childrenOf = new Map<string | null, ChartOfAccount[]>();
  for (const account of accounts) {
    if (!visible.has(account._id)) continue;
    // An account whose parent was filtered out hangs from the root rather than
    // vanishing — the same choice the backend's tree builder makes, and for the
    // same reason: a missing account reads as a deleted one.
    const parentId =
      account.parentAccountId && visible.has(account.parentAccountId)
        ? account.parentAccountId
        : null;
    const siblings = childrenOf.get(parentId) ?? [];
    siblings.push(account);
    childrenOf.set(parentId, siblings);
  }

  const rows: Row[] = [];
  let shownCount = 0;

  // Takes the siblings rather than their parent's id, so the class headings can
  // hand it one class's roots without the roots of the other four coming along.
  const walk = (siblings: ChartOfAccount[], depth: number) => {
    for (const account of siblings) {
      const children = childrenOf.get(account._id) ?? [];
      rows.push({
        kind: "account",
        account,
        depth,
        hasChildren: children.length > 0,
        matched: matchedIds.has(account._id),
      });
      shownCount += 1;
      // While searching, a folded branch still opens — see the header.
      if (children.length > 0 && (term !== "" || !collapsed.has(account._id))) {
        walk(children, depth + 1);
      }
    }
  };

  // ACCOUNT_TYPES is in the order the accounting equation reads — assets,
  // liabilities, equity, then the two P&L classes — which is also the order the
  // leading digit of every code puts them in.
  const roots = childrenOf.get(null) ?? [];
  for (const accountType of ACCOUNT_TYPES) {
    const classRoots = roots.filter(
      (account) => account.accountType === accountType,
    );
    if (classRoots.length === 0) continue;

    // Counted over the whole class, not just its roots: the heading has to keep
    // saying "5 akun" while the branches under it are folded shut.
    const count = accounts.filter(
      (account) =>
        account.accountType === accountType && visible.has(account._id),
    ).length;

    rows.push({ kind: "group", accountType, count });

    // A class heading is depth 0, so its accounts start one level in.
    if (term !== "" || !collapsed.has(groupKey(accountType))) {
      walk(classRoots, 1);
    }
  }

  return { rows, matchCount: matches.length, shownCount };
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
