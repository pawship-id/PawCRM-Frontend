"use client";

import { useEffect, useState } from "react";
import { ListFilter } from "lucide-react";

import {
  FilterBar,
  FilterDateRange,
  FilterField,
  FilterPanel,
  FilterPills,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
  withAll,
} from "@/components";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/features/auth";
import { branchService } from "@/services/branch.service";
import type { Branch } from "@/types/api";
import { accessibleBranches } from "@/utils/accessScope";

import { periodRange, type DateRange, type GroomingPeriod } from "../board";
import type { GroomingServicesQuery } from "../hooks/useGroomingServices";
import { PERIOD_OPTIONS } from "./GroomingPeriodBar";

/** What the Filter panel holds — every narrowing but the search box. */
export type ServiceFilters = Pick<
  GroomingServicesQuery,
  "branchId" | "isActive" | "petType" | "location" | "includeDeleted"
>;

export const EMPTY_SERVICE_FILTERS: ServiceFilters = {
  branchId: "",
  isActive: "",
  petType: "",
  location: "",
  includeDeleted: false,
};

/**
 * `Filter (n)` — §8's badge, which pays back what the panel hides. "Tampilkan
 * terhapus" counts: it changes which rows are on the page, and a list somebody
 * forgot was showing deleted services is a list read wrongly.
 *
 * THE PERIOD DOES NOT COUNT. It is always set — "Bulan ini" by default — and a
 * standing number over an unnarrowed list teaches people to ignore the badge.
 */
export function countServiceFilters(filters: ServiceFilters): number {
  return (
    [filters.branchId, filters.isActive, filters.petType, filters.location].filter(
      (value) => value !== "",
    ).length + (filters.includeDeleted ? 1 : 0)
  );
}

const STATUS_OPTIONS = withAll<GroomingServicesQuery["isActive"]>(
  [
    { value: "true", label: "Aktif" },
    { value: "false", label: "Nonaktif" },
  ],
  "Semua status",
);

const PET_OPTIONS = withAll<GroomingServicesQuery["petType"]>(
  [
    { value: "dog", label: "Anjing" },
    { value: "cat", label: "Kucing" },
  ],
  "Semua jenis hewan",
);

const PLACE_OPTIONS = withAll<GroomingServicesQuery["location"]>(
  [
    { value: "in_store", label: "Di toko" },
    { value: "in_home", label: "Di rumah" },
  ],
  "Semua tempat",
);

/**
 * Layanan & Harga's search and Filter button — the mockup's Filter modal, as
 * `FilterPanel` draws it (a centred modal, two fields abreast, Reset beside
 * Terapkan).
 *
 * A PANEL, BY §8's COUNT: six fields. Every one waits for Terapkan, so picking
 * Barat, Kucing and Di rumah queries once rather than three times.
 *
 * THE MOCKUP'S FIELDS THAT A CATALOGUE CANNOT MEAN ARE NOT HERE. Groomer and
 * Layanan are questions about bookings — a service has no groomer, and filtering
 * a list of services by service is the search box. They stay on the Booking tab,
 * which has them.
 *
 * WHAT EACH FIELD MEANS FOR A SERVICE:
 *  - Cabang — offered at that branch, "semua cabang" services included. The
 *    same value the card above sets; this is a second way to set it;
 *  - Jenis hewan — can be sold for that animal: priced regardless of species,
 *    or with a variant for it;
 *  - Tempat — done there; a service with no location stored counts as the shop;
 *  - Tanggal booking — the card's Periode, drafted here. A service has no date,
 *    so this narrows what "N booking" counts, not which services are listed.
 *    Reset leaves it alone, as the mockup's does.
 *
 * TANGGAL BOOKING IS THE CARD, REDRAWN (13 September 2026, on request): the same
 * four pills, and the two dates only behind Custom, starting from the period in
 * force. It used to be three preset chips over two always-open inputs — a second
 * vocabulary for the one choice the card already offers.
 *
 * NOT SHARED WITH THE BOOKING TAB, though the mockup's panel says "berlaku untuk
 * seluruh menu Grooming". The two panels hold different questions — a booking's
 * status ladder is not a service's Aktif/Nonaktif — and carrying a filter across
 * a tab change would hide rows on a screen whose button never showed it being set.
 */
