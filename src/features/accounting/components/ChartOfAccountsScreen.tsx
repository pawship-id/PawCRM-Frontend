"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  EllipsisVertical,
  Lock,
  Pencil,
  RotateCcw,
} from "lucide-react";

import { Alert, HighlightText, Pagination, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Can, usePermissions } from "@/features/permissions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { swalToast } from "@/lib/swal";
import type {
  AccountCategory,
  AllocationType,
  ChartOfAccount,
} from "@/types/accounting";

import {
  compareAccounts,
  DEFAULT_ACCOUNT_SORT,
  type AccountSort,
} from "../accountSort";
import {
  ALLOCATION_TYPE_LABEL,
  allocationState,
  canEditAllocations,
  countByType,
  describeAllocation,
  needsNoAllocation,
  shapeNote,
  tenantShape,
} from "../allocationLabels";
import { useChartOfAccounts } from "../hooks/useChartOfAccounts";
import { useAllocationTargets } from "../hooks/useAllocationTargets";
import {
  accountCategoryTone,
  ACCOUNT_CATEGORY_LABEL,
} from "../labels";
import { ACCOUNTING_CRUMBS } from "../crumbs";
import { AccountAllocationPanel } from "./AccountAllocationPanel";
import { AccountingModuleHeader } from "./AccountingModuleHeader";
import { ChartOfAccountsToolbar } from "./ChartOfAccountsToolbar";

/**
 * Everything the toolbar sets. ONE OBJECT rather than five `useState`s, so the
 * toolbar takes a value and a patch setter exactly as ProductsToolbar does — and
 * so a control added later lands in one place instead of three.
 */
export interface ChartOfAccountsQuery {
  search: string;
  /** "" is "semua kategori" — the unset convention the filter layer uses. */
  accountCategory: AccountCategory | "";
  /** "" is any; `"unmapped"` is the one state somebody has to act on. */
  allocation: AllocationType | "unmapped" | "";
  showInactive: boolean;
  sort: AccountSort;
}

const DEFAULT_QUERY: ChartOfAccountsQuery = {
  search: "",
  accountCategory: "",
  allocation: "",
  showInactive: false,
  sort: DEFAULT_ACCOUNT_SORT,
};

const PAGE_SIZE = 25;

/**
 * The tenant's chart of accounts, and the screen where Pendapatan and Beban are
 * mapped to the lines that will carry them in the laba rugi.
 *
 * A FLAT, PAGED TABLE — it used to be a tree grouped under the fifteen category
 * headings. Both changes came from the BO mockup, and both are worth stating
 * because the tree was deliberate:
 *
 *   THE CHEVRON HAD TO MEAN ONE THING. A row now opens to reveal its Detil Akun,
 *   which is the point of the screen. A second chevron on the same row, folding
 *   sub-accounts, would be two controls that look identical and do unrelated
 *   things. The hierarchy survives as INDENTATION on the code column — the one
 *   thing it was there to show — and the seeded chart is flat anyway (26 root
 *   accounts, no 1000 Aset above them).
 *
 *   PAGING AND CATEGORY HEADINGS CANNOT BOTH BE RIGHT. A group cut in half by a
 *   page boundary is worse than no grouping, so the heading went and the
 *   category stayed as a column and a filter — which is what people were reading
 *   it for.
 *
 * EVERY FILTER IS LOCAL, including the paging. The request is made once and asks
 * for the whole live chart — see the hook for why narrowing it server-side would
 * break the per-category counts. A chart is tens to low hundreds of rows, so
 * slicing a page out of one already in hand costs nothing a round trip would not
 * cost more.
 *
 * ALLOCATION IS NOT OFFERED TO EVERY ACCOUNT, and the three ways it is withheld
 * are three different facts, kept apart by `allocationState`: an asset can never
 * have a line (Tidak berlaku), a tenant with one line and one branch has nothing
 * to divide (Tidak perlu alokasi), and a Pendapatan or Beban account nobody has
 * mapped is the one case somebody must act on (Belum Dipetakan, in orange —
 * §4's "a human must act").
 */
