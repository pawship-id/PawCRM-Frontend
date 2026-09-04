"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import {
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  withAll,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { businessLineService } from "@/services/businessLine.service";
import type { ServicesQuery } from "../hooks/useServices";

/**
 * The list controls: free-text search, a business-line filter, an offered/retired
 * filter, a "show deleted" toggle, and the entry point to the create screen.
 * Purely presentational — it renders the current query and reports changes up to
 * useServices. Mirrors PetsToolbar.
 *
 * THE BUSINESS-LINE OPTIONS ARE FETCHED, unlike the pet species which are a
 * closed enum. A tenant names its own lines, so the list cannot be spelled out
 * here — and a `businessLineId` filter with hardcoded labels would show the wrong
 * words for every tenant that did not happen to call theirs "Grooming".
 */
const CARE = withAll<ServicesQuery["isActive"]>(
  [
    { value: "true", label: "Masih ditawarkan" },
    { value: "false", label: "Tidak aktif" },
  ],
  "Semua status",
);

export function ServicesToolbar({
  query,
  onChange,
}: {
  query: ServicesQuery;
  onChange: (patch: Partial<ServicesQuery>) => void;
}) {
  const [lines, setLines] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    let active = true;

    businessLineService
      .list({ limit: 100 })
      .then((result) => {
        if (!active) return;
        setLines(
          result.items.map((line) => ({ value: line._id, label: line.name })),
        );
      })
      // A filter that cannot load its options is a filter that stays on "Semua",
      // which is the harmless state. Failing loudly here would put a red banner
      // over a working list.
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return (
    <FilterBar
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nama atau kode"
          ariaLabel="Cari layanan"
        />
      }
      actions={
        <Can feature="services" action="create">
          <Button asChild>
            <Link href="/dashboard/master/layanan/new">
              <Plus className="size-4" />
              Layanan baru
            </Link>
          </Button>
        </Can>
      }
    >
      <FilterSelect
        label="Lini bisnis"
        ariaLabel="Filter lini bisnis"
        value={query.businessLineId}
        options={withAll(lines, "Semua lini")}
        onChange={(businessLineId) => onChange({ businessLineId })}
      />
      <FilterSelect
        label="Status"
        ariaLabel="Filter status layanan"
        value={query.isActive}
        options={CARE}
        onChange={(isActive) => onChange({ isActive })}
      />
      <FilterToggle
        label="Tampilkan terhapus"
        checked={query.includeDeleted}
        onChange={(includeDeleted) => onChange({ includeDeleted })}
      />
    </FilterBar>
  );
}
