"use client";

import { useState } from "react";
import { ListFilter } from "lucide-react";

import {
  FilterBar,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  FilterTrigger,
  triState,
  withAll,
} from "@/components";

import { useCustomerTypeList } from "@/features/settings";

import type { CustomersQuery } from "../hooks/useCustomers";

/**
 * The list controls: one row — search, and one Filter button — with the VIP tier
 * and the deleted toggle inside a panel.
 *
 * Purely presentational: it renders the current query and reports changes up to
 * useCustomers via `onChange`.
 *
 * THE SHAPE EVERY OTHER LIST IN THE APP USES. This screen and Hewan were the
 * last two holding their filters out on the row while Produk, Kategori, Supplier
 * and the seven inventory lists had moved behind a button. A reader crossing
 * between them should not have to notice which arrangement each screen picked —
 * and search taking the whole row is what narrowing a list of names starts with.
 *
 * FIVE FIELDS IN THE PANEL, AND ALL FIVE NARROW SOMETHING — Kategori and Jenis
 * went live with the form's own fields on 27 September 2026, and the Kategori
 * list is the tenant's own from Pengaturan › Tipe pelanggan. Status joined
 * them on 2 October 2026, the day the customer gained an `isActive` axis.
 * Five fields is comfortably over the floor §8 sets for a panel; it was the
 * neighbourhood argument that carried it when there were two.
 *
 * NO CREATE BUTTON — it moved up to CustomerModuleHeader when the module grew a
 * tab bar, because the button belongs to the page rather than to the narrowing
 * controls, and each tab creates a different thing.
 *
 * The tiers are spelled out rather than mapped from the `VipTier` union with a
 * capitalize class: the label is copy, and copy that happens to match the API's
 * value is a coincidence, not a rule.
 */
const TIERS = withAll<CustomersQuery["vipTier"]>(
  [
    { value: "bronze", label: "Bronze" },
    { value: "silver", label: "Silver" },
    { value: "gold", label: "Gold" },
    { value: "platinum", label: "Platinum" },
  ],
  "Semua tier",
);

/** Everything the panel edits, as one draft. */
interface CustomerFilters {
  vipTier: CustomersQuery["vipTier"];
  customerTypeId: CustomersQuery["customerTypeId"];
  kind: CustomersQuery["kind"];
  active: CustomersQuery["active"];
  includeDeleted: boolean;
}

/**
 * What Reset returns to — the query's own defaults, not "empty". `active`
 * resets to `true`, matching `DEFAULT_QUERY` (2 October 2026): the register
 * opens on "Aktif", so Reset puts it back there rather than to "Semua status".
 */
const CLEARED: CustomerFilters = {
  vipTier: "",
  customerTypeId: "",
  kind: "",
  active: true,
  includeDeleted: false,
};

/** Perorangan or Perusahaan — the model's two, plus "not filtering". */
const KINDS = withAll<CustomersQuery["kind"]>(
  [
    { value: "individual", label: "Perorangan" },
    { value: "company", label: "Perusahaan" },
  ],
  "Semua jenis",
);

/**
 * Aktif / Nonaktif / Semua — the same `triState` shape `BranchesToolbar` uses
 * for the identical question, carrying real `boolean | ""` values rather than
 * a second round of string sentinels.
 */
const STATUSES = triState({
  all: "Semua status",
  yes: "Aktif",
  no: "Nonaktif",
});

export function CustomersToolbar({
  query,
  onChange,
}: {
  query: CustomersQuery;
  onChange: (patch: Partial<CustomersQuery>) => void;
}) {
  const applied: CustomerFilters = {
    vipTier: query.vipTier,
    customerTypeId: query.customerTypeId,
    kind: query.kind,
    active: query.active,
    includeDeleted: query.includeDeleted,
  };

  /**
   * Commits the draft, sending only what actually moved — `setQuery` builds a
   * new object from whatever it is handed and the fetch effect keys on that
   * object's identity, so posting every field back would re-query the list on a
   * Terapkan that changed nothing.
   */
  function apply(next: CustomerFilters) {
    const patch: Partial<CustomersQuery> = {};
    if (next.vipTier !== query.vipTier) patch.vipTier = next.vipTier;
    if (next.customerTypeId !== query.customerTypeId)
      patch.customerTypeId = next.customerTypeId;
    if (next.kind !== query.kind) patch.kind = next.kind;
    if (next.active !== query.active) patch.active = next.active;
    if (next.includeDeleted !== query.includeDeleted)
      patch.includeDeleted = next.includeDeleted;

    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <FilterBar
      // Search leads the row and takes what is left of it: with the filters
      // behind one button there is nothing else on the line that grows.
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari kode, nama, telepon, atau email…"
          ariaLabel="Cari pelanggan"
          fill
        />
      }
    >
      <CustomerFilterPanel applied={applied} onApply={apply} />
    </FilterBar>
  );
}

