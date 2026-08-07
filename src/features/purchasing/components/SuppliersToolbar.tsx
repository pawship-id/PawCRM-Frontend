"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Can } from "@/features/permissions";
import type { SupplierType } from "@/types/api";

import type {
  SupplierActivityFilter,
  SuppliersQuery,
} from "../hooks/useSuppliers";

/**
 * The supplier list controls: free-text search, the cooperation-model filter,
 * the activity filter, a "show deleted" toggle, and the way to the create
 * screen.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * useSuppliers. Mirrors CustomersToolbar, including the "all" sentinel, which
 * exists because Radix Select forbids an empty item value.
 *
 * ACTIVITY AND DELETED ARE SEPARATE CONTROLS, and that is the whole reason this
 * toolbar has four. They are different questions — "do we still buy from them"
 * versus "was the record removed" — and a supplier can be either, both or
 * neither. One combined control would have to invent an order between them and
 * would leave one of the four combinations unreachable.
 */
const ALL = "all";

const TYPES: Array<{ value: SupplierType; label: string }> = [
  { value: "beli_putus", label: "Beli putus" },
  { value: "konsinyasi", label: "Konsinyasi" },
  { value: "both", label: "Keduanya" },
];

const ACTIVITIES: Array<{ value: SupplierActivityFilter; label: string }> = [
  { value: "all", label: "Aktif & nonaktif" },
  { value: "active", label: "Hanya aktif" },
  { value: "inactive", label: "Hanya nonaktif" },
];

export function SuppliersToolbar({
  query,
  onChange,
}: {
  query: SuppliersQuery;
  onChange: (patch: Partial<SuppliersQuery>) => void;
}) {
  const typeValue = query.type === "" ? ALL : query.type;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query.search}
            onChange={(event) => onChange({ search: event.target.value })}
            // Names exactly the four fields the API searches — a placeholder
            // promising a field the server does not match is a bug report
            // waiting to be filed.
            placeholder="Cari nama, PIC, telepon, atau NPWP"
            aria-label="Cari supplier"
            className="pl-9"
          />
        </div>

        <Select
          value={typeValue}
          onValueChange={(value) =>
            onChange({ type: value === ALL ? "" : (value as SupplierType) })
          }
        >
          <SelectTrigger aria-label="Filter tipe kerja sama" className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua tipe</SelectItem>
            {TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={query.activity}
          onValueChange={(value) =>
            onChange({ activity: value as SupplierActivityFilter })
          }
        >
          <SelectTrigger aria-label="Filter status aktif" className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIVITIES.map((activity) => (
              <SelectItem key={activity.value} value={activity.value}>
                {activity.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Checkbox
            id="show-deleted-suppliers"
            checked={query.includeDeleted}
            onCheckedChange={(checked) =>
              onChange({ includeDeleted: checked === true })
            }
          />
          <Label htmlFor="show-deleted-suppliers" className="font-normal">
            Tampilkan terhapus
          </Label>
        </div>
      </div>

      <Can feature="suppliers" action="create">
        <Button asChild>
          <Link href="/dashboard/purchasing/suppliers/new">
            <Plus className="size-4" />
            Supplier baru
          </Link>
        </Button>
      </Can>
    </div>
  );
}