export function ChartOfAccountsScreen() {
  const { accounts, byId, loading, error, refetch } = useChartOfAccounts();
  /**
   * The lines and branches a rule can point at, and — before that — how many of
   * each this tenant has, which decides whether the feature is shown at all.
   *
   * Fails softly: `businessLines:read` and `branches:read` are their own grants,
   * and a chart of accounts that refused to render over a missing label would be
   * a screen broken by a permission it does not need.
   */
  const { businessLines, branches } = useAllocationTargets();

  const shape = useMemo(
    () => tenantShape(businessLines.length, branches.length),
    [businessLines.length, branches.length],
  );

  const lineNames = useMemo(
    () => new Map(businessLines.map((line) => [line._id, line.name])),
    [businessLines],
  );
  const branchNames = useMemo(
    () => new Map(branches.map((branch) => [branch._id, branch.name])),
    [branches],
  );

  const [query, setQuery] = useState<ChartOfAccountsQuery>(DEFAULT_QUERY);
  const [page, setPage] = useState(1);
  /** Which row is open. ONE AT A TIME — see `toggleRow`. */
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);
  /** The account whose status is mid-flight, so its badge can be disabled. */
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  const patchQuery = useCallback((patch: Partial<ChartOfAccountsQuery>) => {
    setQuery((previous) => ({ ...previous, ...patch }));
    // Any narrowing returns to page 1 — otherwise a filter that shrinks the list
    // strands somebody on a page that no longer exists.
    setPage(1);
  }, []);

  const term = query.search.trim().toLowerCase();

  const filtered = useMemo(() => {
    const matches = accounts.filter((account) => {
      if (
        query.accountCategory !== "" &&
        account.accountCategory !== query.accountCategory
      ) {
        return false;
      }
      if (!query.showInactive && !account.isActive) return false;
      if (!matchesAllocation(account, query.allocation, shape)) return false;
      if (!term) return true;
      return (
        account.code.toLowerCase().includes(term) ||
        account.name.toLowerCase().includes(term)
      );
    });

    return matches.sort(compareAccounts(query.sort));
  }, [accounts, query, term, shape]);

  const countsByCategory = useMemo(() => {
    const counts = new Map<AccountCategory, number>();
    for (const account of accounts) {
      counts.set(
        account.accountCategory,
        (counts.get(account.accountCategory) ?? 0) + 1,
      );
    }
    return counts;
  }, [accounts]);

  const unmappedCount = useMemo(
    () =>
      accounts.filter(
        (account) => allocationState(account, shape).kind === "unmapped",
      ).length,
    [accounts, shape],
  );

  const inactiveCount = accounts.filter((account) => !account.isActive).length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  /**
   * ONE ROW OPEN AT A TIME. Each panel holds an unsaved draft, so two open rows
   * are two drafts somebody can forget about — and the second Simpan would look
   * like it saved both.
   */
  const toggleRow = (accountId: string) =>
    setOpenAccountId((current) => (current === accountId ? null : accountId));

  /**
   * Flip an account between active and inactive, from the row's kebab.
   *
   * IN THE ROW RATHER THAN INSIDE THE EDIT FORM: retiring an account is the
   * single most common edit anybody makes here, and it needed a page load, a
   * form and a save.
   *
   * IN THE MENU RATHER THAN ON THE BADGE. The first cut made the status badge
   * itself the button, which is one click and was the wrong one click: a badge
   * that acts cannot be told apart from a badge that only reports, so reading
   * down the Status column became something you could do damage with. A named
   * menu row ("Nonaktifkan akun") says what will happen before it happens, and
   * costs a deliberate second click.
   *
   * NO CONFIRM DIALOG, though. Nothing is destroyed — an inactive account still
   * explains every journal line that names it — and the same menu row undoes it.
   *
   * DEACTIVATING TURNS ON "Tampilkan akun nonaktif" WHEN IT WAS OFF, and that
   * is not a convenience — without it the control is a trap. The list hides
   * inactive accounts by default, so the row a person just pressed vanishes at
   * the moment they press it, taking the only way to undo it with it: the badge
   * they would press again is no longer on screen, and nothing tells them the
   * filter is why. An action must not hide its own undo.
   *
   * It widens the list to every inactive account, not just this one — the same
   * thing the panel's toggle does, because it IS the panel's toggle. The `Filter
   * (n)` badge goes up with it, which is what keeps the change honest, and the
   * toast says it happened so it does not read as the list misbehaving.
   */
  async function toggleStatus(account: ChartOfAccount) {
    setTogglingId(account._id);
    setActionError(null);

    try {
      await chartOfAccountsService.update(account._id, {
        isActive: !account.isActive,
      });

      const deactivated = account.isActive;
      const wouldVanish = deactivated && !query.showInactive;

      if (wouldVanish) {
        // Not through `patchQuery`: that resets to page 1, and somebody on page
        // 3 pressed a badge, not a filter. `safePage` clamps if the list shrinks.
        setQuery((previous) => ({ ...previous, showInactive: true }));
      }

      swalToast(
        !deactivated
          ? `${account.code} diaktifkan.`
          : wouldVanish
            ? `${account.code} dinonaktifkan. Akun nonaktif ikut ditampilkan supaya bisa diaktifkan lagi.`
            : `${account.code} dinonaktifkan.`,
      );
      refetch();
    } catch (caught) {
      setActionError(
        caught instanceof ApiError
          ? caught.message
          : "Gagal mengubah status akun. Coba lagi.",
      );
    } finally {
      setTogglingId(null);
    }
  }

  const canUpdate = can("chartOfAccounts", "update");
  const columnCount = canUpdate ? 6 : 5;
  const note = shapeNote(shape);

  return (
    <div className="flex flex-col gap-6">
      <AccountingModuleHeader />

      {/* What the Aturan Alokasi column is for, before anybody clicks a row.
          Only where it applies: a tenant with one line and one branch gets the
          note below instead, which says why the column is empty. */}
      {!needsNoAllocation(shape) && (
        <div className="rounded-xl border border-border bg-navy-100 p-4 text-sm">
          <p className="font-bold text-foreground">
            Cara kerja Aturan Alokasi
          </p>
          <p className="mt-1 text-foreground">
            Hanya akun Pendapatan dan Beban yang perlu dipetakan, dan satu akun
            bisa punya beberapa aturan sekaligus — klik barisnya untuk membuka
            rinciannya. Contohnya Beban Gaji: staf grooming bisa Direct ke satu
            lini, sekaligus staf admin yang Shared-Overall.
          </p>
        </div>
      )}

      {note && (
        <Alert variant="info">
          <span className="font-medium">Pilihannya menyesuaikan tenant ini.</span>{" "}
          {note}
        </Alert>
      )}

      {error && (
        <Alert variant="error">
          <span className="flex flex-wrap items-center gap-3">
            {error}
            <Button variant="secondary" size="sm" onClick={refetch}>
              <RotateCcw className="size-4" />
              Coba lagi
            </Button>
          </span>
        </Alert>
      )}

      {actionError && <Alert variant="error">{actionError}</Alert>}

      <ChartOfAccountsToolbar
        query={query}
        countsByCategory={countsByCategory}
        inactiveCount={inactiveCount}
        unmappedCount={unmappedCount}
        shape={shape}
        onChange={patchQuery}
      />

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
              ? "Tekan Coba lagi di atas setelah koneksi ke server pulih."
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
                <TableHead>Kategori</TableHead>
                <TableHead>Aturan alokasi</TableHead>
                <TableHead>Status</TableHead>
                {canUpdate && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={columnCount}
                    className="px-4 py-16 text-center"
                  >
                    <p className="font-medium text-foreground">
                      Tidak ada akun yang cocok
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Coba kata kunci lain, atau ubah filternya.
                    </p>
                  </TableCell>
                </TableRow>
              )}

              {visible.map((account) => {
                const state = allocationState(account, shape);
                const expandable = canEditAllocations(state);
                const open = openAccountId === account._id;

                return (
                  // The row and its panel are two <tr>s, so they need a wrapper
                  // that renders no element of its own — a <div> between <tbody>
                  // and <tr> is invalid HTML and browsers hoist it out.
                  <Fragment key={account._id}>
                    <TableRow
                      className={cn(
                        // A chevron in the row makes ui/table's
                        // `has-aria-expanded:bg-muted/50` match, which would
                        // tint every mappable row grey for no reason a reader
                        // could name — and would outrank the deactivated tint
                        // beside it, since a `:has()` selector beats a plain
                        // class. Both cases therefore restate the fill.
                        account.isActive
                          ? "has-aria-expanded:bg-transparent"
                          : "bg-surface-hover has-aria-expanded:bg-surface-hover",
                        open && "bg-navy-100 has-aria-expanded:bg-navy-100",
                      )}
                    >
                      <TableCell className="px-4 py-2.5">
                        <div
                          className="flex items-center gap-1.5"
                          style={{ paddingLeft: `${depthOf(account, byId) * 18}px` }}
                        >
                          <span className="text-sm tabular-nums">
                            <HighlightText text={account.code} query={term} />
                          </span>
                          {/*
                            THE "SUMBER" COLUMN, COMPRESSED TO AN ICON. The BO
                            mockup has five columns and no such column, but
                            dropping the fact outright would mean somebody only
                            learns a code is frozen when the server refuses to
                            change it. A seeded account cannot be renumbered,
                            recategorised or deleted, so it is a property of the
                            CODE and belongs beside it.

                            The icon carries a title rather than standing alone —
                            §1.3's rule about colour is the same rule about shape:
                            a mark nobody can name is not a status.
                          */}
                          {account.isDefault && (
                            <Lock
                              className="size-3.5 shrink-0 text-muted"
                              aria-label="Akun bawaan sistem"
                            >
                              <title>
                                Akun bawaan sistem — kode dan kategorinya tidak
                                bisa diubah, dan tidak bisa dihapus.
                              </title>
                            </Lock>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="px-4 py-2.5 text-sm font-medium">
                        <HighlightText text={account.name} query={term} />
                      </TableCell>

                      <TableCell className="px-4 py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            accountCategoryTone(account.accountCategory),
                          )}
                        >
                          {ACCOUNT_CATEGORY_LABEL[account.accountCategory]}
                        </span>
                      </TableCell>

                      <TableCell className="px-4 py-2.5">
                        {expandable ? (
                          <button
                            type="button"
                            onClick={() => toggleRow(account._id)}
                            aria-expanded={open}
                            className="flex items-center gap-1.5 rounded-md text-left text-sm text-foreground transition-colors hover:text-primary focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            {open ? (
                              <ChevronDown className="size-4 shrink-0 text-muted" />
                            ) : (
                              <ChevronRight className="size-4 shrink-0 text-muted" />
                            )}
                            <AllocationSummary
                              account={account}
                              shape={shape}
                              lineNames={lineNames}
                              branchNames={branchNames}
                            />
                          </button>
                        ) : (
                          <span className="text-sm text-muted">
                            {state.kind === "notApplicable"
                              ? "Tidak berlaku"
                              : "Tidak perlu alokasi"}
                          </span>
                        )}
                      </TableCell>

                      {/*
                        A STATUS, NOT A BUTTON. It was briefly clickable — the
                        fastest possible route to the commonest edit here — and
                        that was wrong for the reason §9 gives about badges
                        generally: a badge that acts is indistinguishable from
                        one that only reports, so a column of them turns a glance
                        down the chart into a minefield. Retiring an account is
                        now a named row in the kebab, where it takes a deliberate
                        second click and says what it will do first.
                      */}
                      <TableCell className="px-4 py-2.5">
                        <span
                          title={
                            account.isActive
                              ? undefined
                              : "Masih menjelaskan jurnal lama, tapi tidak ditawarkan untuk posting baru."
                          }
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            account.isActive
                              ? "bg-tint-success text-success"
                              : "bg-tint-neutral text-muted",
                          )}
                        >
                          {account.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </TableCell>

                      {canUpdate && (
                        <TableCell className="px-4 py-2.5">
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Aksi untuk ${account.code} ${account.name}`}
                                >
                                  <EllipsisVertical className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>

                              <DropdownMenuContent>
                                <Can feature="chartOfAccounts" action="update">
                                  <DropdownMenuItem asChild>
                                    <Link
                                      href={`${ACCOUNTING_CRUMBS.accounts.href}/${account._id}/edit`}
                                    >
                                      <Pencil />
                                      Edit akun
                                    </Link>
                                  </DropdownMenuItem>
                                </Can>
                                <Can feature="chartOfAccounts" action="update">
                                  {/*
                                    NOT `destructive`, though it is the row that
                                    changes something: nothing is destroyed. The
                                    account keeps explaining every journal line
                                    that names it; it simply stops being offered
                                    for new ones, and pressing this again undoes
                                    it. Danger styling here would cry wolf on the
                                    one screen where a real refusal (deleting an
                                    account with history) has to stand out.
                                  */}
                                  <DropdownMenuItem
                                    disabled={togglingId === account._id}
                                    onSelect={() => toggleStatus(account)}
                                  >
                                    {account.isActive ? (
                                      <>
                                        <Ban />
                                        Nonaktifkan akun
                                      </>
                                    ) : (
                                      <>
                                        <CircleCheck />
                                        Aktifkan akun
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                </Can>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>

                    {open && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={columnCount} className="p-3">
                          <AccountAllocationPanel
                            account={account}
                            shape={shape}
                            businessLines={businessLines}
                            branches={branches}
                            editable={canUpdate}
                            onSaved={refetch}
                            onClose={() => setOpenAccountId(null)}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {accounts.length > 0 && (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          unit="akun"
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

/**
 * The Aturan Alokasi cell's text — one rule spelled out, or a count with a chip
 * per kind.
 *
 * "Belum Dipetakan" IS THE ONLY ORANGE THING ON THIS SCREEN, which is §4's rule
 * working as intended: orange means a human must act, and this is the one state
 * where one must. Every other cell here is a fact, not a task.
 */
function AllocationSummary({
  account,
  shape,
  lineNames,
  branchNames,
}: {
  account: ChartOfAccount;
  shape: ReturnType<typeof tenantShape>;
  lineNames: Map<string, string>;
  branchNames: Map<string, string>;
}) {
  const state = allocationState(account, shape);

  if (state.kind === "unmapped") {
    return (
      <span className="rounded-full bg-tint-warning px-2 py-0.5 text-xs font-medium text-warning">
        Belum dipetakan
      </span>
    );
  }

  if (state.kind === "single") {
    return (
      <span className="text-sm">
        {describeAllocation(state.rule, lineNames, branchNames, shape)}
      </span>
    );
  }

  if (state.kind === "several") {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm">{state.allocations.length} aturan</span>
        {countByType(state.allocations).map(({ type, count }) => (
          <span
            key={type}
            className="rounded-full bg-tint-info px-2 py-0.5 text-xs font-medium text-info"
          >
            {shape.branchCount > 1 || type === "direct"
              ? ALLOCATION_TYPE_LABEL[type]
              : "Shared"}{" "}
            ×{count}
          </span>
        ))}
      </span>
    );
  }

  return null;
}

/**
 * How deep an account sits under its root, for the indent on the code column.
 *
 * Walks `parentAccountId` rather than being carried on the row, because the list
 * is flat and a filter can remove an ancestor without removing its child. The
 * walk is bounded by the backend's MAX_DEPTH of 4, and the extra guard is
 * against a cycle the server refuses to write but a stale response could still
 * describe.
 */
function depthOf(
  account: ChartOfAccount,
  byId: Map<string, ChartOfAccount>,
): number {
  let depth = 0;
  let parentId = account.parentAccountId;

  while (parentId && depth < 4) {
    depth += 1;
    parentId = byId.get(parentId)?.parentAccountId ?? null;
  }

  return depth;
}

/** Whether an account passes the Tipe Alokasi filter. */
function matchesAllocation(
  account: ChartOfAccount,
  wanted: ChartOfAccountsQuery["allocation"],
  shape: ReturnType<typeof tenantShape>,
): boolean {
  if (wanted === "") return true;

  const state = allocationState(account, shape);

  // Both filters are about accounts that CAN be mapped, so an asset never
  // matches either — "unmapped" on a bank account would be a row nobody can act
  // on, which is the opposite of what that filter is for.
  if (wanted === "unmapped") return state.kind === "unmapped";
  if (state.kind !== "single" && state.kind !== "several") return false;

  return (account.allocations ?? []).some(
    (rule) => rule.allocationType === wanted,
  );
}
