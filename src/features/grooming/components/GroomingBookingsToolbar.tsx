"use client";

import { useEffect, useState } from "react";
import { ListFilter } from "lucide-react";

import {
  FilterBar,
  FilterCheckList,
  FilterPanel,
  FilterSearch,
  FilterSelect,
  FilterTrigger,
} from "@/components";
import { BOOKING_STATUS_LABELS } from "@/features/booking";
import { bookingService } from "@/services/booking.service";
import type {
  BookingLocation,
  BookingStatus,
  GroomerAvailability,
  Service,
} from "@/types/api";

import {
  countFilters,
  DEFAULT_FILTERS,
  isoDate,
  type GroomingFilters,
  type GroomingSort,
} from "../board";

const SORTS: { value: GroomingSort; label: string }[] = [
  { value: "schedule_asc", label: "Jadwal paling awal" },
  { value: "schedule_desc", label: "Jadwal paling akhir" },
  { value: "value_desc", label: "Nilai terbesar" },
];

/** In the order a booking walks them — see BookingsToolbar. */
const STATUSES: BookingStatus[] = [
  "draft",
  "requested",
  "confirmed",
  "pickup",
  "arrived",
  "in_progress",
  "completed",
  "delivery",
  "return_to_pawrents",
  "cancelled",
];

const LOCATIONS: { value: BookingLocation; label: string }[] = [
  { value: "in_store", label: "Di toko" },
  { value: "in_home", label: "Di rumah" },
];

/**
 * Search, and one Filter button.
 *
 * A PANEL, BY §8's COUNT: Urutkan plus four multi-selects. Every field waits for
 * Terapkan, so composing "Sinta, di rumah, In Progress" does not redraw the
 * table three times on the way.
 *
 * SORTING IS A FIELD HERE, NOT A CLICKABLE HEADER as the mockup draws it — §8
 * is binding, and it is also the one ordering control the rest of the app's
 * lists use.
 *
 * THE MOCKUP'S "Jenis hewan" IS NOT OFFERED. A booking does not carry the
 * animal's species, so the field would filter nothing.
 */
export function GroomingBookingsToolbar({
  search,
  onSearch,
  filters,
  onFilters,
  services,
}: {
  search: string;
  onSearch: (search: string) => void;
  filters: GroomingFilters;
  onFilters: (filters: GroomingFilters) => void;
  /** The Grooming line's services, for the Layanan field. */
  services: Service[];
}) {
  /*
    From `bookings/availability`, not the user register — the same reason
    BookingsToolbar gives: it rides on `bookings:read`.
  */
  const [groomers, setGroomers] = useState<GroomerAvailability[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);

  useEffect(() => {
    let active = true;

    bookingService
      .availability(isoDate(new Date()))
      .then((rows) => {
        if (active) setGroomers(rows);
      })
      .catch(() => {
        /* The field says there is nobody to pick. */
      });

    return () => {
      active = false;
    };
  }, []);

  const count = countFilters(filters);

  function onOpenChange(next: boolean) {
    // Seeded on every open, so clicking away abandons the draft.
    if (next) setDraft(filters);
    setOpen(next);
  }

  function patch(change: Partial<GroomingFilters>) {
    setDraft((prev) => ({ ...prev, ...change }));
  }

  return (
    <FilterBar
      searchPlacement="leading"
      searchClassName="min-w-[12rem] flex-1"
      search={
        <FilterSearch
          value={search}
          onChange={onSearch}
          placeholder="Cari hewan, pelanggan, atau nomor booking…"
          ariaLabel="Cari booking grooming"
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
          onFilters(DEFAULT_FILTERS);
          setOpen(false);
        }}
        onApply={() => {
          onFilters(draft);
          setOpen(false);
        }}
      >
        <FilterSelect
          layout="field"
          label="Urutkan"
          value={draft.sort}
          unsetValue="schedule_asc"
          options={SORTS}
          onChange={(sort) => patch({ sort })}
        />
        <FilterCheckList
          label="Status"
          options={STATUSES.map((status) => ({
            value: status,
            label: BOOKING_STATUS_LABELS[status],
          }))}
          values={draft.statuses}
          onChange={(statuses) => patch({ statuses })}
        />
        <FilterCheckList
          label="Groomer"
          options={groomers.map((groomer) => ({
            value: groomer._id,
            label: groomer.fullName,
          }))}
          values={draft.groomerIds}
          onChange={(groomerIds) => patch({ groomerIds })}
          empty="Belum ada staf yang ditandai Groomer di Master Data › Staf."
        />
        <FilterCheckList
          label="Layanan"
          options={services
            .filter(
              (service) =>
                service.serviceType !== "addon" && service.deletedAt === null,
            )
            .map((service) => ({ value: service._id, label: service.name }))}
          values={draft.serviceIds}
          onChange={(serviceIds) => patch({ serviceIds })}
          empty="Belum ada layanan grooming."
        />
        <FilterCheckList
          label="Tempat"
          options={LOCATIONS}
          values={draft.locations}
          onChange={(locations) => patch({ locations })}
        />
      </FilterPanel>
    </FilterBar>
  );
}
