"use client";

import Link from "next/link";

import { Alert, CheckRow, CheckRowGroup, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { HOTEL_ROOM_TYPES_PATH } from "@/features/hotel/paths";
import { useHotelRoomTypes } from "@/hooks/useHotelRoomTypes";
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

/**
 * A HOTEL service's "Berlaku untuk" — the room types a stay of it may be put
 * in (21 November 2026, PLAN-Hotel-V1.md §4.1). Room types are kept in Layanan
 * › Hotel › Pengaturan; one the service already lists stays shown while it is
 * off, so unticking it is still possible.
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

  return (
    <div>
      <p className="text-sm font-medium">Tipe kamar</p>
      <p className="mt-1 text-xs text-muted">
        Saat booking, layanan ini hanya bisa ditempatkan di tipe kamar yang dicentang.
      </p>

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
        <CheckRowGroup className="mt-2">
          {shown.map((roomType) => (
            <CheckRow
              key={roomType._id}
              label={`${roomType.name}${roomType.isActive ? "" : " (nonaktif)"}`}
              description={`${branchName(roomType.branchId)} · ${roomTypeHolds(roomType)}`}
              checked={value.includes(roomType._id)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...value, roomType._id]
                    : value.filter((id) => id !== roomType._id),
                )
              }
              disabled={disabled}
            />
          ))}
        </CheckRowGroup>
      )}
    </div>
  );
}
