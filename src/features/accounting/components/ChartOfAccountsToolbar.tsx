"use client";

import { useState } from "react";
import Link from "next/link";
import { ListFilter, Plus } from "lucide-react";

import {
  FilterBar,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  FilterTrigger,
  withAll,
  type FilterOption,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { AccountCategory } from "@/types/accounting";

import {
  DEFAULT_ACCOUNT_SORT,
  type AccountSort,
} from "../accountSort";
import { ACCOUNT_CATEGORIES, ACCOUNT_CATEGORY_LABEL } from "../labels";
import { ACCOUNTING_CRUMBS } from "../crumbs";
import type { ChartOfAccountsQuery } from "./ChartOfAccountsScreen";

/**
 * The chart of accounts' controls: one row — search, one Filter button, the
 * actions — with the ordering and the remaining filter inside the panel. The
 * catalogue's arrangement (ProductsToolbar), at every width, and for the reason
 * §8 gives: one panel is one tree of fields to keep in step, where a bar that
 * collapses on a phone is two.
 *
 * Purely presentational: it renders the current query and reports changes up.
 *
 * THE ACCOUNT CATEGORY IS A FIELD IN THE PANEL, not the tile row it replaced.
 * What the tiles carried that a plain select would not is the count per group,
 * so that came with it — `FilterOption.count`, rendered at the end of each row.
 * The other thing they showed, the normal balance, is on every group heading in
 * the table already.
 *
 * IT WAS THE CLASS UNTIL CATEGORIES LANDED. Fifteen options rather than five,
 * and the trade is worth it: `asset` could not tell cash from stock from a
 * vehicle, which is the question somebody filtering a chart of accounts actually
 * has. The counts make the long list navigable — a category with 0 beside it is
 * one nobody has to read.
 *
 * Being inside the panel has two consequences, and both are what makes it
 * consistent rather than a special case: the category IS counted in the
 * `Filter (n)` badge, and Reset clears it along with everything else.
 */
const SORTS: FilterOption<AccountSort>[] = [
  { value: "codeAsc", label: "Kode 0–9" },
  { value: "codeDesc", label: "Kode 9–0" },
  { value: "nameAsc", label: "Nama A–Z" },
  { value: "nameDesc", label: "Nama Z–A" },
];

/**
 * The fifteen categories, each carrying how many accounts are in it.
 *
 * The count is why this is built per render rather than declared as a constant:
 * it is a property of the chart on screen, not of the enum.
 *
 * EVERY CATEGORY IS LISTED, including the ones at zero. A picker that hid them
 * would answer "why is there no Aset Tetap filter" with silence, where a row
 * reading `Aset Tetap 0` answers it — and the list is in report order, so a
 * missing row would also break the reading of the ones around it.
 */
function categoryOptions(
  counts: Map<AccountCategory, number>,
): FilterOption<AccountCategory | "">[] {
  return withAll<AccountCategory | "">(
    ACCOUNT_CATEGORIES.map((accountCategory) => ({
      value: accountCategory,
      label: ACCOUNT_CATEGORY_LABEL[accountCategory],
      count: counts.get(accountCategory) ?? 0,
    })),
    "Semua kategori",
  );
}

/** Everything the panel edits, as one draft. */
interface AccountFilters {
  accountCategory: AccountCategory | "";
  showInactive: boolean;
  sort: AccountSort;
}

/**
 * What Reset returns to — the screen's defaults, not "empty".
 *
 * The ordering is included: a list with no ordering is not a thing, so Reset
 * puts it back to by-code rather than clearing it to nothing.
 */
const CLEARED: AccountFilters = {
  accountCategory: "",
  showInactive: false,
  sort: DEFAULT_ACCOUNT_SORT,
};

export function ChartOfAccountsToolbar({
  query,
  countsByCategory,
  inactiveCount,
  onChange,
}: {
  query: ChartOfAccountsQuery;
  /** How many accounts each category holds — shown against its option. */
  countsByCategory: Map<AccountCategory, number>;
  /** Shown on the toggle, so the cost of flipping it is visible first. */
  inactiveCount: number;
  onChange: (patch: Partial<ChartOfAccountsQuery>) => void;
}) {
  return (
    <FilterBar
      // Search leads the row and takes what is left of it: with the filters
      // collapsed there is nothing else on the line that grows, and what people
      // type here — "Persediaan Barang" — is long.
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      // Below sm the row cannot hold all of it, so the buttons take a line of
      // their own and take all of it.
      actionsClassName="max-sm:w-full"
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          // Names exactly the two fields the search matches — an accountant
          // looks up "1201" as readily as "Persediaan".
          placeholder="Cari kode atau nama akun…"
          ariaLabel="Cari akun"
          fill
        />
      }
      actions={
        // No refresh button: the chart is read once and changes only when
        // somebody edits it, so a reload control on the bar would be a button
        // that does nothing visible almost every time it is pressed. The one
        // case that genuinely needs it — a request that failed — carries its
        // own retry, on the error banner where the problem is stated.
        <Can feature="chartOfAccounts" action="create">
          <Button asChild>
            <Link href={`${ACCOUNTING_CRUMBS.accounts.href}/new`}>
              <Plus className="size-4" />
              Tambah akun
            </Link>
          </Button>
        </Can>
      }
    >
      <AccountFilterPanel
        applied={{
          accountCategory: query.accountCategory,
          showInactive: query.showInactive,
          sort: query.sort,
        }}
        categoryOptions={categoryOptions(countsByCategory)}
        inactiveCount={inactiveCount}
        onApply={onChange}
      />
    </FilterBar>
  );
}

