"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  CircleOff,
  EllipsisVertical,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { Alert, ConfirmDialog } from "@/components";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can, usePermissions } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { petOptionService } from "@/services/petOption.service";
import { swalToast } from "@/lib/swal";
import type { PetOption, PetOptionType } from "@/types/api";

import { PET_OPTION_TYPE_WORDS } from "../petOptions";
import { reorderPatches } from "../sortOrder";
import { ListItemStatus } from "./ListItemStatus";

/**
 * One list of pet options and its row actions.
 *
 * Rows arrive sorted and already narrowed to one type; the writes that need no
 * form are owned here, on SupplierCategoriesTable's shape — call, toast, ask the
 * parent to re-read. Renaming needs a field, so it is handed up as `onRename`.
 *
 * ─── ORDER IS DATA ─────────────────────────────────────────────────────────
 *
 * Naikkan / Turunkan swap `sortOrder` with the neighbour (see `reorderPatches`)
 * and every picker in the app follows. It matters most for sizes — the price
 * grid and the commission rows read smallest first — so there is no separate
 * sort control: the table IS the order. Deleted rows, when shown, are skipped
 * when finding a neighbour and cannot be moved; they are offered nowhere, so
 * their position means nothing until they are restored.
 *
 * ─── ONE WRITE AT A TIME ───────────────────────────────────────────────────
 *
 * Every kebab is disabled while a row write is in flight AND while the list is
 * being re-read. A second Naikkan fired against the old `sortOrder`s would swap
 * values that are no longer there.
 *
 * ─── RETIRE BEFORE DELETE ──────────────────────────────────────────────────
 *
 * Nonaktifkan needs no confirmation: it is undone by the item that replaces it,
 * and records holding the code keep it. Hapus confirms, and its dialog says up
 * front that the server refuses while a pet or service still holds the code —
 * for a word anybody actually used, the refusal is the normal outcome, and
 * pointing at Nonaktifkan first is kinder than a 409 after.
 */
export function PetOptionsTable({
  type,
  rows,
  loading,
  onRename,
  onChanged,
}: {
  type: PetOptionType;
  /** One type's options in display order — deleted ones only when shown. */
  rows: PetOption[];
  loading: boolean;
  onRename: (option: PetOption) => void;
  /** Re-read the screen's list and the app's shared one. */
  onChanged: () => void;
}) {
  const { can } = usePermissions();
  const words = PET_OPTION_TYPE_WORDS[type];

  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PetOption | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const live = rows.filter((option) => option.deletedAt === null);

  // The Aksi column appears only when some LISTED row would have an item, so a
  // role that may only read gets no empty column and no kebab opening onto
  // nothing.
  const rowHasActions = (option: PetOption) =>
    option.deletedAt !== null
      ? can("petOptions", "restore")
      : can("petOptions", "update") || can("petOptions", "delete");
  const showActions = rows.some(rowHasActions);

  /**
   * Runs a write that needs no form. RE-READS EVEN ON FAILURE: a move is two
   * requests, and when the second one fails the first has already landed — the
   * list on screen must be the server's, not the one from before the click.
   */
  async function run(write: () => Promise<unknown>, done: string) {
    setWorking(true);
    setActionError(null);
    try {
      await write();
      swalToast(done);
    } catch (error) {
      // `fullMessage`: a restore refused because the name or code was reused
      // puts WHICH one in `reason`.
      setActionError(
        error instanceof ApiError
          ? error.fullMessage
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setWorking(false);
      onChanged();
    }
  }

  function move(option: PetOption, step: -1 | 1) {
    const from = live.findIndex((row) => row._id === option._id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= live.length) return;

    void run(async () => {
      // In sequence rather than in parallel, so a refusal stops the second
      // write instead of racing it.
      for (const [target, sortOrder] of reorderPatches(live, from, to)) {
        await petOptionService.update(target._id, { sortOrder });
      }
    }, `Urutan ${words.noun} disimpan.`);
  }

  function closeDelete() {
    if (deleting) return;
    setPendingDelete(null);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await petOptionService.remove(pendingDelete._id);
      setPendingDelete(null);
      onChanged();
      swalToast(`${words.title} dihapus.`);
    } catch (error) {
      // Verbatim, `fullMessage`: the 409's `reason` carries how many pets and
      // services still hold the code, which is the only part that says what to
      // do next.
      setDeleteError(
        error instanceof ApiError
          ? error.fullMessage
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {actionError && <Alert variant="error">{actionError}</Alert>}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Kode</TableHead>
              <TableHead>Status</TableHead>
              {showActions && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((option) => {
              const deleted = option.deletedAt !== null;
              const position = live.indexOf(option);

              return (
                <TableRow key={option._id}>
                  <TableCell
                    className={
                      deleted ? "text-muted" : "font-medium text-foreground"
                    }
                  >
                    {option.label}
                  </TableCell>
                  <TableCell className="text-sm text-muted tabular-nums">
                    {option.code}
                  </TableCell>
                  <TableCell>
                    <ListItemStatus item={option} />
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      {rowHasActions(option) && (
                        <div className="flex items-center justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                className="size-9"
                                disabled={working || loading}
                                // Names the row: twenty identical "Aksi"
                                // buttons tell a screen reader nothing.
                                aria-label={`Aksi untuk ${option.label}`}
                              >
                                <EllipsisVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end">
                              {deleted ? (
                                <Can feature="petOptions" action="restore">
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      void run(
                                        () => petOptionService.restore(option._id),
                                        `${words.title} dipulihkan.`,
                                      )
                                    }
                                  >
                                    <RotateCcw />
                                    Pulihkan
                                  </DropdownMenuItem>
                                </Can>
                              ) : (
                                <>
                                  <Can feature="petOptions" action="update">
                                    <DropdownMenuItem
                                      onSelect={() => onRename(option)}
                                    >
                                      <Pencil />
                                      Ubah nama
                                    </DropdownMenuItem>
                                    {/* Disabled rather than hidden at the
                                        ends, so the menu keeps its shape and
                                        says the list has an order. */}
                                    <DropdownMenuItem
                                      disabled={position === 0}
                                      onSelect={() => move(option, -1)}
                                    >
                                      <ArrowUp />
                                      Naikkan
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled={position === live.length - 1}
                                      onSelect={() => move(option, 1)}
                                    >
                                      <ArrowDown />
                                      Turunkan
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        void run(
                                          () =>
                                            petOptionService.update(option._id, {
                                              isActive: !option.isActive,
                                            }),
                                          option.isActive
                                            ? `${words.title} dinonaktifkan.`
                                            : `${words.title} diaktifkan.`,
                                        )
                                      }
                                    >
                                      {option.isActive ? (
                                        <>
                                          <CircleOff />
                                          Nonaktifkan
                                        </>
                                      ) : (
                                        <>
                                          <CircleCheck />
                                          Aktifkan
                                        </>
                                      )}
                                    </DropdownMenuItem>
                                  </Can>
                                  <Can feature="petOptions" action="delete">
                                    {/* Separated and tinted: everything above
                                        is undone by another click; this is
                                        not. */}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onSelect={() => setPendingDelete(option)}
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
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={`Hapus ${words.noun}`}
          confirmLabel="Hapus"
          destructive
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={closeDelete}
        >
          Hapus <strong>{pendingDelete.label}</strong> dari daftar {words.noun}?
          Hapusnya ditolak selama masih ada {words.heldBy} yang memakainya. Kalau
          cuma mau berhenti menawarkannya, pilih <strong>Nonaktifkan</strong>{" "}
          saja — data yang sudah ada tetap aman.
        </ConfirmDialog>
      )}
    </>
  );
}
