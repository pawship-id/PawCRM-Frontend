"use client";

import type { StepGroup } from "../serviceSteps";
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
import { serviceStepService } from "@/services/serviceStep.service";
import { swalToast } from "@/lib/swal";
import type { ServiceStep } from "@/types/api";

import { reorderPatches } from "../sortOrder";
import { ListItemStatus } from "./ListItemStatus";

/**
 * One Kelompok layanan's tahapan and their row actions.
 *
 * PetOptionsTable's shape, kept on purpose — the two screens sit one card apart
 * and are used by the same person: rows arrive sorted and narrowed to one line,
 * writes that need no form are owned here (call, toast, ask the parent to
 * re-read), and renaming is handed up as `onRename` because it needs a field.
 *
 * ─── THE GRANTS ARE `services:*` ───────────────────────────────────────────
 *
 * A tahapan is part of what a service is, so the server gates the list on the
 * service grants (14 September 2026): update covers add, rename, reorder and
 * retire — POST included, so a service's Tahapan card can add a missing step
 * on the spot — while delete and restore keep their own.
 *
 * ─── DIPAKAI IS WHAT A RENAME REWRITES ─────────────────────────────────────
 *
 * `serviceCount` is how many live services of the line list the step. It is
 * the number a rename reaches and the number a delete is refused over, so it
 * sits beside the name rather than behind a click. A deleted row shows "—":
 * it is offered nowhere, and a count there would read as a use it still has.
 *
 * ─── ORDER IS DATA ─────────────────────────────────────────────────────────
 *
 * Naikkan / Turunkan swap `sortOrder` with the neighbour (`reorderPatches`),
 * and that is the order a service's picker offers. It is NOT the order of a
 * service's own tahapan, which each service keeps in `sessions`. Deleted rows
 * are skipped when finding a neighbour and cannot be moved.
 *
 * ─── ONE WRITE AT A TIME, RETIRE BEFORE DELETE ─────────────────────────────
 *
 * Every kebab is disabled while a write is in flight and while the list is
 * re-read — a second Naikkan against old `sortOrder`s would swap values no
 * longer there. Nonaktifkan needs no confirmation; Hapus confirms and says up
 * front that it is refused while services list the step, since for a step
 * anybody used that refusal is the normal outcome.
 */
export function ServiceStepsTable({
  line,
  rows,
  loading,
  onRename,
  onChanged,
}: {
  line: StepGroup;
  /** One kind's steps in display order — deleted ones only when shown. */
  rows: ServiceStep[];
  loading: boolean;
  onRename: (step: ServiceStep) => void;
  /** Re-read the screen's list and the app's shared one. */
  onChanged: () => void;
}) {
  const { can } = usePermissions();

  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ServiceStep | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const live = rows.filter((step) => step.deletedAt === null);

  // The Aksi column appears only when some LISTED row would have an item, so a
  // role that may only read gets no empty column and no kebab opening onto
  // nothing.
  const rowHasActions = (step: ServiceStep) =>
    step.deletedAt !== null
      ? can("services", "restore")
      : can("services", "update") || can("services", "delete");
  const showActions = rows.some(rowHasActions);

  /**
   * Runs a write that needs no form. RE-READS EVEN ON FAILURE: a move is two
   * requests, and when the second fails the first has already landed.
   */
  async function run(write: () => Promise<unknown>, done: string) {
    setWorking(true);
    setActionError(null);
    try {
      await write();
      swalToast(done);
    } catch (error) {
      // `fullMessage`: a restore refused because the name was reused says
      // which name in `reason`.
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

  function move(step: ServiceStep, offset: -1 | 1) {
    const from = live.findIndex((row) => row._id === step._id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= live.length) return;

    void run(async () => {
      // In sequence, so a refusal stops the second write instead of racing it.
      for (const [target, sortOrder] of reorderPatches(live, from, to)) {
        await serviceStepService.update(target._id, { sortOrder });
      }
    }, "Urutan tahapan disimpan.");
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
      await serviceStepService.remove(pendingDelete._id);
      setPendingDelete(null);
      onChanged();
      swalToast("Tahapan dihapus.");
    } catch (error) {
      // Verbatim, `fullMessage`: the 409's `reason` carries how many services
      // still list the step, which is the part that says what to do next.
      setDeleteError(
        error instanceof ApiError
          ? error.fullMessage
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const pendingUsedBy = pendingDelete?.serviceCount ?? 0;

  return (
    <>
      {actionError && <Alert variant="error">{actionError}</Alert>}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead className="text-right">Dipakai</TableHead>
              <TableHead>Status</TableHead>
              {showActions && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((step) => {
              const deleted = step.deletedAt !== null;
              const position = live.indexOf(step);

              return (
                <TableRow key={step._id}>
                  <TableCell
                    className={
                      deleted ? "text-muted" : "font-medium text-foreground"
                    }
                  >
                    {step.name}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    <UsedBy step={step} />
                  </TableCell>
                  <TableCell>
                    <ListItemStatus item={step} />
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      {rowHasActions(step) && (
                        <div className="flex items-center justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                className="size-9"
                                disabled={working || loading}
                                aria-label={`Aksi untuk ${step.name}`}
                              >
                                <EllipsisVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end">
                              {deleted ? (
                                <Can feature="services" action="restore">
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      void run(
                                        () => serviceStepService.restore(step._id),
                                        "Tahapan dipulihkan.",
                                      )
                                    }
                                  >
                                    <RotateCcw />
                                    Pulihkan
                                  </DropdownMenuItem>
                                </Can>
                              ) : (
                                <>
                                  <Can feature="services" action="update">
                                    <DropdownMenuItem
                                      onSelect={() => onRename(step)}
                                    >
                                      <Pencil />
                                      Ubah nama
                                    </DropdownMenuItem>
                                    {/* Disabled rather than hidden at the
                                        ends, so the menu keeps its shape. */}
                                    <DropdownMenuItem
                                      disabled={position === 0}
                                      onSelect={() => move(step, -1)}
                                    >
                                      <ArrowUp />
                                      Naikkan
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled={position === live.length - 1}
                                      onSelect={() => move(step, 1)}
                                    >
                                      <ArrowDown />
                                      Turunkan
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        void run(
                                          () =>
                                            serviceStepService.update(step._id, {
                                              isActive: !step.isActive,
                                            }),
                                          step.isActive
                                            ? "Tahapan dinonaktifkan."
                                            : "Tahapan diaktifkan.",
                                        )
                                      }
                                    >
                                      {step.isActive ? (
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
                                  <Can feature="services" action="delete">
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onSelect={() => setPendingDelete(step)}
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
          title="Hapus tahapan"
          confirmLabel="Hapus"
          destructive
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={closeDelete}
        >
          Hapus <strong>{pendingDelete.name}</strong> dari tahapan {line.name}?
          Hapusnya ditolak selama masih ada layanan yang memakainya
          {pendingUsedBy > 0 ? ` — sekarang ${pendingUsedBy} layanan` : ""}.
          Kalau cuma mau berhenti menawarkannya, pilih{" "}
          <strong>Nonaktifkan</strong> saja — layanan yang sudah memakainya
          tetap.
        </ConfirmDialog>
      )}
    </>
  );
}

/** "3 layanan", or a word for none — never a bare 0 in a column of phrases. */
function UsedBy({ step }: { step: ServiceStep }) {
  if (step.deletedAt !== null || step.serviceCount === undefined) {
    return <span className="text-muted">—</span>;
  }
  if (step.serviceCount === 0) {
    return <span className="text-muted">Belum dipakai</span>;
  }
  return <span className="text-foreground">{step.serviceCount} layanan</span>;
}
