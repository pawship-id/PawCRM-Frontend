"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, RotateCcw } from "lucide-react";

import { ApiError } from "@/services/api-error";
import { petService } from "@/services/pet.service";
import { swalToast } from "@/lib/swal";
import { ConfirmDialog, HighlightText } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can, usePermissions } from "@/features/permissions";
import type { Pet } from "@/types/api";

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
 * The pet list table with its row actions.
 *
 * Read data flows in via props (from usePets); the lifecycle actions (delete,
 * restore) are owned here because they are local to a row: each opens a
 * ConfirmDialog, calls the matching service method, then asks the parent to
 * refetch via `onChanged`. Edit is a plain link to the per-pet route. Mirrors
 * CustomersTable.
 */
export function PetsTable({
  pets,
  loading,
  onChanged,
  search,
}: {
  pets: Pet[];
  loading: boolean;
  onChanged: () => void;
  /** Active search term, highlighted in the searchable cells (name, breed). */
  search?: string;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  // Show the Aksi column only when at least one CURRENTLY-LISTED row would
  // render a button — so a restore-only role sees the column while "show
  // deleted" is on but not while it is off. Mirrors the per-button gating below.
  const rowHasActions = (pet: Pet) =>
    pet.deletedAt !== null
      ? can("pets", "restore")
      : can("pets", "update") || can("pets", "delete");
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

  if (!loading && pets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
        Belum ada hewan yang cocok dengan filter ini.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Ras</TableHead>
              <TableHead>Umur</TableHead>
              <TableHead>Berat</TableHead>
              <TableHead>Status</TableHead>
              {showActions && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pets.map((pet) => {
              const deleted = pet.deletedAt !== null;
              const age = ageInYears(pet.birthDate);

              return (
                <TableRow key={pet._id}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      <HighlightText text={pet.name} query={search} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <PetSpeciesBadge species={pet.species} />
                  </TableCell>
                  <TableCell>
                    <span className="text-muted">
                      {pet.breed ? (
                        <HighlightText text={pet.breed} query={search} />
                      ) : (
                        "—"
                      )}
                    </span>
                  </TableCell>
                  {/* tabular-nums, never font-mono — ui-rules §5. Keeps the
                      column from shifting as rows differ in digit width. */}
                  <TableCell className="tabular-nums text-muted">
                    {age === null ? "—" : `${age} th`}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted">
                    {pet.weightKg === null ? "—" : `${pet.weightKg} kg`}
                  </TableCell>
                  <TableCell>
                    <PetStatusBadge isActive={pet.isActive} deleted={deleted} />
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {deleted ? (
                          <Can feature="pets" action="restore">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPending({ kind: "restore", pet })}
                            >
                              <RotateCcw className="size-4" />
                              Pulihkan
                            </Button>
                          </Can>
                        ) : (
                          <>
                            <Can feature="pets" action="update">
                              <Button variant="ghost" size="sm" asChild>
                                <Link href={`/dashboard/master/pets/${pet._id}`}>
                                  <Pencil className="size-4" />
                                  Ubah
                                </Link>
                              </Button>
                            </Can>
                            <Can feature="pets" action="delete">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-danger hover:bg-danger/10 hover:text-danger"
                                onClick={() => setPending({ kind: "delete", pet })}
                              >
                                <Trash2 className="size-4" />
                                Hapus
                              </Button>
                            </Can>
                          </>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

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
              ditandai tidak aktif lewat Ubah, supaya riwayat groomingnya tetap
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
