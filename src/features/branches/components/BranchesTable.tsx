"use client";

import { useState } from "react";
import Link from "next/link";
import { EllipsisVertical, Eye, Pencil, Trash2, RotateCcw } from "lucide-react";

import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { swalToast } from "@/lib/swal";
import { ConfirmDialog, HighlightText } from "@/components";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import type { Branch } from "@/types/api";

import { BranchStatusBadge } from "./BranchStatusBadge";

/** The row action that opens a confirm dialog, plus the branch it targets. */
type PendingAction = { kind: "delete" | "restore"; branch: Branch } | null;

/**
 * The branch list table (shadcn/ui Table) with its row actions.
 *
 * Read data flows in via props (from useBranches); the lifecycle actions
 * (delete, restore) are owned here because they are local to a row: each opens a
 * ConfirmDialog, calls the matching service method, and then asks the parent to
 * refetch via `onChanged`. Edit is a plain link to the per-branch route.
 */
export function BranchesTable({
  branches,
  loading,
  onChanged,
  search,
}: {
  branches: Branch[];
  loading: boolean;
  onChanged: () => void;
  /** Active search term, highlighted in the searchable cells (name, address). */
  search?: string;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  // Show the Actions column only when at least one CURRENTLY-LISTED row would
  // render a button — so a restore-only role sees the column while "show
  // deleted" is on (deleted rows → Restore) but not while it is off (live rows
  // → Edit/Delete, which that role lacks). Mirrors the per-button gating below.
  /*
    A LIVE ROW ALWAYS HAS ONE — the Detail link, which needs no grant beyond
    the `branches:read` this table already required (28 September 2026). Only a
    DELETED row can still come up empty: there is no detail page to offer for
    one, so the column is worth drawing only if it can be restored.
  */
  const rowHasActions = (branch: Branch) =>
    branch.deletedAt === null || can("branches", "restore");
  const showActions = branches.some(rowHasActions);

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
      const { kind, branch } = pending;
      if (kind === "delete") await branchService.remove(branch._id);
      else await branchService.restore(branch._id);
      setPending(null);
      onChanged();
      swalToast(kind === "delete" ? "Cabang dihapus." : "Cabang dipulihkan.");
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : "Ada yang tidak beres. Coba lagi, ya.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loading && branches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
        Tidak ada cabang yang cocok dengan filter ini.
        <br />
        Coba ubah filternya, atau reset untuk melihat semuanya.
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
              <TableHead>Alamat</TableHead>
              <TableHead>Telepon</TableHead>
              <TableHead>Status</TableHead>
              {showActions && (
                <TableHead className="text-right">Aksi</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((branch) => {
              const deleted = branch.deletedAt !== null;
              return (
                <TableRow key={branch._id}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      <HighlightText text={branch.name} query={search} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted">
                      {branch.address ? (
                        <HighlightText text={branch.address} query={search} />
                      ) : (
                        "—"
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted">
                      {branch.phone ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <BranchStatusBadge
                      isActive={branch.isActive}
                      deleted={deleted}
                    />
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      {/*
                        ONE KEBAB PER ROW (28 September 2026, on request),
                        matching PetOptionsTable — the pattern this app already
                        uses for a row with more than one thing to do.

                        DETAIL IS UNGATED beyond the `branches:read` this table
                        already required: `/cabang/:id` is the branch's
                        read-only page. Only Ubah and Hapus ask for a grant, so
                        a reader opens the menu and finds exactly one row in it
                        rather than a menu button that opens onto nothing.
                      */}
                      <div className="flex items-center justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="size-9"
                              disabled={busy}
                              // Names the row: twenty identical "Aksi" buttons
                              // tell a screen reader nothing.
                              aria-label={`Aksi untuk ${branch.name}`}
                            >
                              <EllipsisVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end">
                            {deleted ? (
                              /*
                                A DELETED BRANCH HAS NO DETAIL PAGE to open and
                                nothing to edit — restoring it is the only move
                                left, so it is the only row here.
                              */
                              <Can feature="branches" action="restore">
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setPending({ kind: "restore", branch })
                                  }
                                >
                                  <RotateCcw />
                                  Pulihkan
                                </DropdownMenuItem>
                              </Can>
                            ) : (
                              <>
                                <DropdownMenuItem asChild>
                                  <Link
                                    href={`/dashboard/pengaturan/cabang/${branch._id}`}
                                  >
                                    <Eye />
                                    Detail
                                  </Link>
                                </DropdownMenuItem>
                                <Can feature="branches" action="update">
                                  <DropdownMenuItem asChild>
                                    <Link
                                      href={`/dashboard/pengaturan/cabang/${branch._id}/edit`}
                                    >
                                      <Pencil />
                                      Ubah
                                    </Link>
                                  </DropdownMenuItem>
                                </Can>
                                <Can feature="branches" action="delete">
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() =>
                                      setPending({ kind: "delete", branch })
                                    }
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
          title={pending.kind === "delete" ? "Hapus cabang" : "Pulihkan cabang"}
          confirmLabel={pending.kind === "delete" ? "Hapus" : "Pulihkan"}
          destructive={pending.kind === "delete"}
          busy={busy}
          error={actionError}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending.kind === "delete" ? (
            <>
              Hapus <strong>{pending.branch.name}</strong>? Cabang ini akan
              hilang dari daftar dan namanya bisa dipakai lagi. Masih bisa
              dipulihkan nanti.
            </>
          ) : (
            <>
              Pulihkan <strong>{pending.branch.name}</strong>? Bisa gagal kalau
              namanya sudah dipakai cabang lain.
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
