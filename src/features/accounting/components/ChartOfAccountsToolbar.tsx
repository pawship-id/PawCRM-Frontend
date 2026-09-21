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
import type {
  AccountCategory,
  AccountType,
  AllocationType,
} from "@/types/accounting";
import { accountTypeOf } from "@/types/accounting";

import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_CATEGORY_LABEL,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
} from "../labels";
import {
  allocationChoices,
  needsNoAllocation,
  type TenantShape,
} from "../allocationLabels";
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
 *
 * THE ORDERING IS NOT IN HERE ANY MORE — it moved onto the column headers on 20
 * September 2026, on request, against the BO mockup. ui-rules §8 says sorting is
 * a panel field, and the exception is recorded there rather than only here. The
 * consequence for this file: `Reset` no longer touches the ordering, because a
 * button labelled Reset inside a filter panel should not silently re-sort a
 * table somebody ordered from its headers.
 */
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
  accountType: AccountType | "",
): FilterOption<AccountCategory | "">[] {
  return withAll<AccountCategory | "">(
    ACCOUNT_CATEGORIES
      // NARROWED BY THE CLASS ABOVE IT, which is what stops the two fields from
      // contradicting each other. They are not independent — every category
      // belongs to exactly one class — so offering "Cash & Bank" under a chosen
      // "Beban" would be offering a pair that can never match a single row, and
      // the reader would blame the list rather than the combination.
      .filter(
        (accountCategory) =>
          accountType === "" || accountTypeOf(accountCategory) === accountType,
      )
      .map((accountCategory) => ({
        value: accountCategory,
        label: ACCOUNT_CATEGORY_LABEL[accountCategory],
        count: counts.get(accountCategory) ?? 0,
      })),
    "Semua kategori",
  );
}

/**
 * The five classes, each carrying how many accounts are in it.
 *
 * IN THE ORDER THE ACCOUNTING EQUATION READS THEM — Aset, Kewajiban, Ekuitas,
 * Pendapatan, Beban — and not alphabetically, matching the group headings in the
 * account form's own category picker. The TABLE's Tipe akun column sorts
 * alphabetically, which is a different question: that one orders rows somebody
 * is scanning, this one is a fixed list of five they are choosing from.
 */
function typeOptions(
  counts: Map<AccountType, number>,
): FilterOption<AccountType | "">[] {
  return withAll<AccountType | "">(
    ACCOUNT_TYPES.map((accountType) => ({
      value: accountType,
      label: ACCOUNT_TYPE_LABEL[accountType],
      count: counts.get(accountType) ?? 0,
    })),
    "Semua tipe",
  );
}

/** What the Tipe Alokasi field narrows by. */
type AllocationFilter = AllocationType | "unmapped" | "";

/**
 * The Tipe Alokasi options, in the order the panel reads them.
 *
 * "Belum dipetakan" LEADS, above the three types, because it is the reason
 * anybody opens this filter: it is the only value that answers a question with
 * work attached ("what have we not mapped yet"), where the others answer a
 * question about what is already set.
 *
 * The TYPES come from `allocationChoices`, not from the enum, so the list
 * narrows with the tenant exactly as the picker in the row does — a single-line
 * tenant is not offered a Direct filter that could never match anything.
 */
function allocationOptions(
  shape: TenantShape,
  unmappedCount: number,
): FilterOption<AllocationFilter>[] {
  return withAll<AllocationFilter>(
    [
      { value: "unmapped", label: "Belum dipetakan", count: unmappedCount },
      ...allocationChoices(shape).map((choice) => ({
        value: choice.value as AllocationFilter,
        label: choice.label,
      })),
    ],
    "Semua",
  );
}

/** Everything the panel edits, as one draft. */
interface AccountFilters {
  accountType: AccountType | "";
  accountCategory: AccountCategory | "";
  allocation: AllocationFilter;
  showInactive: boolean;
}

/**
 * What Reset returns to — the screen's defaults, not "empty".
 *
 * The ORDERING IS NOT HERE, unlike every other list's panel: it is set from the
 * column headers, which are visible whether this panel is open or not, so a
 * Reset that re-sorted the table would undo a choice the button does not appear
 * to be about.
 */
const CLEARED: AccountFilters = {
  accountType: "",
  accountCategory: "",
  allocation: "",
  showInactive: false,
};

export function ChartOfAccountsToolbar({
  query,
  countsByType,
  countsByCategory,
  inactiveCount,
  unmappedCount,
  shape,
  onChange,
}: {
  query: ChartOfAccountsQuery;
  /** How many accounts each class holds — shown against its option. */
  countsByType: Map<AccountType, number>;
  /** How many accounts each category holds — shown against its option. */
  countsByCategory: Map<AccountCategory, number>;
  /** Shown on the toggle, so the cost of flipping it is visible first. */
  inactiveCount: number;
  /** How many P&L accounts nobody has mapped — the count worth chasing. */
  unmappedCount: number;
  /** How many lines and branches the tenant runs; decides what is offered. */
  shape: TenantShape;
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
          accountType: query.accountType,
          accountCategory: query.accountCategory,
          allocation: query.allocation,
          showInactive: query.showInactive,
        }}
        typeOptions={typeOptions(countsByType)}
        countsByCategory={countsByCategory}
        allocationOptions={allocationOptions(shape, unmappedCount)}
        // A tenant with one line and one branch has nothing to allocate, so the
        // field is withheld rather than shown with options that all match
        // nothing — see `needsNoAllocation`.
        showAllocationFilter={!needsNoAllocation(shape)}
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
  typeOptions,
  countsByCategory,
  allocationOptions,
  showAllocationFilter,
  inactiveCount,
  onApply,
}: {
  applied: AccountFilters;
  typeOptions: FilterOption<AccountType | "">[];
  /** Built inside, because the category list narrows with the class in the draft. */
  countsByCategory: Map<AccountCategory, number>;
  allocationOptions: FilterOption<AllocationFilter>[];
  showAllocationFilter: boolean;
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
  const count = [
    applied.accountType !== "",
    applied.accountCategory !== "",
    applied.allocation !== "",
    applied.showInactive,
  ].filter(Boolean).length;

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
        {/* The class leads the category: coarse before fine, and the field the
            one below narrows with. */}
        <FilterSelect
          layout="field"
          label="Tipe akun"
          ariaLabel="Filter tipe akun"
          value={draft.accountType}
          options={typeOptions}
          onChange={(accountType) =>
            setDraft((prev) => ({
              ...prev,
              accountType,
              // A category that does not belong to the new class is dropped
              // rather than left set-but-unofferable: it would keep narrowing
              // the list from a field whose own picker no longer shows it.
              accountCategory:
                prev.accountCategory !== "" &&
                accountType !== "" &&
                accountTypeOf(prev.accountCategory) !== accountType
                  ? ""
                  : prev.accountCategory,
            }))
          }
        />
        <FilterSelect
          layout="field"
          label="Kategori akun"
          ariaLabel="Filter kategori akun"
          value={draft.accountCategory}
          options={categoryOptions(countsByCategory, draft.accountType)}
          onChange={(accountCategory) =>
            setDraft((prev) => ({ ...prev, accountCategory }))
          }
        />
        {showAllocationFilter && (
          <FilterSelect
            layout="field"
            label="Tipe alokasi"
            ariaLabel="Filter tipe alokasi"
            value={draft.allocation}
            options={allocationOptions}
            onChange={(allocation) =>
              setDraft((prev) => ({ ...prev, allocation }))
            }
          />
        )}
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
