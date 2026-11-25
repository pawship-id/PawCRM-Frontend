"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";

import {
  Alert,
  Card,
  DataTable,
  FilterBar,
  FilterSearch,
  FilterSelect,
  namedOptions,
  withAll,
  type DataTableColumn,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GroomingModuleHeader } from "@/features/grooming/components/GroomingModuleHeader";
import { useBranchOptions } from "@/features/inventory/hooks/useBranchOptions";
import { Can } from "@/features/permissions";
import { roomTypeHolds } from "@/features/services/components/HotelRoomTypesField";
import { useHotelRoomTypes } from "@/hooks/useHotelRoomTypes";
import { usePersistentState } from "@/hooks/usePersistentState";
import { usePetOptions } from "@/hooks/usePetOptions";
import type { HotelRoomType } from "@/types/api";

import { HOTEL_LINE } from "../line";
import { HOTEL_SETTINGS_PATH, hotelRoomTypePath } from "../paths";

/**
 * Layanan › Hotel › Pengaturan › Tipe kamar (21 November 2026). Every branch's
 * room types on one list — a small set, loaded whole. A row opens its form.
 */
export function HotelRoomTypesScreen() {
  const router = useRouter();
  const { items, loading, error, reload } = useHotelRoomTypes();
  const { branches } = useBranchOptions();
  const petOptions = usePetOptions();
  const [query, setQuery] = usePersistentState("hotel.roomTypes.filters", {
    search: "",
    branchId: "",
  });

  const branchName = (id: string) =>
    branches.find((branch) => branch._id === id)?.name ?? "—";
  const species = (ids: string[]) =>
    ids
      .map(
        (id) =>
          petOptions.ordered("species").find((option) => option._id === id)
            ?.label,
      )
      .filter(Boolean)
      .join(", ") || "—";

  const needle = query.search.trim().toLowerCase();
  const rows = items.filter(
    (row) =>
      (!query.branchId || row.branchId === query.branchId) &&
      (!needle ||
        row.name.toLowerCase().includes(needle) ||
        (row.mode === "numbered" &&
          row.units.some((unit) => unit.code.toLowerCase().includes(needle)))),
  );
  const filtered = Boolean(needle || query.branchId);

  const columns: DataTableColumn<HotelRoomType>[] = [
    {
      id: "name",
      header: "Tipe kamar",
      cell: (row) => (
        <>
          <span className="block text-sm font-semibold text-foreground">
            {row.name}
          </span>
          <span className="block text-xs text-muted">
            {branchName(row.branchId)}
          </span>
        </>
      ),
    },
    {
      id: "mode",
      header: "Cara menampung",
      cell: (row) => (
        <Badge
          variant="outline"
          className={
            row.mode === "zone"
              ? "border-transparent bg-tint-warning text-warning"
              : "border-transparent bg-tint-brand text-primary"
          }
        >
          {row.mode === "zone" ? "Zona kapasitas" : "Kamar bernomor"}
        </Badge>
      ),
    },
    {
      id: "holds",
      header: "Kamar / batas",
      cellClassName: "text-sm",
      cell: (row) => (
        <>
          <span className="block">{roomTypeHolds(row)}</span>
          {row.mode === "numbered" && (
            <span className="block text-xs tabular-nums text-muted">
              {row.units.map((unit) => unit.code).join(", ")}
            </span>
          )}
        </>
      ),
    },
    {
      id: "species",
      header: "Untuk",
      cellClassName: "text-sm",
      cell: (row) => species(row.petTypeIds),
    },
    {
      id: "capacity",
      header: "Bisa dipakai",
      align: "right",
      cellClassName: "text-sm tabular-nums",
      cell: (row) => `${row.usableCapacity} hewan`,
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <Badge
          variant="outline"
          className={
            row.isActive
              ? "border-transparent bg-tint-success text-success"
              : "border-transparent bg-tint-neutral text-muted"
          }
        >
          {row.isActive ? "Aktif" : "Nonaktif"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <GroomingModuleHeader
        line={HOTEL_LINE}
        action={
          <Can feature="services" action="create">
            <Button asChild>
              <Link href={hotelRoomTypePath("new")}>
                <Plus className="size-4" />
                Tipe kamar baru
              </Link>
            </Button>
          </Can>
        }
      />

      <div className="flex items-center gap-3">
        <Link
          href={HOTEL_SETTINGS_PATH}
          aria-label="Kembali ke Pengaturan"
          className="flex size-11 flex-none items-center justify-center rounded-full border border-border bg-surface text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h2 className="text-lg font-bold text-foreground">
            Tipe kamar & kamar
          </h2>
          <p className="text-sm text-muted">
            Hotel rumahan tidak perlu nomor kamar — pilih Zona kapasitas dan isi
            batas jumlah hewannya.
          </p>
        </div>
      </div>

      {error ? (
        <Alert variant="error">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={reload}
            >
              Muat ulang
            </Button>
          </span>
        </Alert>
      ) : (
        <Card>
          <div className="flex flex-col gap-4">
            <FilterBar
              searchPlacement="leading"
              searchClassName="min-w-[12rem] flex-1"
              search={
                <FilterSearch
                  value={query.search}
                  onChange={(search) =>
                    setQuery((prev) => ({ ...prev, search }))
                  }
                  placeholder="Cari tipe kamar atau nomor kamar…"
                  ariaLabel="Cari tipe kamar"
                  fill
                />
              }
            >
              <FilterSelect
                label="Cabang"
                ariaLabel="Filter cabang"
                value={query.branchId}
                options={withAll(namedOptions(branches), "Semua cabang")}
                onChange={(branchId) =>
                  setQuery((prev) => ({ ...prev, branchId }))
                }
              />
            </FilterBar>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row._id}
              loading={loading}
              loadingLabel="Memuat tipe kamar…"
              onRowClick={(row) => router.push(hotelRoomTypePath(row._id))}
              empty={
                filtered ? (
                  <span>
                    Tidak ada tipe kamar yang cocok dengan filter ini.
                  </span>
                ) : (
                  <span>
                    Belum ada tipe kamar. Tambah yang pertama lewat{" "}
                    <b>Tipe kamar baru</b> →
                  </span>
                )
              }
            />
          </div>
        </Card>
      )}
    </div>
  );
}
