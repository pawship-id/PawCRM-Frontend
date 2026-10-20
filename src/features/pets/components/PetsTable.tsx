"use client";

import { useState } from "react";
import Link from "next/link";
import { EllipsisVertical, Eye, Pencil, Trash2, RotateCcw } from "lucide-react";

import { ApiError } from "@/services/api-error";
import { petService } from "@/services/pet.service";
import { swalToast } from "@/lib/swal";
import {
  ConfirmDialog,
  DataTable,
  HighlightText,
  type DataTableColumn,
  type SortOptions,
} from "@/components";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Can, usePermissions } from "@/features/permissions";
import { usePetOptions } from "@/hooks/usePetOptions";
import type { Pet, PetSort } from "@/types/api";

import { PetAvatar } from "./PetAvatar";
import { PetSpeciesBadge, PetStatusBadge } from "./PetBadges";

/** The row action that opens a confirm dialog, plus the pet it targets. */
type PendingAction = { kind: "delete" | "restore"; pet: Pet } | null;

/**
 * Whole years since `birthDate`, or null when it is unknown.
 *
 * DERIVED AT READ TIME, never stored — an age written into a record is wrong the
 * day after it is written. Whole years only: a month-precise age reads as
 * clinical precision this screen does not have, since a birth date is very often
 * the owner's best guess.
 */
function ageInYears(birthDate: string | null): number | null {
  if (!birthDate) return null;

  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;

  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const monthDelta = now.getMonth() - born.getMonth();
  // Not yet past this year's birthday — the subtraction above counted a year
  // that has not happened.
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) {
    years -= 1;
  }

  return years < 0 ? null : years;
}

/**
 * THE LIST SORTS FROM ITS COLUMN HEADERS (BO, 20 October 2026), on the server:
 * each sortable column maps to the two names PET_SORTS knows for it, and a
 * click re-fetches page 1.
 *
 *   Nama  — the name, A first.
 *   Umur  — by the birth date the age is derived from, OLDEST FIRST on the
 *           first click (`ageDesc`), youngest on the second.
 *   Berat — the stored weight, heaviest first.
 *
 * A pet with no birth date or no weight shows "—" and sits at the END of the
 * Umur / Berat orderings in both directions — the server reads them in two
 * segments so the dashes never open the list. Jenis, Ras, Status and Aksi are
 * plain.
 */
const SORT_OPTIONS: SortOptions<PetSort> = {
  name: { asc: "nameAsc", desc: "nameDesc" },
  age: { asc: "ageAsc", desc: "ageDesc", first: "desc" },
  weight: { asc: "weightAsc", desc: "weightDesc", first: "desc" },
};

/**
 * The pet list table with its row actions.
 *
 * Read data flows in via props (from usePets); the lifecycle actions (delete,
 * restore) are owned here because they are local to a row: each opens a
 * ConfirmDialog, calls the matching service method, then asks the parent to
 * refetch via `onChanged`. Detail and Ubah are plain links to the per-pet
 * routes. All of it hangs off one kebab menu per row — see the Aksi cell.
 * Mirrors CustomersTable.
 */