export function GroomingServicesToolbar({
  search,
  onSearch,
  filters,
  period,
  customRange,
  onApply,
  onReset,
}: {
  search: string;
  onSearch: (search: string) => void;
  filters: ServiceFilters;
  /** The card's pill. */
  period: GroomingPeriod;
  /** The card's dates, meaningful while `period` is "custom". */
  customRange: DateRange;
  onApply: (
    filters: ServiceFilters,
    period: GroomingPeriod,
    customRange: DateRange,
  ) => void;
  /** Clears the filters; the period stays. */
  onReset: () => void;
}) {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const [draftPeriod, setDraftPeriod] = useState(period);
  const [draftCustom, setDraftCustom] = useState(customRange);

  useEffect(() => {
    let active = true;

    branchService
      .list({ limit: 100 })
      .then((result) => {
        // A courtesy, not the isolation — see useBranchOptions.
        if (active) setBranches(accessibleBranches(user, result.items));
      })
      .catch(() => {
        /* The field stays on "Semua cabang", which is the harmless answer. */
      });

    return () => {
      active = false;
    };
  }, [user]);

  const count = countServiceFilters(filters);

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft.
    if (next) {
      setDraft(filters);
      setDraftPeriod(period);
      setDraftCustom(customRange);
    }
    setOpen(next);
  }

  function patch(change: Partial<ServiceFilters>) {
    setDraft((prev) => ({ ...prev, ...change }));
  }

  function pickPeriod(next: GroomingPeriod) {
    // Custom starts from the period in force — the card's rule, for the reason
    // it gives: the numbers should not move until a date does.
    if (next === "custom" && draftPeriod !== "custom") {
      setDraftCustom(periodRange(draftPeriod));
    }
    setDraftPeriod(next);
  }

  return (
    <FilterBar
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      search={
        <FilterSearch
          value={search}
          onChange={onSearch}
          placeholder="Cari nama atau kode layanan…"
          ariaLabel="Cari layanan grooming"
          fill
        />
      }
    >
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
          onReset();
          setOpen(false);
        }}
        onApply={() => {
          onApply(draft, draftPeriod, draftCustom);
          setOpen(false);
        }}
      >
        <FilterSelect
          layout="field"
          label="Cabang"
          value={draft.branchId}
          options={withAll(
            branches.map((branch) => ({ value: branch._id, label: branch.name })),
            "Semua cabang",
          )}
          onChange={(branchId) => patch({ branchId })}
        />
        <FilterSelect
          layout="field"
          label="Status"
          value={draft.isActive}
          options={STATUS_OPTIONS}
          onChange={(isActive) => patch({ isActive })}
        />
        <FilterSelect
          layout="field"
          label="Jenis hewan"
          value={draft.petType}
          options={PET_OPTIONS}
          onChange={(petType) => patch({ petType })}
        />
        <FilterSelect
          layout="field"
          label="Tempat"
          value={draft.location}
          options={PLACE_OPTIONS}
          onChange={(location) => patch({ location })}
        />
        <FilterField label="Terhapus">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground">
            <Checkbox
              checked={draft.includeDeleted}
              onCheckedChange={(next) => patch({ includeDeleted: next === true })}
            />
            Tampilkan terhapus
          </label>
        </FilterField>
        <FilterField
          label="Tanggal booking — sama dengan Periode di atas"
          className="sm:col-span-2"
        >
          <FilterPills
            ariaLabel="Tanggal booking"
            value={draftPeriod}
            options={PERIOD_OPTIONS}
            onChange={pickPeriod}
          />
        </FilterField>
        {draftPeriod === "custom" && (
          <FilterDateRange
            layout="field"
            label="Rentang tanggal"
            ariaLabel="Tanggal booking"
            from={draftCustom.from}
            to={draftCustom.to}
            // The pills above are the presets.
            presets={[]}
            onApply={setDraftCustom}
          />
        )}
      </FilterPanel>
    </FilterBar>
  );
}