/**
 * The ordering, the account category and the deactivated-accounts toggle, behind
 * one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8). Reset returns
 * them all to their defaults and applies at once, because clearing a filter is
 * not a change anyone composes.
 */
function AccountFilterPanel({
  applied,
  categoryOptions,
  inactiveCount,
  onApply,
}: {
  applied: AccountFilters;
  categoryOptions: FilterOption<AccountCategory | "">[];
  inactiveCount: number;
  onApply: (next: AccountFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);

  /**
   * How many filters are narrowing the list right now.
   *
   * THE ORDERING IS NOT COUNTED. Every list has one, so it is never "on" — a
   * badge reading `Filter (1)` over an unnarrowed chart would train people to
   * ignore the number, which is the one thing here that must stay worth
   * reading. Everything else the panel conceals IS counted.
   */
  const count = [applied.accountCategory !== "", applied.showInactive].filter(
    Boolean,
  ).length;

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft rather than
    // leaving it half-edited for the next visit.
    if (next) setDraft(applied);
    setOpen(next);
  }

  return (
    <>
      <FilterTrigger
        label={count === 0 ? "Filter" : `Filter (${count})`}
        active={count > 0}
        icon={<ListFilter className="size-4" />}
        aria-label="Filter"
        onClick={() => onOpenChange(true)}
      />

      <FilterPanel
        open={open}
        onOpenChange={onOpenChange}
        onReset={() => {
          onApply(CLEARED);
          setOpen(false);
        }}
        onApply={() => {
          onApply(draft);
          setOpen(false);
        }}
      >
        {/* Sort leads: it is the one field here that is always set, and the
            only one that changes what the top of the list is rather than what
            is in it. */}
        <FilterSelect
          layout="field"
          label="Urutkan"
          ariaLabel="Urutkan"
          value={draft.sort}
          options={SORTS}
          unsetValue={DEFAULT_ACCOUNT_SORT}
          onChange={(sort) => setDraft((prev) => ({ ...prev, sort }))}
        />
        <FilterSelect
          layout="field"
          label="Kategori akun"
          ariaLabel="Filter kategori akun"
          value={draft.accountCategory}
          options={categoryOptions}
          onChange={(accountCategory) =>
            setDraft((prev) => ({ ...prev, accountCategory }))
          }
        />
        <FilterToggle
          label={`Tampilkan akun nonaktif (${inactiveCount})`}
          checked={draft.showInactive}
          onChange={(showInactive) =>
            setDraft((prev) => ({ ...prev, showInactive }))
          }
        />
      </FilterPanel>
    </>
  );
}