export function PetsTable({
  pets,
  loading,
  onChanged,
  search,
  sort,
  onSortChange,
}: {
  pets: Pet[];
  loading: boolean;
  onChanged: () => void;
  /** Active search term, highlighted in the searchable cells (name, breed). */
  search?: string;
  /** The ordering the list is in — a PET_SORTS name. */
  sort: PetSort;
  onSortChange: (sort: PetSort) => void;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();
  /* Breed is stored as the tenant's option CODE; the cell shows its word. */
  const { label } = usePetOptions();

  /*
    A LIVE ROW ALWAYS HAS ONE — Detail, which needs no grant beyond the
    `pets:read` this table already required. Only a DELETED row can come up
    empty: there is no profile to open for one, so the column is worth drawing
    only if it can be restored. Mirrors CustomersTable.
  */
  const rowHasActions = (pet: Pet) =>
    pet.deletedAt === null || can("pets", "restore");
  const showActions = pets.some(rowHasActions);

  function closeDialog() {
    if (busy) return;
    setPending(null);
    setActionError(null);
  }

  async function runAction() {
    if (!pending) return;
    setBusy(true);
    setActionError(null);
    try {
      const { kind, pet } = pending;
      if (kind === "delete") await petService.remove(pet._id);
      else await petService.restore(pet._id);
      setPending(null);
      onChanged();
      swalToast(kind === "delete" ? "Hewan dihapus." : "Hewan dipulihkan.");
    } catch (error) {
      // The restore 409 ("owner has been deleted") is the one a user can act on,
      // and the API puts the actionable half in `reason`.
      setActionError(
        error instanceof ApiError
          ? (error.reason ?? error.message)
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  const columns: DataTableColumn<Pet>[] = [
    {
      id: "name",
      header: "Nama",
      cell: (pet) => (
        /*
          THE PHOTO IS IN THE NAME CELL, not a column of its own. A column would
          need a header, and the only honest word for it ("Foto") labels
          something most rows do not have — so the table would carry a heading
          for a mostly-empty column. Here it reads as part of the name, which is
          what it identifies.
        */
        <div className="flex items-center gap-2.5">
          <PetAvatar pet={pet} />
          <span className="font-medium text-foreground">
            <HighlightText text={pet.name} query={search} />
          </span>
        </div>
      ),
    },
    {
      id: "species",
      header: "Jenis",
      cell: (pet) => (
        <PetSpeciesBadge species={pet.species} label={pet.speciesLabel} />
      ),
    },
    {
      id: "breed",
      header: "Ras",
      cell: (pet) => (
        <span className="text-muted">
          {pet.breed ? (
            <HighlightText
              /*
                THE SERVER'S WORD FIRST (25 September 2026). `breed` is an
                option id now, so the old fallback to the stored value would
                print `66f1a2…` in the column — the response carries the
                resolved label for exactly this, and the hook only stands in
                while it is missing.
              */
              text={pet.breedLabel ?? label("breed", pet.breed) ?? "—"}
              query={search}
            />
          ) : (
            "—"
          )}
        </span>
      ),
    },
    {
      // tabular-nums, never font-mono — ui-rules §5. Keeps the column from
      // shifting as rows differ in digit width.
      id: "age",
      header: "Umur",
      cellClassName: "tabular-nums text-muted",
      cell: (pet) => {
        const age = ageInYears(pet.birthDate);
        return age === null ? "—" : `${age} th`;
      },
    },
    {
      id: "weight",
      header: "Berat",
      cellClassName: "tabular-nums text-muted",
      cell: (pet) => (pet.weightKg === null ? "—" : `${pet.weightKg} kg`),
    },
    {
      id: "status",
      header: "Status",
      cell: (pet) => (
        <PetStatusBadge isActive={pet.isActive} deleted={pet.deletedAt !== null} />
      ),
    },
  ];

  if (showActions) {
    columns.push({
      id: "actions",
      header: "Aksi",
      align: "right",
      cell: (pet) => {
        const deleted = pet.deletedAt !== null;

        return (
          /*
            ONE KEBAB PER ROW (28 September 2026, on request), matching
            CustomersTable and BranchesTable — the pattern this app already uses
            for a row with several things to do.

            DETAIL IS UNGATED beyond the `pets:read` this table already
            required, so a reader opens the menu and finds exactly one row
            rather than a menu opening onto nothing.
          */
          <div className="flex items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="size-9"
                  disabled={busy}
                  // Names the row: twenty identical "Aksi" buttons tell a
                  // screen reader nothing.
                  aria-label={`Aksi untuk ${pet.name}`}
                >
                  <EllipsisVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end">
                {deleted ? (
                  /*
                    A DELETED PET HAS NO PROFILE to open and nothing to edit —
                    restoring is the only move left, so it is the only row here.
                  */
                  <Can feature="pets" action="restore">
                    <DropdownMenuItem
                      onSelect={() => setPending({ kind: "restore", pet })}
                    >
                      <RotateCcw />
                      Pulihkan
                    </DropdownMenuItem>
                  </Can>
                ) : (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/master/pets/${pet._id}`}>
                        <Eye />
                        Detail
                      </Link>
                    </DropdownMenuItem>
                    <Can feature="pets" action="update">
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/master/pets/${pet._id}/edit`}>
                          <Pencil />
                          Ubah
                        </Link>
                      </DropdownMenuItem>
                    </Can>
                    <Can feature="pets" action="delete">
                      {/* Separated and tinted (BO, 20 October 2026): deleting
                          is the one item here that cannot be undone from the
                          row it sits in. Inside the gate, so a reader without
                          the grant gets no dangling rule. */}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setPending({ kind: "delete", pet })}
                      >
                        <Trash2 />
                        Hapus
                      </DropdownMenuItem>
                    </Can>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    });
  }

  return (
    <>
      <DataTable
        columns={columns}
        rows={pets}
        rowKey={(pet) => pet._id}
        sort={{ value: sort, options: SORT_OPTIONS, onChange: onSortChange }}
        loading={loading}
        loadingLabel="Memuat daftar hewan…"
        empty={
          <p className="py-10 text-center text-sm text-muted">
            Belum ada hewan yang cocok dengan filter ini.
          </p>
        }
      />

      {pending && (
        <ConfirmDialog
          title={pending.kind === "delete" ? "Hapus hewan" : "Pulihkan hewan"}
          confirmLabel={pending.kind === "delete" ? "Hapus" : "Pulihkan"}
          destructive={pending.kind === "delete"}
          busy={busy}
          error={actionError}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending.kind === "delete" ? (
            <>
              Hapus <strong>{pending.pet.name}</strong>? Datanya disembunyikan
              dari daftar dan bisa dipulihkan lagi nanti. Kalau hewannya sudah
              tidak dirawat lagi — pindah rumah atau meninggal — lebih tepat
              ditandai nonaktif lewat Ubah, supaya riwayat groomingnya tetap
              ada.
            </>
          ) : (
            <>
              Pulihkan <strong>{pending.pet.name}</strong>? Ini gagal kalau
              pemiliknya sudah dihapus — pulihkan pelanggannya dulu.
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
