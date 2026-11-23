"use client";

import Link from "next/link";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HOTEL_ROOM_TYPES_PATH } from "@/features/hotel/paths";
import { useHotelRoomTypes } from "@/hooks/useHotelRoomTypes";
import { usePetOptions } from "@/hooks/usePetOptions";
import { cn } from "@/lib/utils";
import type { Branch, HotelRoomType } from "@/types/api";

/** "8 kamar · 1 hewan per kamar" / "Maks 6 hewan" — how a room type holds animals. */
export function roomTypeHolds(roomType: HotelRoomType): string {
  if (roomType.mode === "zone") {
    return `Maks ${roomType.capacity} hewan${roomType.closed ? " · sedang perbaikan" : ""}`;
  }
  const repair = roomType.units.filter((unit) => unit.underRepair).length;
  return `${roomType.units.length} kamar · ${roomType.petsPerUnit} hewan per kamar${
    repair ? ` · ${repair} perbaikan` : ""
  }`;
}

/** "kucing", "kucing & anjing", "kucing, anjing & kelinci". */
function joinKinds(labels: string[]): string {
  const words = labels.map((label) => label.toLowerCase());
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} & ${words[words.length - 1]}`;
}

/**
 * A HOTEL service's "Berlaku untuk" — the room types a stay of it may be put
 * in (21 November 2026, PLAN-Hotel-V1.md §4.1). Room types are kept in Layanan
 * › Hotel › Pengaturan; one the service already lists stays shown while it is
 * off, so unticking it is still possible.
 *
 * CARDS, three to a row on a wide screen (23 November 2026, BO): name, branch
 * and how it holds animals, and which jenis hewan it takes.
 */
export function HotelRoomTypesField({
  value,
  onChange,
  branches,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  branches: Branch[];
  disabled?: boolean;
}) {
  const { items, loading, error, reload } = useHotelRoomTypes();
  const shown = items.filter((roomType) => roomType.isActive || value.includes(roomType._id));
  const branchName = (id: string) => branches.find((branch) => branch._id === id)?.name ?? "Cabang";
  const petOptions = usePetOptions();
  const kinds = (ids: string[]) =>
    joinKinds(ids.map((id) => petOptions.label("species", id) ?? "").filter(Boolean));

  return (
    <div>
      <p className="text-sm font-medium">Tipe kamar</p>

      {error ? (
        <Alert variant="error" className="mt-2">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button type="button" variant="secondary" size="sm" onClick={reload}>
              Muat ulang
            </Button>
          </span>
        </Alert>
      ) : loading && items.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted">
          <Spinner size={16} /> Memuat tipe kamar…
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-2 rounded-lg bg-tint-neutral px-4 py-3 text-sm text-muted">
          Belum ada tipe kamar.{" "}
          <Link
            href={HOTEL_ROOM_TYPES_PATH}
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            Tambah di Hotel › Pengaturan →
          </Link>
        </p>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((roomType) => {
            const checked = value.includes(roomType._id);
            const takes = kinds(roomType.petTypeIds);
            return (
              <label
                key={roomType._id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 transition",
                  checked ? "border-primary bg-surface-selected" : "border-border bg-surface",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) =>
                    onChange(
                      next === true
                        ? [...value, roomType._id]
                        : value.filter((id) => id !== roomType._id),
                    )
                  }
                  disabled={disabled}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    {roomType.name}
                    {roomType.isActive ? "" : " (nonaktif)"}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {branchName(roomType.branchId)} · {roomTypeHolds(roomType)}
                  </span>
                  {takes && (
                    <span className="mt-0.5 block text-xs text-muted">Untuk {takes}</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
