"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, RotateCcw } from "lucide-react";

import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { swalToast } from "@/lib/swal";
import { ConfirmDialog } from "@/components";
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
}: {
  branches: Branch[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  // Show the Actions column only when at least one CURRENTLY-LISTED row would
  // render a button — so a restore-only role sees the column while "show
  // deleted" is on (deleted rows → Restore) but not while it is off (live rows
  // → Edit/Delete, which that role lacks). Mirrors the per-button gating below.
  const rowHasActions = (branch: Branch) =>
    branch.deletedAt !== null
      ? can("branches", "restore")
      : can("branches", "update") || can("branches", "delete");
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
      swalToast(kind === "delete" ? "Branch deleted." : "Branch restored.");
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loading && branches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        No branches match the current filters.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>State</TableHead>
              {showActions && (
                <TableHead className="text-right">Actions</TableHead>
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
                      {branch.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">
                      {branch.address ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">
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
                    <div className="flex items-center justify-end gap-1">
                      {deleted ? (
                        <Can feature="branches" action="restore">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setPending({ kind: "restore", branch })
                            }
                          >
                            <RotateCcw className="size-4" />
                            Restore
                          </Button>
                        </Can>
                      ) : (
                        <>
                          <Can feature="branches" action="update">
                            <Button variant="ghost" size="sm" asChild>
                              <Link
                                href={`/dashboard/master/branches/${branch._id}`}
                              >
                                <Pencil className="size-4" />
                                Edit
                              </Link>
                            </Button>
                          </Can>
                          <Can feature="branches" action="delete">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger hover:bg-danger/10 hover:text-danger"
                              onClick={() =>
                                setPending({ kind: "delete", branch })
                              }
                            >
                              <Trash2 className="size-4" />
                              Delete
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
          title={pending.kind === "delete" ? "Delete branch" : "Restore branch"}
          confirmLabel={pending.kind === "delete" ? "Delete" : "Restore"}
          destructive={pending.kind === "delete"}
          busy={busy}
          error={actionError}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending.kind === "delete" ? (
            <>
              Delete <strong>{pending.branch.name}</strong>? It will be hidden
              from the list and its name freed for reuse. You can restore it
              later.
            </>
          ) : (
            <>
              Restore <strong>{pending.branch.name}</strong>? This may fail if
              its name has since been taken by another branch.
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