/**
 * The tier filter and the deleted toggle, behind one button.
 *
 * The fields wait for Terapkan — that is what a panel is (§8). Reset returns the
 * whole set to its defaults and applies at once, because clearing a filter is
 * not a change anyone composes.
 */
function CustomerFilterPanel({
  applied,
  onApply,
}: {
  applied: CustomerFilters;
  onApply: (next: CustomerFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);
  /* The same list the form files customers under — one opinion about what this
     tenant's categories are. */
  const { types } = useCustomerTypeList();

  const categoryOptions = withAll(
    types.map((type) => ({ value: type._id, label: type.name })),
    "Semua kategori",
  );

  /**
   * How many filters are narrowing the list right now. The badge is what makes
   * a collapsed bar safe: a hidden filter is one people forget is on and then
   * read the wrong numbers from.
   *
   * `active` COUNTS AGAINST `true`, NOT `""` — unlike every other field here,
   * its own neutral state is "Aktif" (`DEFAULT_QUERY.active`), not "not
   * filtering". The register already opens narrowed to active customers, so
   * that narrowing is the baseline nothing has to pay the badge back for;
   * only leaving it — "Semua status" or "Nonaktif" — is a choice this row
   * should admit to.
   */
  const count = [
    applied.vipTier !== "",
    applied.customerTypeId !== "",
    applied.kind !== "",
    applied.active !== true,
    applied.includeDeleted,
  ].filter(Boolean).length;

  function patch(change: Partial<CustomerFilters>) {
    setDraft((prev) => ({ ...prev, ...change }));
  }

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
        <FilterSelect
          layout="field"
          label="Tier"
          ariaLabel="Filter tier VIP"
          value={draft.vipTier}
          options={TIERS}
          onChange={(vipTier) => patch({ vipTier })}
        />

        {/*
          THE MOCKUP'S OTHER TWO, LIVE SINCE 27 September 2026. They were drawn
          disabled while the fields did not exist — a filter that narrows nothing
          is worse than a missing one, because somebody sets it and then reads the
          list as though it had been applied. Both narrow on the SERVER: sifting
          the page in the browser would make the table and its pager disagree the
          moment there is a second page.
        */}
        <FilterSelect
          layout="field"
          label="Kategori"
          ariaLabel="Filter kategori pelanggan"
          value={draft.customerTypeId}
          options={categoryOptions}
          onChange={(customerTypeId) => patch({ customerTypeId })}
          disabled={types.length === 0}
          disabledHint="Belum ada tipe pelanggan. Daftarnya diatur di Pengaturan › Tipe pelanggan."
        />
        <FilterSelect
          layout="field"
          label="Jenis"
          ariaLabel="Filter jenis pelanggan"
          value={draft.kind}
          options={KINDS}
          onChange={(kind) => patch({ kind })}
        />

        {/*
          AKTIF / NONAKTIF / SEMUA (2 October 2026) — the same question
          `BranchesToolbar` asks, now that a customer carries the same
          `isActive` axis a branch does. See `isCustomerActive` in
          `CustomerVipBadge.tsx`.
        */}
        <FilterSelect
          layout="field"
          label="Status"
          ariaLabel="Filter status aktif"
          value={draft.active}
          options={STATUSES}
          onChange={(active) => patch({ active })}
        />

        <FilterToggle
          label="Tampilkan pelanggan terhapus"
          checked={draft.includeDeleted}
          onChange={(includeDeleted) => patch({ includeDeleted })}
        />
      </FilterPanel>
    </>
  );
}
